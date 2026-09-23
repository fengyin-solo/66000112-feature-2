// Exercise store semantics + band validation outside React.
import { useEEGStore } from '../src/store/eeg';
import { validateBandPower, MAX_HISTORY_POINTS, buildTrendRows, buildPlaybackTrendRows } from '../src/utils/bands';
import type { BandPower, RecordingFrame } from '../src/types';

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) { failures++; console.error('FAIL:', msg); }
  else console.log('PASS:', msg);
};

const mkBands = (v = 1): BandPower => ({ delta: v, theta: v, alpha: v, beta: v, gamma: v });

// validateBandPower
assert(validateBandPower(null) === null, 'null bands rejected');
assert(validateBandPower({ delta: 1, theta: 1, alpha: 1, beta: 1 }) === null, 'missing gamma rejected');
assert(validateBandPower({ delta: 1, theta: 1, alpha: 1, beta: NaN, gamma: 1 }) === null, 'NaN band rejected');
assert(validateBandPower({ delta: -1, theta: 1, alpha: 1, beta: 1, gamma: 1 }) === null, 'negative band rejected');
assert(validateBandPower({ delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 }) !== null, 'zero bands accepted');

const s = useEEGStore;

// Fresh channel must not show previous channel data
s.getState().setChannel('Fp1');
s.getState().recordBandPower('Fp1', mkBands(2), 1000, null, null);
assert(s.getState().bandPower?.alpha === 2, 'Fp1 bands set');
s.getState().setChannel('C3');
assert(s.getState().bandPower === null, 'instant bands cleared on channel switch');
assert(s.getState().eegData === null, 'eegData cleared on channel switch');
assert(s.getState().bandError === null, 'errors reset on channel switch');

// Fp1 history isolated from C3
assert((s.getState().bandPowerHistory['Fp1'] ?? []).length === 1, 'Fp1 history preserved separately');
assert((s.getState().bandPowerHistory['C3'] ?? []).length === 0, 'C3 history starts empty');

// Ring buffer cap per channel
for (let i = 0; i < 30; i++) s.getState().recordBandPower('C3', mkBands(i), 2000 + i * 3000, null, null);
assert(s.getState().bandPowerHistory['C3'].length === MAX_HISTORY_POINTS, 'history capped at MAX_HISTORY_POINTS');
assert(s.getState().bandPowerHistory['C3'][0].timestamp === 2000 + (30 - MAX_HISTORY_POINTS) * 3000, 'oldest points trimmed');
assert(s.getState().bandPowerHistory['Fp1'].length === 1, 'other channel history untouched by appends');

// Compare channel: same timestamp, separate history
s.getState().setChannel('O1');
s.getState().setCompareChannel('O2');
assert(s.getState().compareChannel === 'O2', 'compare channel set');
s.getState().recordBandPower('O1', mkBands(1), 5000, 'O2', mkBands(9));
assert(s.getState().bandPowerHistory['O1'][0].timestamp === 5000, 'primary point timestamp');
assert(s.getState().bandPowerHistory['O2'][0].timestamp === 5000, 'compare point shares timestamp');
assert(s.getState().bandPowerHistory['O2'][0].bands.alpha === 9, 'compare values distinct');

// Compare bands missing -> warning, no point written for compare, no zero-fill
const before = s.getState().bandPowerHistory['O2'].length;
s.getState().recordBandPower('O1', mkBands(1), 8000, 'O2', null);
assert(s.getState().bandPowerHistory['O2'].length === before, 'missing compare bands not stored');
assert(s.getState().bandWarning?.includes('O2') ?? false, 'missing compare bands warns');
assert(s.getState().bandPowerHistory['O1'].length === 2, 'primary still stored when compare missing');

// Selecting same channel as compare auto-clears
s.getState().setChannel('O2');
assert(s.getState().compareChannel === null, 'compare cleared when it becomes selected channel');

// bandError path clears instant value without touching history
s.getState().setChannel('F3');
s.getState().recordBandPower('F3', mkBands(3), 9000, null, null);
s.getState().setBandError('频段数据缺失或无效，请等待下一帧刷新');
assert(s.getState().bandPower === null, 'band error clears instant bands');
assert(s.getState().bandPowerHistory['F3'].length === 1, 'valid history retained on error');
s.getState().recordBandPower('F3', mkBands(4), 12000, null, null);
assert(s.getState().bandError === null && s.getState().bandPower?.beta === 4, 'error cleared on next valid frame');

// Time window persistence
const stored = localStorage.getItem('eeg_band_time_window');
assert(stored === '30', 'default time window persisted to localStorage (' + stored + ')');
s.getState().setTimeWindow(60);
assert(localStorage.getItem('eeg_band_time_window') === '60', 'window switch persisted');
assert(s.getState().timeWindow === 60, 'window state updated');

// buildTrendRows: window filtering, same-timestamp merge, gaps never zero-filled
const now = 100000;
const pt = (ts: number, v: number) => ({ timestamp: ts, bands: mkBands(v) });
const rows = buildTrendRows(
  [pt(now - 61000, 1), pt(now - 20000, 2), pt(now - 5000, 3)],
  [pt(now - 20000, 9)],
  now,
  30,
);
assert(rows.length === 2, 'out-of-window primary point excluded');
assert(rows[0].label === rows[0].label, 'rows carry clock labels');
assert(rows[0].delta === 2 && (rows[0] as any).cmp_delta === 9, 'same-timestamp primary/compare merged on one row');
assert(rows[1].delta === 3 && (rows[1] as any).cmp_delta === undefined, 'missing compare band stays undefined (no zero fill)');
assert(rows.map(r => r.label).length === 2, 'rows ordered ascending by time');

// compare-only timestamp (primary missing) also appears with primary undefined
const rows2 = buildTrendRows([pt(now - 3000, 1)], [pt(now - 1000, 7)], now, 15);
assert(rows2.length === 2, 'compare-only timestamp retained');
assert(rows2[1].alpha === undefined && (rows2[1] as any).cmp_alpha === 7, 'primary gap on compare-only row stays undefined');

// playback rows: relative-time labels, 5 bands
const frame = (t: number, v: number): RecordingFrame => ({
  relativeTime: t,
  eeg: { channels: [], sample_rate: 256, data: {}, time: [], duration: 3 },
  bands: mkBands(v),
  brainState: { focus: 1, relaxation: 1, fatigue: 1, status: 'neutral', statusLabel: '平稳', statusColor: '#000', timestamp: t },
  correlation: { targetChannel: 'Fp1', correlations: [] },
});
const pb = buildPlaybackTrendRows([frame(0, 1), frame(3, 2)]);
assert(pb.length === 2 && pb[0].label === '0.0s' && pb[1].label === '3.0s', 'playback rows labeled by relative time');
assert(pb[0].gamma === 1 && pb[1].gamma === 2, 'playback rows expose five bands');

if (failures > 0) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL STORE TESTS PASSED');
