export function summarizeFrames(intervals: number[]) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return {
    frameCount: intervals.length,
    frameMs: { median: percentile(0.5), p95: percentile(0.95), max: percentile(1) },
    frameIntervals: intervals
  };
}
