import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useEEGStore } from '../store/eeg';
import { EEGData, BandPower, BrainState, CorrelationData } from '../types';
import { isValidBandPower } from '../utils/bands';
import axios from 'axios';

const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

const ALL_CHANNELS = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4', 'O1', 'O2'];
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
    eegData, selectedChannel, bandCompareChannel, playbackMode, isRecording,
  } = useEEGStore();
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const fetchEEG = async () => {
    const state = useEEGStore.getState();
    if (state.playbackMode) return;
    const channel = state.selectedChannel;
    // 对比通道与当前通道不能相同；相同视为未选择，避免出现两条完全一致的线
    const compareChannel = state.bandCompareChannel && state.bandCompareChannel !== channel
      ? state.bandCompareChannel
      : null;
    setLoading(true);
    let eeg: EEGData | null = null;
    let bands: BandPower | null = null;
    let brainState: BrainState | null = null;
    let correlation: CorrelationData | null = null;
    let compareBands: BandPower | null = null;
    let refreshFailed = false;
    try {
      const params: Record<string, number | string> = { duration: 3 };
      if (compareChannel) params.compare = compareChannel;
      const { data } = await axios.get(`/api/eeg/sample/${channel}`, { params });
      // 严格校验：主通道频段缺失/负载异常时不采纳后端结果，绝不沿用上一通道或上一帧
      if (data?.eeg && data?.brainState && data?.correlation) {
        eeg = data.eeg;
        bands = isValidBandPower(data.bands) ? data.bands : null;
        if (isValidBandPower(data.compareBands)) compareBands = data.compareBands;
        brainState = data.brainState;
        correlation = data.correlation;
      } else {
        refreshFailed = true;
      }
    } catch {
      // 离线降级：波形/脑状态沿用本地模拟，频段不伪造，置空并明确提示
      eeg = generateMockEEG(3);
      brainState = computeBrainState(computeBandPower());
      correlation = computeCorrelation(channel, eeg);
      refreshFailed = true;
    }
    // 防止慢响应在用户已切走通道/对比通道后写入，造成跨通道串数据
    const latest = useEEGStore.getState();
    if (latest.playbackMode || latest.selectedChannel !== channel) return;
    const latestCompare = latest.bandCompareChannel && latest.bandCompareChannel !== channel
      ? latest.bandCompareChannel
      : null;
    if ((latestCompare ?? null) !== (compareChannel ?? null)) return;

    latest.setEEGData(eeg);
    latest.setBrainState(brainState);
    latest.setCorrelationData(correlation);
    if (!bands) {
      latest.setBandPower(null);
      latest.setBandError(refreshFailed ? '频段刷新失败，等待下一帧重试' : '频段数据缺失，等待下一帧刷新');
    } else {
      latest.setBandPower(bands);
      latest.setBandError(null);
    }
    // 趋势点与波形同一刷新帧；bands 为 null 时仍压入断点（该时间窗无数据），不沿用旧值
    latest.pushBandTrendPoint({
      t: Date.now() / 1000,
      channel,
      bands,
      compareChannel: compareChannel && compareBands ? compareChannel : null,
      compareBands: compareChannel && compareBands ? compareBands : null,
    });
    if (latest.isRecording && bands && eeg && brainState && correlation) {
      latest.addRecordingFrame(eeg, bands, brainState, correlation);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (playbackMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    fetchEEG();
    intervalRef.current = window.setInterval(fetchEEG, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // 对比通道切换后立即拉取同一帧的双通道频段；切换会经 store 清空旧结果
  }, [selectedChannel, bandCompareChannel, playbackMode]);

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
