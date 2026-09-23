import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useEEGStore } from '../store/eeg';
import { EEGData, BandPower, BrainState, CorrelationData } from '../types';
import { ALL_CHANNELS, CHANNEL_NAMES, validateBandPower } from '../utils/bands';
import axios from 'axios';

const SAMPLE_RATE = 256;

const generateMockEEG = (durationSec: number = 3.0): EEGData => {
  const length = Math.floor(SAMPLE_RATE * durationSec);
  const time: number[] = [];
  const data: Record<string, number[]> = {};
  for (let i = 0; i < length; i++) {
    time.push(i / SAMPLE_RATE);
  }
  for (const ch of ALL_CHANNELS) {
    const sig: number[] = [];
    const alphaFreq = 8 + Math.random() * 4;
    const betaFreq = 15 + Math.random() * 10;
    for (let i = 0; i < length; i++) {
      const t = i / SAMPLE_RATE;
      const value = 0.5 * Math.sin(2 * Math.PI * alphaFreq * t) +
                    0.3 * Math.sin(2 * Math.PI * betaFreq * t) +
                    0.2 * (Math.random() * 2 - 1);
      sig.push(value);
    }
    data[ch] = sig;
  }
  return { channels: ALL_CHANNELS, sample_rate: SAMPLE_RATE, data, time, duration: durationSec };
};

const computeBandPower = (): BandPower => {
  const total = 10 + Math.random() * 5;
  return {
    delta: total * (0.2 + Math.random() * 0.1),
    theta: total * (0.15 + Math.random() * 0.1),
    alpha: total * (0.25 + Math.random() * 0.15),
    beta: total * (0.3 + Math.random() * 0.15),
    gamma: total * (0.1 + Math.random() * 0.05),
  };
};

const computeBrainState = (bands: BandPower): BrainState => {
  const total = bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma + 1e-10;
  const betaRel = bands.beta / total;
  const alphaRel = bands.alpha / total;
  const thetaRel = bands.theta / total;
  const focus = Math.min(100, Math.max(0, betaRel * 300 + (Math.random() - 0.5) * 10));
  const relaxation = Math.min(100, Math.max(0, alphaRel * 300 + (Math.random() - 0.5) * 10));
  const fatigue = Math.min(100, Math.max(0, thetaRel * 300 + (Math.random() - 0.5) * 10));
  const scores = { focused: focus, relaxed: relaxation, fatigued: fatigue };
  const maxScore = Math.max(...Object.values(scores));
  let status: 'focused' | 'relaxed' | 'fatigued' | 'neutral' = 'neutral';
  let statusLabel = '平稳';
  let statusColor = '#757575';
  if (maxScore >= 50) {
    const maxKey = Object.keys(scores).find(k => scores[k as keyof typeof scores] === maxScore) as keyof typeof scores;
    status = maxKey;
    if (status === 'focused') { statusLabel = '专注'; statusColor = '#1976d2'; }
    else if (status === 'relaxed') { statusLabel = '放松'; statusColor = '#388e3c'; }
    else { statusLabel = '疲劳'; statusColor = '#d32f2f'; }
  }
  return {
    focus: Math.round(focus * 10) / 10,
    relaxation: Math.round(relaxation * 10) / 10,
    fatigue: Math.round(fatigue * 10) / 10,
    status,
    statusLabel,
    statusColor,
    timestamp: Date.now(),
  };
};

const computeCorrelation = (targetChannel: string, eegData: EEGData): CorrelationData => {
  const targetData = eegData.data[targetChannel];
  const correlations = ALL_CHANNELS.map(ch => {
    if (ch === targetChannel) {
      return { channel: ch, targetChannel, correlation: 1.0, coherence: 1.0 };
    }
    const chData = eegData.data[ch];
    let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0;
    const n = targetData.length;
    for (let i = 0; i < n; i++) {
      sumXY += targetData[i] * chData[i];
      sumX += targetData[i];
      sumY += chData[i];
      sumX2 += targetData[i] * targetData[i];
      sumY2 += chData[i] * chData[i];
    }
    const corr = (n * sumXY - sumX * sumY) /
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return {
      channel: ch,
      targetChannel,
      correlation: Math.round(corr * 10000) / 10000,
      coherence: Math.round((0.3 + Math.random() * 0.5) * 10000) / 10000,
    };
  });
  return { targetChannel, correlations };
};

export const WaveformChart: React.FC = () => {
  const {
    eegData, selectedChannel, compareChannel,
  } = useEEGStore();
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<number | null>(null);
  // 每次拉取递增序号，跨通道切换后丢弃过期响应，避免旧通道结果覆盖新通道
  const fetchSeqRef = useRef(0);

  const fetchEEG = async () => {
    const state = useEEGStore.getState();
    if (state.playbackMode) return;
    const seq = ++fetchSeqRef.current;
    const channel = state.selectedChannel;
    const compare = state.compareChannel;
    setLoading(true);
    let eeg: EEGData;
    let bands: BandPower | null;
    let compareBands: BandPower | null = null;
    let brainState: BrainState;
    let correlation: CorrelationData;
    let simulated = false;
    try {
      const params: Record<string, string | number> = { duration: 3 };
      if (compare) params.compare = compare;
      const { data } = await axios.get(`/api/eeg/sample/${channel}`, { params });
      eeg = data.eeg;
      bands = validateBandPower(data.bands);
      compareBands = compare ? validateBandPower(data.compareBands) : null;
      brainState = data.brainState;
      correlation = data.correlation;
    } catch {
      // 网络失败：生成属于当前请求通道的新数据，不读取自 store，绝不沿用上一通道结果
      eeg = generateMockEEG(3);
      bands = computeBandPower();
      if (compare) compareBands = computeBandPower();
      brainState = computeBrainState(bands);
      correlation = computeCorrelation(channel, eeg);
      simulated = true;
    }
    if (seq !== fetchSeqRef.current || useEEGStore.getState().selectedChannel !== channel) {
      setLoading(false);
      return;
    }
    state.setEEGData(eeg);
    state.setBrainState(brainState);
    state.setCorrelationData(correlation);
    if (!bands) {
      // 五频段缺失/非法：丢弃该帧频段结果，不补零、不沿用历史值
      state.setBandError('频段数据缺失或无效，请等待下一帧刷新');
    } else {
      // 与波形同节拍：同一时间戳写入主通道与对比通道的频段趋势
      state.recordBandPower(channel, bands, Date.now(), compare, compareBands);
      if (state.isRecording) {
        state.addRecordingFrame(eeg, bands, brainState, correlation);
      }
    }
    if (simulated) {
      // 离线演示数据提示（不影响波形与脑状态阅读）
      useEEGStore.setState({ bandWarning: compare ? '接口不可用，对比通道为模拟数据' : '接口不可用，当前为模拟数据' });
    }
    setLoading(false);
  };

  const playbackMode = useEEGStore((s) => s.playbackMode);
  const isRecording = useEEGStore((s) => s.isRecording);

  useEffect(() => {
    if (playbackMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    fetchSeqRef.current += 1; // 使进行中的旧请求失效
    fetchEEG();
    intervalRef.current = window.setInterval(fetchEEG, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel, compareChannel, playbackMode]);

  const chartData = eegData?.data[selectedChannel]?.map((v: number, i: number) => ({
    t: eegData.time[i]?.toFixed(3), value: v.toFixed(4)
  })) || [];

  const channelName = CHANNEL_NAMES[selectedChannel] || selectedChannel;

  return (
    <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px' }}>📈</span>
        <span>{selectedChannel}</span>
        <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>{channelName} · 波形图</span>
        {compareChannel && (
          <span style={{ fontSize: '12px', color: '#6a1b9a', fontWeight: 500 }}>对比 {compareChannel}</span>
        )}
        {isRecording && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#d32f2f', fontWeight: 500 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d32f2f', animation: 'pulse 1s infinite' }} />
            录制中
          </span>
        )}
        {playbackMode && (
          <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放模式</span>
        )}
        {loading && !playbackMode && <span style={{ fontSize: '12px', color: '#999' }}>刷新中...</span>}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <XAxis dataKey="t" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
          <Line type="monotone" dataKey="value" stroke="#1565c0" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
