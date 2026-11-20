import type { Page } from '@playwright/test';
import { summarizeFrames } from './frames';

export async function mountedWidgets(page: Page): Promise<number> {
  return page.locator('app-benchmark-widget').count();
}

/** Advance by overlapping viewport-sized steps so every item enters the viewport. */
export async function scrollGrid(page: Page, direction: 'down' | 'up') {
  const result = await page.locator('gridster').evaluate(async (grid, direction) => {
    const maxScroll = grid.scrollHeight - grid.clientHeight;
    if (maxScroll <= 0) throw new Error('Benchmark grid must overflow vertically');
    const target = direction === 'down' ? maxScroll : 0;
    const step = Math.max(1, Math.floor(grid.clientHeight * 0.75));
    const frameIntervals: number[] = [];
    let previous = await new Promise<number>(resolve => requestAnimationFrame(resolve));
    const started = performance.now();
    const startScrollTop = grid.scrollTop;
    let steps = 0;
    while (Math.abs(grid.scrollTop - target) > 1) {
      const before = grid.scrollTop;
      grid.scrollTop = direction === 'down' ? Math.min(target, before + step) : Math.max(target, before - step);
      // Allow scroll/intersection callbacks and Angular rendering between steps.
      for (let frame = 0; frame < 2; frame++) {
        const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
        frameIntervals.push(now - previous);
        previous = now;
      }
      if (grid.scrollTop === before) throw new Error('Scrolling made no progress');
      steps++;
    }
    return {
      durationMs: performance.now() - started,
      steps,
      startScrollTop,
      endScrollTop: grid.scrollTop,
      targetScrollTop: target,
      frameIntervals
    };
  }, direction);
  return { ...result, ...summarizeFrames(result.frameIntervals) };
}
