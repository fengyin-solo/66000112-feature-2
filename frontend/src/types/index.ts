export interface EEGData { channels: string[]; sample_rate: number; data: Record<string, number[]>; time: number[]; duration: number; }
export type BandName = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';
export interface BandPower { delta: number; theta: number; alpha: number; beta: number; gamma: number; }
export type BandViewMode = 'instant' | 'trend';
export type BandTrendWindow = 15 | 30 | 60;
export interface BandTrendPoint {
  t: number;
  channel: string;
  bands: BandPower | null;
  compareChannel: string | null;
  compareBands: BandPower | null;
}
export interface BrainState {
  focus: number;
  relaxation: number;
  fatigue: number;
  status: 'focused' | 'relaxed' | 'fatigued' | 'neutral';
  statusLabel: string;
  statusColor: string;
  timestamp: number;
}
export interface ChannelCorrelation {
  channel: string;
  targetChannel: string;
  correlation: number;
  coherence: number;
}
export interface CorrelationData {
  targetChannel: string;
  correlations: ChannelCorrelation[];
}

export interface RecordingFrame {
  relativeTime: number;
  eeg: EEGData;
  bands: BandPower | null;
  brainState: BrainState;
  correlation: CorrelationData;
}

export interface Recording {
  id: string;
  name: string;
  channel: string;
  startTime: number;
  endTime: number;
  duration: number;
  frames: RecordingFrame[];
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  currentFrame: RecordingFrame | null;
}
