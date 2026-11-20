import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Gridster, GridsterConfig, GridsterItem, GridsterItemConfig, GridType } from 'angular-gridster2';

@Component({
  selector: 'app-benchmark',
  imports: [Gridster, GridsterItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>Initial render benchmark: {{ count }} items</p>
    <gridster [options]="options" [attr.data-benchmark-ready]="ready()">
      @for (item of items; track item.id) {
        <gridster-item [item]="item">Widget {{ item.id }}</gridster-item>
      }
    </gridster>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    gridster {
      height: 75vh;
    }
  `
})
export class Benchmark {
  private readonly started = performance.now();
  private readonly requestedCount = Number(new URLSearchParams(window.location.search).get('count') ?? 500);
  readonly count = Number.isInteger(this.requestedCount) && this.requestedCount > 0 && this.requestedCount <= 10000 ? this.requestedCount : 500;
  readonly ready = signal(false);
  readonly items: GridsterItemConfig[] = Array.from({ length: this.count }, (_, id) => ({
    id,
    x: id % 12,
    y: Math.floor(id / 12),
    cols: 1,
    rows: 1
  }));
  private initialized = 0;
  readonly options: GridsterConfig = {
    gridType: GridType.VerticalFixed,
    fixedRowHeight: 100,
    minCols: 12,
    maxCols: 12,
    maxRows: 10000,
    mobileBreakpoint: 0,
    scrollToNewItems: false,
    draggable: { enabled: true },
    resizable: { enabled: true, handlesOnlyOnActiveItem: true },
    itemInitCallback: () => {
      if (++this.initialized !== this.count) return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          performance.measure('gridster-initial-render', { start: this.started, end: performance.now() });
          this.ready.set(true);
        })
      );
    }
  };
}
