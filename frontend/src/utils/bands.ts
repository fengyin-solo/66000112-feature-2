import { BandName, BandPower, BandTrendWindow, BandViewMode } from '../types';

export const BAND_NAMES: BandName[] = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
export const BAND_LABELS: Record<BandName, string> = {
  delta: 'Delta',
  theta: 'Theta',
  alpha: 'Alpha',
  beta: 'Beta',
  gamma: 'Gamma',
};
export const BAND_COLORS: Record<BandName, string> = {
  delta: '#1565c0',
  theta: '#2e7d32',
  alpha: '#f9a825',
  beta: '#e53935',
  gamma: '#6a1b9a',
};
// 对比通道使用同色系浅色，配合虚线，在图例中明确区分
export const COMPARE_BAND_COLORS: Record<BandName, string> = {
  delta: '#64b5f6',
  theta: '#81c784',
  alpha: '#ffd54f',
  beta: '#ef9a9a',
  gamma: '#ba68c8',
};

export const BAND_TREND_WINDOWS: BandTrendWindow[] = [15, 30, 60];
export const BAND_REFRESH_SEC = 3;
export const MAX_TREND_POINTS = 60 / BAND_REFRESH_SEC + 1;

export const isValidBandPower = (b: unknown): b is BandPower => {
  if (!b || typeof b !== 'object') return false;
  return BAND_NAMES.every(name => typeof (b as Record<string, unknown>)[name] === 'number');
};

/** 找出缺失（非数值）的频段，用于提示“某频段缺失” */
export const missingBands = (b: unknown): BandName[] => {
  if (!b || typeof b !== 'object') return BAND_NAMES;
  return BAND_NAMES.filter(name => typeof (b as Record<string, unknown>)[name] !== 'number');
};

const VIEW_KEY = 'eeg_band_view';
const WINDOW_KEY = 'eeg_band_window';
const COMPARE_KEY = 'eeg_band_compare';

const readNumber = (key: string): number | null => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

export const loadBandViewMode = (): BandViewMode =>
  localStorage.getItem(VIEW_KEY) === 'trend' ? 'trend' : 'instant';

export const loadBandTrendWindow = (): BandTrendWindow => {
  const w = readNumber(WINDOW_KEY);
  return w === 15 || w === 30 || w === 60 ? w : 30;
};

export const loadBandCompareChannel = (): string | null => {
  try {
    return localStorage.getItem(COMPARE_KEY);
  } catch {
    return null;
  }
};

export const persistBandViewMode = (mode: BandViewMode) => write(VIEW_KEY, mode);
export const persistBandTrendWindow = (window: BandTrendWindow) => write(WINDOW_KEY, String(window));
export const persistBandCompareChannel = (channel: string | null) => {
  try {
    if (channel === null) localStorage.removeItem(COMPARE_KEY);
    else write(COMPARE_KEY, channel);
  } catch {}
};
