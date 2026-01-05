export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  source: 'user' | 'ai' | 'system' | 'error';
  message: string;
  type?: 'text' | 'tool' | 'error';
}

export interface ToolCallData {
  name: string;
  args: Record<string, any>;
  result?: any;
}

export interface VisualizerState {
  volume: number;
}