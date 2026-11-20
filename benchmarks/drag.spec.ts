import { expect } from '@playwright/test';
import { milliseconds, openGrid, recordResult, test } from './support/benchmark';
import { dragAcrossRow, readLayout } from './support/drag';

for (const count of [500, 2000, 10000]) {
  for (const push of [false, true]) {
    test(`drag: ${count} items, pushing ${push ? 'on' : 'off'}`, async ({ benchmarkPage: page, browser }, testInfo) => {
      await openGrid(page, { count, layout: 'drag', push });
      const before = await readLayout(page);
      const measurement = await dragAcrossRow(page);
      await expect(page.locator('.gridster-item-moving')).toHaveCount(0);
      const after = await readLayout(page);
      expect(after).toHaveLength(count);
      expect(after[0]).toEqual({ id: 0, x: push ? 5 : 0, y: 0 });
      const occupied = new Set<string>();
      for (const item of after) {
        if (item.x < 0 || item.x >= 12 || item.y < 0) throw new Error(`Item ${item.id} is outside the grid`);
        const key = `${item.x},${item.y}`;
        if (occupied.has(key)) throw new Error(`Overlap at ${key}`);
        occupied.add(key);
      }
      const movedItems = after.filter((item, index) => item.x !== before[index].x || item.y !== before[index].y).length;
      // Pushed items behind the source return to their original cells on drop.
      expect(after).toEqual(
        before.map(item => {
          if (!push) return item;
          if (item.id === 0) return { ...item, x: 5 };
          if (item.id === 5) return { ...item, x: 6 };
          return item;
        })
      );
      expect(movedItems).toBe(push ? 2 : 0);
      expect(measurement.frameCount).toBeGreaterThan(0);
      expect(await page.locator('gridster').evaluate(grid => grid.scrollTop)).toBe(0);
      await recordResult(
        testInfo,
        {
          scenario: 'drag',
          count,
          push,
          browser: browser.version(),
          workload: { cellsCrossed: 5, pointerSteps: 30, framesPerStep: 1, pushDirection: 'east' },
          movedItems,
          ...measurement
        },
        {
          Duration: milliseconds(measurement.durationMs),
          'Frames (p50/p95/max)': [measurement.frameMs.median, measurement.frameMs.p95, measurement.frameMs.max].map(milliseconds).join(' / '),
          'Items moved (final)': movedItems
        }
      );
    });
  }
}
