'use strict';

function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

function validateHorizontalAlignment(dom, config) {
  const rows = Array.isArray(dom) ? dom : [];
  const selectors = config && Array.isArray(config.selectors) ? config.selectors : [];
  const tolerance = Number.isFinite(config && config.tolerance) ? config.tolerance : 1;

  if (selectors.length < 2) {
    return { ok: false, reason: 'horizontal alignment requires at least two selectors' };
  }

  const selected = [];
  for (const selector of selectors) {
    const matches = rows.filter((row) => row && row.selector === selector);
    if (matches.length !== 1) {
      return {
        ok: false,
        reason: `${selector} must match exactly one element; got ${matches.length}`,
      };
    }

    const row = matches[0];
    const left = Number(row.offset && row.offset.left);
    const width = Number(row.size && row.size.width);
    if (!Number.isFinite(left) || !Number.isFinite(width)) {
      return { ok: false, reason: `${selector} is missing finite left/width geometry` };
    }
    selected.push({ selector, left, width });
  }

  const baseline = selected[0];
  const leftDelta = roundMetric(Math.max(...selected.map((item) => Math.abs(item.left - baseline.left))));
  const widthDelta = roundMetric(Math.max(...selected.map((item) => Math.abs(item.width - baseline.width))));
  const ok = leftDelta <= tolerance && widthDelta <= tolerance;

  return {
    ok,
    reason: ok ? '' : `horizontal geometry drifted: left=${leftDelta}px width=${widthDelta}px tolerance=${tolerance}px`,
    leftDelta,
    widthDelta,
    tolerance,
  };
}

module.exports = {
  validateHorizontalAlignment,
};
