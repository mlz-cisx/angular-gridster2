import { expect } from '@playwright/test';
import { milliseconds, openGrid, recordResult, test } from './support/benchmark';
import { mountedWidgets, scrollGrid } from './support/scroll';

for (const content of ['eager', 'deferred'] as const) {
  const count = 2000;
  test(`scrolling: ${count} items, ${content} content`, async ({ benchmarkPage: page, browser }, testInfo) => {
    await openGrid(page, { count, content });
    await expect(page.locator('gridster-item').first().locator('app-benchmark-widget')).toBeVisible();
    const initialRenderMs = await page.evaluate(() => performance.getEntriesByName('gridster-initial-render', 'measure')[0].duration);
    const initiallyMounted = await mountedWidgets(page);
    if (content === 'eager') expect(initiallyMounted).toBe(count);
    else expect(initiallyMounted).toBeLessThan(count);

    const down = await scrollGrid(page, 'down');
    expect(Math.abs(down.endScrollTop - down.targetScrollTop)).toBeLessThanOrEqual(1);
    await expect(page.locator('app-benchmark-widget')).toHaveCount(count);
    const afterDown = await mountedWidgets(page);
    const up = await scrollGrid(page, 'up');
    expect(up.endScrollTop).toBe(0);
    const afterUp = await mountedWidgets(page);
    expect(afterUp).toBe(count);

    await recordResult(
      testInfo,
      {
        scenario: 'scrolling',
        initialRenderMs,
        count,
        content,
        browser: browser.version(),
        workload: { valuesPerWidget: 24, stepViewportFraction: 0.75, framesPerStep: 2, deferContentMargin: '1000px 0px' },
        mountedWidgets: { initial: initiallyMounted, afterDown, afterUp },
        passes: { down, up }
      },
      {
        Render: milliseconds(initialRenderMs),
        'Mounted (start/down/up)': `${initiallyMounted} / ${afterDown} / ${afterUp}`,
        'Down frames (p50/p95/max)': [down.frameMs.median, down.frameMs.p95, down.frameMs.max].map(milliseconds).join(' / '),
        'Up frames (p50/p95/max)': [up.frameMs.median, up.frameMs.p95, up.frameMs.max].map(milliseconds).join(' / ')
      }
    );
  });
}
