export function summarizeMasks(samples) {
  const valid = samples.filter(sample => Number.isFinite(sample.area) && sample.area > 0);
  if (valid.length < 3) return { valid, peak: null, trough: null, range: null };
  const areas = valid.map(sample => sample.area);
  const peak = Math.max(...areas);
  const trough = Math.min(...areas);
  return { valid, peak, trough, range: (peak - trough) / peak };
}

export function sampleTimes(center, duration, count, windowSeconds) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const span = Math.min(windowSeconds, duration - 0.02);
  const start = Math.min(Math.max(0, center - span / 2), Math.max(0, duration - span - 0.01));
  return Array.from({ length: count }, (_, index) => start + (span * index) / (count - 1));
}
