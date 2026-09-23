import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';
import { useEEGStore } from '../store/eeg';
import {
  ALL_CHANNELS, BAND_KEYS, BAND_LABELS, BAND_COLORS, TIME_WINDOWS, TimeWindow,
  channelDisplayName, buildTrendRows, buildPlaybackTrendRows,
} from '../utils/bands';

const cardStyle: React.CSSProperties = {
  padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
};
const headerStyle: React.CSSProperties = {
  margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
};

const emptyText: React.CSSProperties = { color: '#999', padding: '40px 0', textAlign: 'center' };

const pillBtn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: '14px', border: '1px solid #cfd8dc',
  background: '#fff', color: '#455a64', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
};
const pillBtnActive: React.CSSProperties = {
  ...pillBtn, border: '1px solid #1565c0', background: '#1565c0', color: '#fff', fontWeight: 700,
};

type ViewMode = 'trend' | 'instant';

interface LegendItem { label: string; color: string; dashed: boolean; pending?: boolean }

export const BandPowerChart: React.FC = () => {
  const {
    bandPower, bandPowerHistory, selectedChannel, compareChannel,
    timeWindow, setTimeWindow, setCompareChannel,
    playbackMode, activeRecording, bandError, bandWarning,
  } = useEEGStore();
  // 视图模式会话内保留；时间窗口通过 localStorage 在返回再进入后仍保持
  const [viewMode, setViewMode] = useState<ViewMode>('trend');
  const channelName = channelDisplayName(selectedChannel);

  /* ---------------- 瞬时柱状图数据（兼容原有单通道展示） ---------------- */
  const instantData = bandPower
    ? BAND_LABELS.map((label, i) => ({
        name: label,
        power: bandPower[BAND_KEYS[i]],
        color: BAND_COLORS[i],
      }))
    : [];

  /* ---------------- 频段趋势数据 ---------------- */
  let trendRows: Array<Record<string, number | string | undefined>> = [];
  let hasComparePoints = false;

  if (playbackMode && activeRecording) {
    // 回放：趋势直接来自录制帧（仅录制通道，回放不支持对比通道）
    trendRows = buildPlaybackTrendRows(activeRecording.frames);
  } else {
    const now = Date.now();
    const comparePoints = compareChannel ? (bandPowerHistory[compareChannel] ?? []) : [];
    trendRows = buildTrendRows(
      bandPowerHistory[selectedChannel] ?? [],
      comparePoints,
      now,
      timeWindow,
    );
    hasComparePoints = comparePoints.some((p) => p.timestamp >= now - timeWindow * 1000);
  }

  const hasPrimaryPoints = trendRows.length > 0;
  const showCompare = !playbackMode && !!compareChannel;

  /* ---------------- 图例：与图表线条同源，保证跨通道切换后同步 ---------------- */
  const legendItems: LegendItem[] = BAND_LABELS.map((label, i) => ({
    label, color: BAND_COLORS[i], dashed: false,
  }));
  if (showCompare) {
    BAND_LABELS.forEach((label, i) => {
      legendItems.push({
        label: `${compareChannel} ${label}`,
        color: BAND_COLORS[i],
        dashed: true,
        pending: !hasComparePoints,
      });
    });
  }

  const compareOptions = ALL_CHANNELS.filter((ch) => ch !== selectedChannel);

  const renderControls = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#78909c', marginRight: '2px' }}>时间窗口</span>
        {TIME_WINDOWS.map((w: TimeWindow) => (
          <button
            key={w}
            onClick={() => setTimeWindow(w)}
            style={timeWindow === w ? pillBtnActive : pillBtn}
          >
            {w}s
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#78909c' }}>对比通道</span>
        <select
          value={compareChannel ?? ''}
          onChange={(e) => setCompareChannel(e.target.value || null)}
          style={{
            padding: '4px 8px', borderRadius: '14px', border: '1px solid #cfd8dc',
            fontSize: '12px', color: '#455a64', background: '#fff', cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">不对比</option>
          {compareOptions.map((ch) => (
            <option key={ch} value={ch}>{ch} · {channelDisplayName(ch)}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderLegend = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: '10px' }}>
      {legendItems.map((item) => (
        <span
          key={item.label}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', color: item.pending ? '#b0bec5' : '#455a64',
          }}
        >
          <span
            style={{
              display: 'inline-block', width: '18px', height: 0,
              borderTop: `3px ${item.dashed ? 'dashed' : 'solid'} ${item.color}`,
              opacity: item.pending ? 0.4 : 1,
            }}
          />
          {item.label}
          {item.pending && <span style={{ fontSize: '10px', color: '#b0bec5' }}>等待数据</span>}
        </span>
      ))}
    </div>
  );

  /* ---------------- 等待/失败空态（不沿用上一通道任何结果） ---------------- */
  const renderWaiting = (error: boolean) => (
    <div style={emptyText}>
      {error ? (
        <>
          <div style={{ fontSize: '22px', marginBottom: '8px' }}>⚠️</div>
          <div style={{ color: '#c62828', fontWeight: 600, marginBottom: '4px' }}>
            频段数据刷新失败{bandError ? `：${bandError}` : ''}
          </div>
          <div style={{ fontSize: '12px' }}>已暂停显示，等待下一帧恢复（不会沿用上一通道结果）</div>
        </>
      ) : (
        '等待数据中...'
      )}
    </div>
  );

  return (
    <div style={cardStyle}>
      <h3 style={headerStyle}>
        <span style={{ fontSize: '20px' }}>📊</span>
        <span>{selectedChannel}</span>
        <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>
          {channelName} · {viewMode === 'trend' ? '频段能量趋势' : '频段能量'}
        </span>
        {showCompare && (
          <span style={{ fontSize: '12px', color: '#6a1b9a', fontWeight: 500 }}>
            对比 {compareChannel}（{channelDisplayName(compareChannel!)}）
          </span>
        )}
        {playbackMode && <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放模式</span>}
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <button onClick={() => setViewMode('trend')} style={viewMode === 'trend' ? pillBtnActive : pillBtn}>
            📈 趋势
          </button>
          <button onClick={() => setViewMode('instant')} style={viewMode === 'instant' ? pillBtnActive : pillBtn}>
            📊 瞬时
          </button>
        </div>
      </h3>

      {viewMode === 'trend' && !playbackMode && renderControls()}
      {playbackMode && viewMode === 'trend' && (
        <div style={{ fontSize: '11px', color: '#78909c', marginBottom: '10px' }}>
          回放模式：展示整段录制的频段趋势（{activeRecording?.frames.length ?? 0} 帧），暂不支持对比通道
        </div>
      )}

      {bandWarning && !playbackMode && (
        <div style={{
          fontSize: '12px', color: '#8d6e00', background: '#fff8e1', border: '1px solid #ffe082',
          borderRadius: '6px', padding: '6px 10px', marginBottom: '10px',
        }}>
          ⚠️ {bandWarning}
        </div>
      )}
      {bandError && hasPrimaryPoints && !playbackMode && (
        <div style={{
          fontSize: '12px', color: '#c62828', background: '#ffebee', border: '1px solid #ef9a9a',
          borderRadius: '6px', padding: '6px 10px', marginBottom: '10px',
        }}>
          ⚠️ 最新一帧{bandError}，下图仅保留本通道窗口内的有效数据
        </div>
      )}

      {viewMode === 'instant' ? (
        !bandPower
          ? renderWaiting(!!bandError)
          : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={instantData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="power" radius={[4, 4, 0, 0]}>
                  {instantData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
      ) : (
        !hasPrimaryPoints
          ? renderWaiting(!playbackMode && !!bandError)
          : (
            <>
              {renderLegend()}
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendRows}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={32} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const isCmp = name.startsWith('cmp_');
                      const key = (isCmp ? name.slice(4) : name) as keyof typeof BAND_KEYS;
                      const idx = BAND_KEYS.indexOf(key as any);
                      const bandLabel = BAND_LABELS[idx] ?? key;
                      const who = isCmp ? `${compareChannel} 对比` : selectedChannel;
                      return [`${typeof value === 'number' ? value.toFixed(3) : value}（${who}）`, bandLabel];
                    }}
                  />
                  {BAND_KEYS.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={BAND_LABELS[i]}
                      stroke={BAND_COLORS[i]}
                      dot={false}
                      strokeWidth={1.8}
                      isAnimationActive={false}
                    />
                  ))}
                  {showCompare && BAND_KEYS.map((key, i) => (
                    <Line
                      key={`cmp_${key}`}
                      type="monotone"
                      dataKey={`cmp_${key}`}
                      name={`cmp_${key}`}
                      stroke={BAND_COLORS[i]}
                      strokeDasharray="5 3"
                      dot={false}
                      strokeWidth={1.5}
                      opacity={0.85}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </>
          )
      )}
    </div>
  );
};
