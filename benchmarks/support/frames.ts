import type { Page } from '@playwright/test';

declare global {
  interface Window {
    benchmarkFrames?: { started: number; previous?: number; intervals: number[]; handle: number };
  }
}

export function summarizeFrames(intervals: number[]) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return {
    frameCount: intervals.length,
    frameMs: { median: percentile(0.5), p95: percentile(0.95), max: percentile(1) },
    frameIntervals: intervals
  };
}

export async function startFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sample = { started: performance.now(), previous: undefined as number | undefined, intervals: [] as number[], handle: 0 };
    const tick = (now: number) => {
      if (sample.previous !== undefined) sample.intervals.push(now - sample.previous);
      sample.previous = now;
      sample.handle = requestAnimationFrame(tick);
    };
    window.benchmarkFrames = sample;
    sample.handle = requestAnimationFrame(tick);
  });
}

export async function stopFrames(page: Page) {
  const result = await page.evaluate(() => {
    const sample = window.benchmarkFrames;
    if (!sample) throw new Error('Frame sampling has not started');
    cancelAnimationFrame(sample.handle);
    delete window.benchmarkFrames;
    return { durationMs: performance.now() - sample.started, intervals: sample.intervals };
  });
  return { durationMs: result.durationMs, ...summarizeFrames(result.intervals) };
}
