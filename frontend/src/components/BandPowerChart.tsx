import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { useEEGStore } from '../store/eeg';
import { BandName, BandTrendPoint } from '../types';
import {
  ALL_CHANNELS, CHANNEL_NAMES,
  BAND_NAMES, BAND_LABELS, BAND_COLORS, COMPARE_BAND_COLORS,
  BAND_TREND_WINDOWS, BAND_REFRESH_SEC,
} from '../utils/bandChart';

const navBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  fontSize: '12px',
  borderRadius: '14px',
  border: active ? '1px solid #1565c0' : '1px solid #cfd8dc',
  background: active ? '#1565c0' : '#fff',
  color: active ? '#fff' : '#546e7a',
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
});

const Swatch: React.FC<{ color: string; dashed?: boolean }> = ({ color, dashed }) => (
  <svg width="18" height="10" style={{ flexShrink: 0 }}>
    <line
      x1="0" y1="5" x2="18" y2="5"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeDasharray={dashed ? '4 3' : undefined}
    />
  </svg>
);

export const BandPowerChart: React.FC = () => {
  const {
    bandPower, bandError, selectedChannel, playbackMode,
    bandViewMode, bandTrendWindow, bandCompareChannel, bandTrend,
    setBandViewMode, setBandTrendWindow, setBandCompareChannel,
    activeRecording, playbackState,
  } = useEEGStore();

  const channelName = CHANNEL_NAMES[selectedChannel] || selectedChannel;
  // 回放下没有对比通道的频段帧，趋势仅支持单通道
  const effectiveCompare = (!playbackMode && bandCompareChannel !== selectedChannel)
    ? bandCompareChannel
    : null;

  const trendRows = useMemo(() => {
    if (playbackMode) {
      if (!activeRecording || activeRecording.channel !== selectedChannel) return [];
      // 回放趋势：截至播放头、按时间窗口取尾段
      const head = playbackState.currentTime;
      return activeRecording.frames
        .filter(f => f.relativeTime <= head + 1e-6 && f.relativeTime >= head - bandTrendWindow)
        .map<BandTrendPoint>(f => ({
          t: f.relativeTime,
          channel: activeRecording.channel,
          bands: f.bands,
          compareChannel: null,
          compareBands: null,
        }));
    }
    // 实时趋势：按选定时间窗口截取（趋势点与波形 3s 刷新同帧）
    const points = bandTrend.filter(p => p.channel === selectedChannel);
    if (points.length === 0) return [];
    const latest = points[points.length - 1].t;
    return points.filter(p => latest - p.t <= bandTrendWindow - BAND_REFRESH_SEC / 2);
  }, [playbackMode, activeRecording, selectedChannel, playbackState.currentTime, bandTrend, bandTrendWindow]);

  const chartRows = useMemo(() => trendRows.map(p => {
    const row: Record<string, number | null> = { t: p.t };
    for (const name of BAND_NAMES) {
      // 某频段缺失（undefined）归一为 null：留空断点，绝不沿用上一帧值
      row[name] = p.bands && typeof p.bands[name] === 'number' ? p.bands[name] : null;
      row[`${name}Cmp`] = (effectiveCompare && p.compareChannel === effectiveCompare && p.compareBands
        && typeof p.compareBands[name] === 'number')
        ? p.compareBands[name]
        : null;
    }
    return row;
  }), [trendRows, effectiveCompare]);

  const hasAnyTrendValue = chartRows.some(r => BAND_NAMES.some(n => r[n] !== null));
  const compareHasData = effectiveCompare !== null &&
    chartRows.some(r => BAND_NAMES.some(n => r[`${n}Cmp`] !== null));

  const barData = BAND_NAMES.map((name) => ({
    name: BAND_LABELS[name],
    power: bandPower ? bandPower[name] : 0,
    color: BAND_COLORS[name],
  }));

  const formatAxisTime = (v: number) => {
    if (playbackMode) return `${Number(v).toFixed(0)}s`;
    const d = new Date(v * 1000);
    return d.toLocaleTimeString('zh-CN', { hour12: false, minute: '2-digit', second: '2-digit' });
  };

  const tooltipLabel = (v: number) => playbackMode
    ? `回放 ${Number(v).toFixed(1)}s`
    : new Date(v * 1000).toLocaleTimeString('zh-CN', { hour12: false });
  const tooltipFormatter = (value: unknown, name: unknown) => {
    if (value === null || value === undefined) return ['无数据', String(name)];
    const key = String(name);
    const isCmp = key.endsWith('Cmp');
    const bandName = (isCmp ? key.slice(0, -3) : key) as BandName;
    const label = BAND_LABELS[bandName] + (isCmp ? `（${effectiveCompare}）` : '');
    return [Number(value).toFixed(3), label];
  };

  const compareOptions = ['（不对比）', ...ALL_CHANNELS.filter(ch => ch !== selectedChannel)];
  const headerTag = playbackMode
    ? <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放模式</span>
    : <span style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 500 }}>● 实时</span>;

  return (
    <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '20px' }}>📊</span>
        <span>{selectedChannel}</span>
        <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>
          {channelName} · {bandViewMode === 'trend' ? '频段趋势' : '频段能量'}
        </span>
        {headerTag}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button style={navBtn(bandViewMode === 'instant')} onClick={() => setBandViewMode('instant')}>瞬时柱状</button>
          <button style={navBtn(bandViewMode === 'trend')} onClick={() => setBandViewMode('trend')}>频段趋势</button>
        </div>
      </h3>

      {bandViewMode === 'trend' && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>时间窗口</span>
            {BAND_TREND_WINDOWS.map(w => (
              <button key={w} style={navBtn(bandTrendWindow === w)} onClick={() => setBandTrendWindow(w)}>
                {w}s
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>对比通道</span>
            <select
              value={effectiveCompare ?? ''}
              disabled={playbackMode}
              onChange={(e) => setBandCompareChannel(e.target.value || null)}
              style={{
                padding: '4px 8px', fontSize: '12px', borderRadius: '6px',
                border: '1px solid #cfd8dc', background: playbackMode ? '#f5f5f5' : '#fff',
                color: playbackMode ? '#999' : '#333', cursor: playbackMode ? 'not-allowed' : 'pointer',
              }}
            >
              {compareOptions.map(ch => (
                <option key={ch} value={ch === '（不对比）' ? '' : ch}>
                  {ch === '（不对比）' ? ch : `${ch} ${CHANNEL_NAMES[ch] ?? ''}`}
                </option>
              ))}
            </select>
            {playbackMode && <span style={{ fontSize: '11px', color: '#999' }}>回放仅显示录制通道</span>}
          </div>
        </div>
      )}

      {/* 瞬时柱状：保持原有单通道展示 */}
      {bandViewMode === 'instant' && !bandPower && (
        <div style={{ color: '#999', padding: '40px 0', textAlign: 'center' }}>
          {bandError ? `${bandError}，等待数据中...` : '等待数据中...'}
        </div>
      )}
      {bandViewMode === 'instant' && bandPower && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => [Number(v).toFixed(3), '能量']} />
            <Bar dataKey="power" radius={[4, 4, 0, 0]}>
              {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* 频段趋势 */}
      {bandViewMode === 'trend' && !hasAnyTrendValue && (
        <div style={{ color: '#999', padding: '40px 0', textAlign: 'center' }}>
          {bandError ? `${bandError}，等待数据中...` : '等待频段趋势数据中...'}
        </div>
      )}
      {bandViewMode === 'trend' && hasAnyTrendValue && (
        <>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10 }}
                tickFormatter={formatAxisTime}
                minTickGap={40}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip labelFormatter={tooltipLabel} formatter={tooltipFormatter} />
              {BAND_NAMES.map(name => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  name={BAND_LABELS[name]}
                  stroke={BAND_COLORS[name]}
                  dot={false}
                  strokeWidth={1.8}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
              {effectiveCompare && BAND_NAMES.map(name => (
                <Line
                  key={`${name}Cmp`}
                  type="monotone"
                  dataKey={`${name}Cmp`}
                  name={`${BAND_LABELS[name]}Cmp`}
                  stroke={COMPARE_BAND_COLORS[name]}
                  dot={false}
                  strokeWidth={1.4}
                  strokeDasharray="5 4"
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* 图例与图表数据源同步：主通道实线、对比通道同色虚线 */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px', fontSize: '11px', color: '#555' }}>
            {BAND_NAMES.map(name => (
              <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Swatch color={BAND_COLORS[name]} />
                {BAND_LABELS[name]}
              </span>
            ))}
            {effectiveCompare && (
              <span style={{ width: '100%', display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px dashed #eee' }}>
                {BAND_NAMES.map(name => (
                  <span key={`${name}Cmp`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Swatch color={COMPARE_BAND_COLORS[name]} dashed />
                    {BAND_LABELS[name]}（{effectiveCompare}）
                  </span>
                ))}
              </span>
            )}
          </div>
          {effectiveCompare && !compareHasData && (
            <div style={{ fontSize: '11px', color: '#ef6c00', marginTop: '6px' }}>
              对比通道 {effectiveCompare}（{CHANNEL_NAMES[effectiveCompare] || effectiveCompare}）的频段数据暂缺，该系列留空，不显示其他通道结果。
            </div>
          )}
        </>
      )}
    </div>
  );
};
