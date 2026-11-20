import { milliseconds, openGrid, recordResult, test } from './support/benchmark';

for (const count of [500, 2000, 10000]) {
  test(`initial render: ${count} items`, async ({ benchmarkPage: page, browser }, testInfo) => {
    await openGrid(page, { count });
    const measurement = await page.evaluate(() => ({
      renderMs: performance.getEntriesByName('gridster-initial-render', 'measure')[0].duration,
      domNodes: document.querySelectorAll('gridster *').length
    }));
    await recordResult(
      testInfo,
      { scenario: 'initial-render', count, browser: browser.version(), ...measurement },
      { Render: milliseconds(measurement.renderMs), 'DOM nodes': measurement.domNodes }
    );
  });
}
