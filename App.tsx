import React, { useEffect, useState, useRef } from 'react';
import { LiveClient } from './services/liveClient';
import { ConnectionState, LogEntry } from './types';
import { Visualizer } from './components/Visualizer';
import { Mic, MicOff, Globe, Monitor, Clock, Terminal, Send } from 'lucide-react';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [volume, setVolume] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [lastToolAction, setLastToolAction] = useState<string>('');
  const [textInput, setTextInput] = useState('');
  
  const clientRef = useRef<LiveClient | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Theme listener
    const handleThemeChange = (e: CustomEvent) => {
      setIsDarkMode(e.detail === 'dark');
    };
    window.addEventListener('theme-change' as any, handleThemeChange);

    return () => {
        window.removeEventListener('theme-change' as any, handleThemeChange);
        clientRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
      if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
  }, [logs]);

  const initClient = () => {
      if (clientRef.current) return clientRef.current;
      const client = new LiveClient();
      clientRef.current = client;

      client.onStateChange = setConnectionState;
      client.onLog = (log) => setLogs(prev => [...prev, log]);
      client.onVolume = (vol) => setVolume(vol * 5); // Amplify for visual
      client.onToolAction = (action) => {
          setLastToolAction(action);
          setTimeout(() => setLastToolAction(''), 3000);
      };
      return client;
  };

  const toggleConnection = async () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
      clientRef.current?.disconnect();
      setConnectionState(ConnectionState.DISCONNECTED);
      return;
    }
    const client = initClient();
    await client.connect();
  };

  const handleSendText = async () => {
      if (!textInput.trim()) return;
      
      const text = textInput.trim();
      setTextInput(''); // Clear UI immediately

      const client = initClient();
      
      if (connectionState === ConnectionState.DISCONNECTED) {
          // Auto-connect if needed
          await client.connect();
      }
      
      // Send text (LiveClient handles queuing if connection is in progress)
      await client.sendText(text);
  };

  const bgColor = isDarkMode ? 'bg-[#0f172a]' : 'bg-gray-100';
  const textColor = isDarkMode ? 'text-gray-100' : 'text-gray-800';
  const cardColor = isDarkMode ? 'bg-[#1e293b]/50' : 'bg-white/80';
  const borderColor = isDarkMode ? 'border-gray-700' : 'border-gray-300';
  const inputBg = isDarkMode ? 'bg-gray-800/50' : 'bg-gray-100';

  return (
    <div className={`min-h-screen w-full transition-colors duration-500 ${bgColor} ${textColor} flex flex-col items-center justify-center p-4 overflow-hidden relative`}>
      
      {/* Background Ambience */}
      <div className={`absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none`}>
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500 rounded-full blur-[128px]"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-500 rounded-full blur-[128px]"></div>
      </div>

      <div className={`relative z-10 w-full max-w-md ${cardColor} backdrop-blur-xl border ${borderColor} rounded-3xl shadow-2xl overflow-hidden flex flex-col`} style={{height: '85vh'}}>
        
        {/* Header */}
        <div className="p-6 border-b border-gray-700/50 flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    ARYAN
                </h1>
                <p className="text-xs text-gray-400">Human Interface Unit v2.5</p>
            </div>
            <div className={`w-3 h-3 rounded-full ${connectionState === ConnectionState.CONNECTED ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
        </div>

        {/* Visualizer Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
            <Visualizer volume={volume} isActive={connectionState === ConnectionState.CONNECTED} />
            
            {/* Status Text */}
            <div className="absolute bottom-10 text-center">
                {connectionState === ConnectionState.CONNECTING && (
                    <span className="text-sm animate-pulse text-yellow-400">Establishing Uplink...</span>
                )}
                {connectionState === ConnectionState.CONNECTED && (
                    <span className="text-sm text-blue-300 font-mono">
                        {lastToolAction ? lastToolAction : "Listening..."}
                    </span>
                )}
                 {connectionState === ConnectionState.DISCONNECTED && (
                    <span className="text-sm text-gray-500">System Standby</span>
                )}
                {connectionState === ConnectionState.ERROR && (
                    <span className="text-sm text-red-500">Connection Error</span>
                )}
            </div>
        </div>

        {/* Capabilities Grid */}
        <div className="px-6 pb-2 grid grid-cols-4 gap-2 text-[10px] text-gray-500 font-mono opacity-60">
            <div className="flex flex-col items-center gap-1"><Globe size={14} /><span>WEB</span></div>
            <div className="flex flex-col items-center gap-1"><Monitor size={14} /><span>SYS</span></div>
            <div className="flex flex-col items-center gap-1"><Terminal size={14} /><span>CMD</span></div>
            <div className="flex flex-col items-center gap-1"><Clock size={14} /><span>TIME</span></div>
        </div>

        {/* Control Button */}
        <div className="p-4 flex justify-center">
            <button 
                onClick={toggleConnection}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                    connectionState === ConnectionState.CONNECTED 
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' 
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
                }`}
            >
                {connectionState === ConnectionState.CONNECTED ? <MicOff className="text-white" /> : <Mic className="text-white" />}
            </button>
        </div>

        {/* Text Input Area */}
         <div className="px-4 pb-2">
            <div className={`flex items-center gap-2 rounded-full ${inputBg} p-1 pr-2 border ${borderColor} transition-colors duration-300`}>
                <input 
                    type="text" 
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                    placeholder={connectionState === ConnectionState.CONNECTED ? "Type a command..." : "Type to start chat..."}
                    className="flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder-gray-500"
                />
                <button 
                    onClick={handleSendText}
                    disabled={!textInput.trim()}
                    className="p-2 bg-blue-500 rounded-full text-white hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
                >
                    <Send size={16} />
                </button>
            </div>
        </div>

        {/* Mini Log Console */}
        <div className={`h-32 ${isDarkMode ? 'bg-black/40' : 'bg-gray-200/50'} border-t ${borderColor} p-3 font-mono text-xs overflow-y-auto`} ref={scrollRef}>
            {logs.length === 0 && <div className="text-gray-500 italic">System initialization complete. Waiting for user input.</div>}
            {logs.map((log) => (
                <div key={log.id} className="mb-1 break-words">
                    <span className="text-gray-500">[{log.timestamp.toLocaleTimeString().split(' ')[0]}]</span>{' '}
                    <span className={`${
                        log.source === 'user' ? 'text-green-400' : 
                        log.source === 'ai' ? 'text-blue-400' : 
                        log.source === 'error' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                        {log.source.toUpperCase()}:
                    </span>{' '}
                    <span className={log.type === 'tool' ? 'text-purple-300' : ''}>
                        {log.message}
                    </span>
                </div>
            ))}
        </div>
      </div>
      
      <p className="mt-4 text-xs text-gray-500 max-w-md text-center">
          Note: "System Control" is simulated within browser security limits. Aryan can open tabs, change app themes, and search the web.
      </p>

    </div>
  );
};

export default App;