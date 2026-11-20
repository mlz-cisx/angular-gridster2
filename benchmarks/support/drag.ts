import type { Page } from '@playwright/test';
import { startFrames, stopFrames } from './frames';

/** Read rendered cells, checking alignment outside the measured interaction. */
export async function readLayout(page: Page) {
  return page.locator('gridster').evaluate(grid => {
    const origin = grid.getBoundingClientRect();
    return Array.from(grid.querySelectorAll('gridster-item'), item => {
      const rect = item.getBoundingClientRect();
      const x = (rect.left - origin.left - 10) / (rect.width + 10);
      const y = (rect.top - origin.top - 10 + grid.scrollTop) / (rect.height + 10);
      if (rect.width <= 0 || rect.height <= 0 || Math.abs(x - Math.round(x)) > 0.01 || Math.abs(y - Math.round(y)) > 0.01) {
        throw new Error('Item geometry is not aligned with the benchmark grid');
      }
      return { id: Number(item.getAttribute('data-item-id')), x: Math.round(x), y: Math.round(y) };
    });
  });
}

export async function dragAcrossRow(page: Page) {
  const source = page.locator('gridster-item[data-item-id="0"]');
  const target = page.locator('gridster-item[data-item-id="5"]');
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Drag endpoints are missing');
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await startFrames(page);
  try {
    await page.mouse.down();
    // Verify a real drag started before accepting any timings.
    const started = await source.evaluate(item => item.classList.contains('gridster-item-moving'));
    if (!started) throw new Error('Pointer input did not start a drag');
    for (let step = 1; step <= 30; step++) {
      await page.mouse.move(start.x + ((end.x - start.x) * step) / 30, start.y);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    }
    await page.mouse.up();
    // Include snap-back and pushed-item transitions before validating rendered cells.
    await page.locator('gridster').evaluate(async grid => {
      await Promise.all(grid.getAnimations({ subtree: true }).map(animation => animation.finished));
    });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return await stopFrames(page);
  } finally {
    await page.mouse.up();
  }
}
