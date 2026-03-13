const PRESET_OPTIONS = [
  { key: 'relax', label: '轻松', totalMatches: 6, courts: 2 },
  { key: 'standard', label: '标准', totalMatches: 8, courts: 2 },
  { key: 'intense', label: '强度', totalMatches: 12, courts: 2 },
  { key: 'custom', label: '自定义', totalMatches: 8, courts: 2 }
];

function normalizePresetKey(key) {
  const v = String(key || '').trim().toLowerCase();
  return PRESET_OPTIONS.some((x) => x.key === v) ? v : 'standard';
}

function getPresetOption(key) {
  const normalized = normalizePresetKey(key);
  return PRESET_OPTIONS.find((item) => item.key === normalized) || PRESET_OPTIONS[1];
}

function getPresetOptions() {
  return PRESET_OPTIONS.slice();
}

module.exports = {
  PRESET_OPTIONS,
  normalizePresetKey,
  getPresetOption,
  getPresetOptions
};
