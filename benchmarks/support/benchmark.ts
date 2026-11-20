import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

export const test = base.extend<{ benchmarkPage: Page }>({
  benchmarkPage: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'browser errors').toEqual([]);
  }
});

export async function openGrid(page: Page, options: { count: number; content?: 'eager' | 'deferred' }): Promise<void> {
  const params = new URLSearchParams({ count: String(options.count) });
  if (options.content) params.set('content', options.content);
  await page.goto(`?${params}`);
  await expect(page.locator('gridster')).toHaveAttribute('data-benchmark-ready', 'true');
  await expect(page.locator('gridster-item')).toHaveCount(options.count);
  expect(
    await page
      .locator('gridster-item')
      .last()
      .evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
  ).toBe(true);
}

export function milliseconds(value: number): string {
  return `${value.toFixed(1)} ms`;
}

export async function recordResult(testInfo: TestInfo, result: Record<string, unknown>, stats: Record<string, string | number>): Promise<void> {
  const report = { schemaVersion: 1, ...result };
  const width = Math.max(...Object.keys(stats).map(label => label.length));
  console.log(
    `\n${testInfo.title}\n${Object.entries(stats)
      .map(([label, value]) => `  ${label.padEnd(width)}  ${value}`)
      .join('\n')}\n`
  );
  await testInfo.attach('benchmark.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json'
  });
}
