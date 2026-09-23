import { BandPower, BandPowerPoint, RecordingFrame } from '../types';

export const ALL_CHANNELS = ['Fp1','Fp2','F3','F4','C3','C4','P3','P4','O1','O2'];

export const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

export const BAND_KEYS = ['delta', 'theta', 'alpha', 'beta', 'gamma'] as const;
export const BAND_LABELS = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];
export const BAND_COLORS = ['#1565c0', '#2e7d32', '#f9a825', '#e53935', '#6a1b9a'];

export const TIME_WINDOWS = [15, 30, 60] as const;
export type TimeWindow = typeof TIME_WINDOWS[number];
/** 波形每 3s 刷新一次，最长 60s 窗口 => 每通道最多保留 20 个点 */
export const MAX_HISTORY_POINTS = 20;

/**
 * 校验后端返回的频段能量：五个频段必须都存在且为有限非负数值。
 * 任一频段缺失/非法时返回 null，调用方必须丢弃该帧，禁止补零或沿用上一通道结果。
 */
export const validateBandPower = (value: unknown): BandPower | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  for (const key of BAND_KEYS) {
    const num = v[key];
    if (typeof num !== 'number' || !Number.isFinite(num) || num < 0) return null;
  }
  return {
    delta: v.delta as number,
    theta: v.theta as number,
    alpha: v.alpha as number,
    beta: v.beta as number,
    gamma: v.gamma as number,
  };
};

export const channelDisplayName = (ch: string): string => CHANNEL_NAMES[ch] || ch;

export const formatClock = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export interface TrendRow {
  label: string;
  [band: string]: number | string | undefined;
}

/**
 * 合并主通道/对比通道在同一时间窗口内的频段趋势。
 * - 同一时间戳的主/对比结果合入同一行，保证两者与波形同节拍；
 * - 缺失频段（含整通道无数据）保持 undefined，图表断线显示，禁止补零或跨通道沿用；
 * - 按时间戳升序输出。
 */
export const buildTrendRows = (
  primaryPoints: BandPowerPoint[],
  comparePoints: BandPowerPoint[],
  now: number,
  windowSec: number,
): TrendRow[] => {
  const cutoff = now - windowSec * 1000;
  const inWindow = (p: BandPowerPoint) => p.timestamp >= cutoff;
  const primary = primaryPoints.filter(inWindow);
  const compare = comparePoints.filter(inWindow);
  const timestamps = Array.from(
    new Set([...primary.map((p) => p.timestamp), ...compare.map((p) => p.timestamp)]),
  ).sort((a, b) => a - b);
  const primaryMap = new Map(primary.map((p) => [p.timestamp, p]));
  const compareMap = new Map(compare.map((p) => [p.timestamp, p]));
  return timestamps.map((ts) => {
    const row: TrendRow = { label: formatClock(ts) };
    const p = primaryMap.get(ts);
    const c = compareMap.get(ts);
    BAND_KEYS.forEach((k) => {
      row[k] = p?.bands[k];
      row[`cmp_${k}`] = c?.bands[k];
    });
    return row;
  });
};

/** 回放模式：从录制帧重建整段趋势，缺失频段留空断线，不补零 */
export const buildPlaybackTrendRows = (frames: RecordingFrame[]): TrendRow[] =>
  frames.map((f) => ({
    label: `${f.relativeTime.toFixed(1)}s`,
    ...Object.fromEntries(BAND_KEYS.map((k) => [k, f.bands[k]])),
  }));
