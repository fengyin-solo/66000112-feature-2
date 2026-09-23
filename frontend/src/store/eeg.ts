import { create } from 'zustand';
import { EEGData, BandPower, BandPowerPoint, BrainState, CorrelationData, Recording, RecordingFrame, PlaybackState } from '../types';
import { MAX_HISTORY_POINTS, TIME_WINDOWS, TimeWindow } from '../utils/bands';

const STORAGE_KEY = 'eeg_recordings';
const TIME_WINDOW_KEY = 'eeg_band_time_window';

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

const loadTimeWindow = (): TimeWindow => {
  try {
    const raw = localStorage.getItem(TIME_WINDOW_KEY);
    if (raw !== null) {
      const stored = Number(raw);
      if ((TIME_WINDOWS as readonly number[]).includes(stored)) return stored as TimeWindow;
    }
    // 首次进入：固化默认窗口，保证“返回再进入仍保持时间窗口”
    localStorage.setItem(TIME_WINDOW_KEY, '30');
  } catch {}
  return 30;
};

const saveTimeWindow = (window: TimeWindow) => {
  try {
    localStorage.setItem(TIME_WINDOW_KEY, String(window));
  } catch {}
};

const appendPoint = (history: BandPowerPoint[], point: BandPowerPoint): BandPowerPoint[] =>
  [...history, point].slice(-MAX_HISTORY_POINTS);

interface EEGState {
  eegData: EEGData | null;
  selectedChannel: string;
  bandPower: BandPower | null;
  /** 各通道独立的频段能量趋势，通道间严格隔离，禁止跨通道沿用结果 */
  bandPowerHistory: Record<string, BandPowerPoint[]>;
  /** 当前时间窗口（秒），返回再进入页面仍保持 */
  timeWindow: TimeWindow;
  /** 对比通道（会话内有效）；为空表示不对比 */
  compareChannel: string | null;
  /** 当前通道频段数据刷新是否失败（后端缺字段/频段缺失等），刷新失败不沿用旧值 */
  bandError: string | null;
  /** 频段对比通道数据缺失时的软提示（主通道数据正常） */
  bandWarning: string | null;
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
  setEEGData: (d: EEGData | null) => void;
  setChannel: (c: string) => void;
  setBandPower: (b: BandPower | null) => void;
  setTimeWindow: (w: TimeWindow) => void;
  setCompareChannel: (c: string | null) => void;
  /** 记录一次与波形同节拍的频段结果：主通道与对比通道共享同一时间戳，通道间各自隔离 */
  recordBandPower: (channel: string, bands: BandPower, timestamp: number, compareChannel: string | null, compareBands: BandPower | null) => void;
  /** 主通道频段数据刷新失败：清空当前瞬时值并标记错误，不沿用上一通道/上一帧结果 */
  setBandError: (message: string | null) => void;
  setStreaming: (v: boolean) => void;
  setBrainState: (s: BrainState | null) => void;
  setCorrelationData: (c: CorrelationData | null) => void;
  startRecording: () => void;
  stopRecording: (name: string) => void;
  addRecordingFrame: (eeg: EEGData, bands: BandPower, brainState: BrainState, correlation: CorrelationData) => void;
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
  bandPowerHistory: {},
  timeWindow: loadTimeWindow(),
  compareChannel: null,
  bandError: null,
  bandWarning: null,
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
  setEEGData: (d) => set({ eegData: d }),
  setChannel: (c) => {
    if (c === get().selectedChannel) return;
    set((state) => ({
      selectedChannel: c,
      // 跨通道切换立即清空当前通道相关的瞬时结果与错误，禁止沿用上一通道结果
      eegData: null,
      bandPower: null,
      brainState: null,
      correlationData: null,
      bandError: null,
      bandWarning: null,
      // 对比通道与当前通道相同时自动取消；切走后再切回可重新选择
      compareChannel: state.compareChannel === c ? null : state.compareChannel,
    }));
  },
  setBandPower: (b) => set({ bandPower: b }),
  setTimeWindow: (w) => {
    saveTimeWindow(w);
    set({ timeWindow: w });
  },
  setCompareChannel: (c) => {
    const { selectedChannel } = get();
    set({ compareChannel: c && c !== selectedChannel ? c : null });
  },
  recordBandPower: (channel, bands, timestamp, compareChannel, compareBands) => {
    const point: BandPowerPoint = { timestamp, bands };
    set((state) => {
      const history = {
        ...state.bandPowerHistory,
        [channel]: appendPoint(state.bandPowerHistory[channel] ?? [], point),
      };
      let warning: string | null = null;
      if (compareChannel) {
        if (compareBands) {
          history[compareChannel] = appendPoint(
            state.bandPowerHistory[compareChannel] ?? [],
            { timestamp, bands: compareBands },
          );
        } else {
          // 对比频段缺失：不写入、不补零，仅提示
          warning = `对比通道 ${compareChannel} 频段数据缺失`;
        }
      }
      return {
        bandPower: bands,
        bandPowerHistory: history,
        bandError: null,
        bandWarning: warning,
      };
    });
  },
  setBandError: (message) => set({ bandPower: null, bandError: message, bandWarning: null }),
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
    set({
      playbackMode: true,
      activeRecording: recording,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        currentFrame: recording.frames[0],
      },
      eegData: recording.frames[0].eeg,
      bandPower: recording.frames[0].bands,
      brainState: recording.frames[0].brainState,
      correlationData: recording.frames[0].correlation,
    });
  },
  exitPlaybackMode: () => {
    set({
      playbackMode: false,
      activeRecording: null,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        currentFrame: null,
      },
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
    set({
      playbackState: {
        ...get().playbackState,
        currentTime: time,
        currentFrame: frame,
      },
      eegData: frame.eeg,
      bandPower: frame.bands,
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
