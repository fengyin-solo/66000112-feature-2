import { create } from 'zustand';
import { EEGData, BandPower, BrainState, CorrelationData, Recording, RecordingFrame, PlaybackState, BandViewMode, BandTrendWindow, BandTrendPoint } from '../types';
import {
  loadBandViewMode, loadBandTrendWindow, loadBandCompareChannel,
  persistBandViewMode, persistBandTrendWindow, persistBandCompareChannel,
  isValidBandPower, MAX_TREND_POINTS,
} from '../utils/bands';

const STORAGE_KEY = 'eeg_recordings';

const loadRecordings = (): Recording[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveRecordings = (recordings: Recording[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recordings));
  } catch {}
};

interface EEGState {
  eegData: EEGData | null;
  selectedChannel: string;
  bandPower: BandPower | null;
  isStreaming: boolean;
  brainState: BrainState | null;
  correlationData: CorrelationData | null;
  isRecording: boolean;
  recordingStartTime: number;
  currentRecordingFrames: RecordingFrame[];
  recordings: Recording[];
  playbackMode: boolean;
  activeRecording: Recording | null;
  playbackState: PlaybackState;
  bandViewMode: BandViewMode;
  bandTrendWindow: BandTrendWindow;
  bandCompareChannel: string | null;
  bandTrend: BandTrendPoint[];
  bandError: string | null;
  setEEGData: (d: EEGData | null) => void;
  setChannel: (c: string) => void;
  setBandPower: (b: BandPower | null) => void;
  setBandViewMode: (m: BandViewMode) => void;
  setBandTrendWindow: (w: BandTrendWindow) => void;
  setBandCompareChannel: (c: string | null) => void;
  setBandError: (msg: string | null) => void;
  pushBandTrendPoint: (point: BandTrendPoint) => void;
  clearBandTrend: () => void;
  setStreaming: (v: boolean) => void;
  setBrainState: (s: BrainState | null) => void;
  setCorrelationData: (c: CorrelationData | null) => void;
  startRecording: () => void;
  stopRecording: (name: string) => void;
  addRecordingFrame: (eeg: EEGData, bands: BandPower | null, brainState: BrainState, correlation: CorrelationData) => void;
  deleteRecording: (id: string) => void;
  enterPlaybackMode: (recording: Recording) => void;
  exitPlaybackMode: () => void;
  setPlaybackTime: (time: number) => void;
  togglePlayback: () => void;
  setPlaybackPlaying: (playing: boolean) => void;
}

export const useEEGStore = create<EEGState>((set, get) => ({
  eegData: null,
  selectedChannel: 'Fp1',
  bandPower: null,
  isStreaming: false,
  brainState: null,
  correlationData: null,
  isRecording: false,
  recordingStartTime: 0,
  currentRecordingFrames: [],
  recordings: loadRecordings(),
  playbackMode: false,
  activeRecording: null,
  playbackState: {
    isPlaying: false,
    currentTime: 0,
    currentFrame: null,
  },
  bandViewMode: loadBandViewMode(),
  bandTrendWindow: loadBandTrendWindow(),
  bandCompareChannel: loadBandCompareChannel(),
  bandTrend: [],
  bandError: null,
  setEEGData: (d) => set({ eegData: d }),
  // 切换通道立即清空频段结果与趋势，杜绝沿用上一通道的数据；时间窗口/对比通道等选择保留
  setChannel: (c) => set((state) => {
    if (c === state.selectedChannel) return {};
    if (state.playbackMode && state.activeRecording) {
      const match = state.activeRecording.channel === c;
      return {
        selectedChannel: c,
        bandTrend: [],
        bandPower: match && isValidBandPower(state.playbackState.currentFrame?.bands)
          ? state.playbackState.currentFrame!.bands
          : null,
        bandError: match ? null : `该录制仅包含 ${state.activeRecording.channel} 通道的频段数据`,
      };
    }
    return { selectedChannel: c, bandPower: null, bandTrend: [], bandError: null };
  }),
  setBandPower: (b) => set({ bandPower: b }),
  setBandViewMode: (m) => {
    persistBandViewMode(m);
    set({ bandViewMode: m });
  },
  setBandTrendWindow: (w) => {
    persistBandTrendWindow(w);
    set({ bandTrendWindow: w });
  },
  setBandCompareChannel: (c) => {
    persistBandCompareChannel(c);
    // 对比通道变化时清掉旧对比结果（bands 置 null 强制下一帧刷新），趋势另以 compareChannel 标记隔离
    set((state) => ({ bandCompareChannel: c, bandPower: null, bandError: null }));
  },
  setBandError: (msg) => set({ bandError: msg }),
  pushBandTrendPoint: (point) => set((state) => {
    const trend = [...state.bandTrend, point];
    return { bandTrend: trend.length > MAX_TREND_POINTS ? trend.slice(-MAX_TREND_POINTS) : trend };
  }),
  clearBandTrend: () => set({ bandTrend: [], bandError: null, bandPower: null }),
  setStreaming: (v) => set({ isStreaming: v }),
  setBrainState: (s) => set({ brainState: s }),
  setCorrelationData: (c) => set({ correlationData: c }),
  startRecording: () => {
    const { selectedChannel } = get();
    set({
      isRecording: true,
      recordingStartTime: Date.now(),
      currentRecordingFrames: [],
      playbackMode: false,
      activeRecording: null,
    });
  },
  stopRecording: (name: string) => {
    const { currentRecordingFrames, recordingStartTime, selectedChannel } = get();
    if (currentRecordingFrames.length === 0) {
      set({ isRecording: false, currentRecordingFrames: [] });
      return;
    }
    const endTime = Date.now();
    const duration = (endTime - recordingStartTime) / 1000;
    const newRecording: Recording = {
      id: `rec_${endTime}`,
      name: name || `录制 ${new Date(recordingStartTime).toLocaleString()}`,
      channel: selectedChannel,
      startTime: recordingStartTime,
      endTime,
      duration,
      frames: currentRecordingFrames,
    };
    const recordings = [...get().recordings, newRecording];
    saveRecordings(recordings);
    set({
      isRecording: false,
      recordingStartTime: 0,
      currentRecordingFrames: [],
      recordings,
    });
  },
  addRecordingFrame: (eeg, bands, brainState, correlation) => {
    const { isRecording, recordingStartTime, currentRecordingFrames } = get();
    if (!isRecording) return;
    const relativeTime = (Date.now() - recordingStartTime) / 1000;
    const frame: RecordingFrame = { relativeTime, eeg, bands, brainState, correlation };
    set({ currentRecordingFrames: [...currentRecordingFrames, frame] });
  },
  deleteRecording: (id) => {
    const recordings = get().recordings.filter(r => r.id !== id);
    saveRecordings(recordings);
    const { activeRecording } = get();
    if (activeRecording?.id === id) {
      set({ recordings, playbackMode: false, activeRecording: null });
    } else {
      set({ recordings });
    }
  },
  enterPlaybackMode: (recording) => {
    if (recording.frames.length === 0) return;
    const { selectedChannel } = get();
    const channelMatch = recording.channel === selectedChannel;
    const firstBands = channelMatch && isValidBandPower(recording.frames[0].bands)
      ? recording.frames[0].bands
      : null;
    set({
      playbackMode: true,
      activeRecording: recording,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        currentFrame: recording.frames[0],
      },
      eegData: recording.frames[0].eeg,
      // 回放下只展示录制通道自身的频段；通道不匹配或数据缺失时置空，不复用进入前的结果
      bandPower: firstBands,
      bandTrend: [],
      bandError: firstBands
        ? null
        : channelMatch
          ? '该录制缺少频段数据'
          : `该录制仅包含 ${recording.channel} 通道的频段数据`,
      brainState: recording.frames[0].brainState,
      correlationData: recording.frames[0].correlation,
    });
  },
  exitPlaybackMode: () => {
    // 退出回放后等待实时帧重新填充，避免回放数据残留；时间窗口/视图/对比通道选择保持
    set({
      playbackMode: false,
      activeRecording: null,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        currentFrame: null,
      },
      bandPower: null,
      bandTrend: [],
      bandError: null,
    });
  },
  setPlaybackTime: (time) => {
    const { activeRecording } = get();
    if (!activeRecording || activeRecording.frames.length === 0) return;
    const frames = activeRecording.frames;
    let frameIndex = 0;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].relativeTime <= time) {
        frameIndex = i;
      } else {
        break;
      }
    }
    const frame = frames[frameIndex];
    const { activeRecording: rec, selectedChannel } = get();
    const channelMatch = rec!.channel === selectedChannel;
    const bands = channelMatch && isValidBandPower(frame.bands) ? frame.bands : null;
    set({
      playbackState: {
        ...get().playbackState,
        currentTime: time,
        currentFrame: frame,
      },
      eegData: frame.eeg,
      bandPower: bands,
      bandError: bands
        ? null
        : channelMatch
          ? '当前回放帧缺少频段数据'
          : `该录制仅包含 ${rec!.channel} 通道的频段数据`,
      brainState: frame.brainState,
      correlationData: frame.correlation,
    });
  },
  togglePlayback: () => {
    const { playbackState } = get();
    set({
      playbackState: {
        ...playbackState,
        isPlaying: !playbackState.isPlaying,
      },
    });
  },
  setPlaybackPlaying: (playing) => {
    set({
      playbackState: {
        ...get().playbackState,
        isPlaying: playing,
      },
    });
  },
}));
