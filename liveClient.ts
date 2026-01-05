import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { createPcmBlob, base64ToUint8Array, decodeAudioData, arrayBufferToBase64 } from '../utils/audio';
import { ConnectionState, LogEntry } from '../types';

// Define tools
const openWebsiteDeclaration: FunctionDeclaration = {
  name: 'openWebsite',
  description: 'Opens a specific website URL in a new tab.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: { type: Type.STRING, description: 'The URL to open' },
    },
    required: ['url'],
  },
};

const setScreenModeDeclaration: FunctionDeclaration = {
  name: 'setScreenMode',
  description: 'Sets the application theme.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      mode: { type: Type.STRING, enum: ['light', 'dark'] },
    },
    required: ['mode'],
  },
};

const getSystemTimeDeclaration: FunctionDeclaration = {
  name: 'getSystemTime',
  description: 'Returns current system time.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const SYSTEM_INSTRUCTION = `
You are Aryan, a human-like assistant. 
You speak fluent Hindi and Urdu mixed with English.
You are NOT an AI. You are a helpful human.
Keep responses short and conversational.
`;

export class LiveClient {
  private ai: GoogleGenAI | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime: number = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private currentSession: Promise<any> | null = null;
  
  public onStateChange: (state: ConnectionState) => void = () => {};
  public onLog: (log: LogEntry) => void = () => {};
  public onVolume: (vol: number) => void = () => {};
  public onToolAction: (action: string) => void = () => {};

  constructor() {
    // Initialize lazily in connect
  }

  async connect() {
    this.onStateChange(ConnectionState.CONNECTING);

    try {
      // Re-initialize client to ensure fresh state/key
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });

      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        } 
      });

      // Connect to Gemini Live
      this.currentSession = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO], 
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, 
          },
          tools: [
            { functionDeclarations: [openWebsiteDeclaration, setScreenModeDeclaration, getSystemTimeDeclaration] }
          ],
        },
        callbacks: {
          onopen: () => {
            this.onStateChange(ConnectionState.CONNECTED);
            this.startAudioInput(stream);
            this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'system', message: 'Connected to Aryan.' });
          },
          onmessage: async (msg) => {
            await this.handleMessage(msg);
          },
          onclose: () => {
            this.onStateChange(ConnectionState.DISCONNECTED);
            this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'system', message: 'Connection closed.' });
            this.disconnect();
          },
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            this.onStateChange(ConnectionState.ERROR);
            this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'error', message: err.message || 'Network error' });
            this.disconnect();
          }
        }
      });

    } catch (error: any) {
      console.error("Connection failed", error);
      this.onStateChange(ConnectionState.ERROR);
      this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'error', message: error.message || 'Connection failed' });
      this.disconnect();
    }
  }

  private startAudioInput(stream: MediaStream) {
    if (!this.inputAudioContext || !this.currentSession) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.onVolume(rms);

      // Create Blob with correct sample rate
      const currentRate = this.inputAudioContext?.sampleRate || 16000;
      const pcmBlob = this.createPcmBlob(inputData, currentRate);
      
      this.currentSession?.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      }).catch(err => {
         // Session might be closed, ignore
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  async sendText(text: string) {
    if (this.currentSession) {
      try {
        const session = await this.currentSession;
        this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'user', message: text });
        
        // Use sendRealtimeInput with text/plain since session.send is not available
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const base64 = arrayBufferToBase64(data);

        session.sendRealtimeInput({
          media: {
            mimeType: 'text/plain',
            data: base64
          }
        });
      } catch (e: any) {
        console.error("Failed to send text", e);
        this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'error', message: `Failed to send text: ${e.message}` });
      }
    }
  }

  private createPcmBlob(data: Float32Array, sampleRate: number): { data: string, mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return {
      data: base64,
      mimeType: `audio/pcm;rate=${sampleRate}`,
    };
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data && this.outputAudioContext) {
      const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
      this.onVolume(0.5); 
      try {
        const audioBuffer = await decodeAudioData(
          base64ToUint8Array(base64Audio),
          this.outputAudioContext
        );
        this.playAudio(audioBuffer);
      } catch (e) {
        console.error("Audio decode error", e);
      }
    }

    if (message.serverContent?.interrupted) {
      this.stopAllAudio();
      this.onLog({ id: Date.now().toString(), timestamp: new Date(), source: 'system', message: 'Interrupted.' });
    }

    if (message.serverContent?.turnComplete) {
      this.onVolume(0);
    }

    if (message.toolCall) {
      this.handleToolCall(message.toolCall);
    }
  }

  private async handleToolCall(toolCall: any) {
      for (const fc of toolCall.functionCalls) {
        this.onLog({ 
          id: fc.id, 
          timestamp: new Date(), 
          source: 'ai', 
          message: `Executing: ${fc.name}`, 
          type: 'tool' 
        });

        let result: any = { status: 'ok' };
        try {
          if (fc.name === 'openWebsite') {
             const url = (fc.args as any).url;
             window.open(url, '_blank');
             result = { result: `Opened ${url}` };
             this.onToolAction(`Opened ${url}`);
          } else if (fc.name === 'setScreenMode') {
             const mode = (fc.args as any).mode;
             window.dispatchEvent(new CustomEvent('theme-change', { detail: mode }));
             result = { result: `Set mode to ${mode}` };
             this.onToolAction(`${mode} mode active`);
          } else if (fc.name === 'getSystemTime') {
             const time = new Date().toLocaleString();
             result = { time };
             this.onToolAction(`Time: ${time}`);
          }
        } catch (e: any) {
          result = { error: e.message };
        }

        this.currentSession?.then(session => {
          session.sendToolResponse({
            functionResponses: {
              id: fc.id,
              name: fc.name,
              response: { result }
            }
          });
        }).catch(() => {});
      }
  }

  private playAudio(buffer: AudioBuffer) {
    if (!this.outputAudioContext) return;

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputAudioContext.destination);

    const currentTime = this.outputAudioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }
    
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) {
          this.onVolume(0);
      }
    };
  }

  private stopAllAudio() {
    this.sources.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    this.sources.clear();
    if (this.outputAudioContext) {
        this.nextStartTime = this.outputAudioContext.currentTime;
    }
    this.onVolume(0);
  }

  disconnect() {
    this.stopAllAudio();
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    this.ai = null;
    this.currentSession = null;
  }
}