import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Gridster, GridsterConfig, GridsterDeferContent, GridsterItem, GridsterItemConfig, GridType } from 'angular-gridster2';
import { BenchmarkWidget } from './widget';

@Component({
  selector: 'app-benchmark',
  imports: [Gridster, GridsterItem, GridsterDeferContent, BenchmarkWidget],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>Grid benchmark: {{ count }} items</p>
    <gridster [options]="options" [attr.data-benchmark-ready]="ready()">
      @for (item of items; track item.id) {
        <gridster-item [item]="item" [attr.data-item-id]="item.id">
          @if (content) {
            <ng-template [gridsterDeferContent]="content === 'deferred'">
              <app-benchmark-widget [id]="item.id" />
            </ng-template>
          } @else {
            Widget {{ item.id }}
          }
        </gridster-item>
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
  private readonly params = new URLSearchParams(window.location.search);
  readonly content = this.params.get('content');
  private readonly dragLayout = this.params.get('layout') === 'drag';
  private readonly requestedCount = Number(this.params.get('count') ?? 500);
  readonly count = Number.isInteger(this.requestedCount) && this.requestedCount > 0 && this.requestedCount <= 10000 ? this.requestedCount : 500;
  readonly ready = signal(false);
  readonly items: GridsterItemConfig[] = Array.from({ length: this.count }, (_, id) => ({
    id,
    x: this.dragLayout ? (id < 6 ? id : (id - 6) % 12) : id % 12,
    y: this.dragLayout ? (id < 6 ? 0 : 1 + Math.floor((id - 6) / 12)) : Math.floor(id / 12),
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
    deferContentMargin: '1000px 0px',
    scrollToNewItems: false,
    margin: 10,
    swap: false,
    pushItems: this.params.get('push') === 'true',
    ...(this.dragLayout ? { pushDirections: { north: false, east: true, south: false, west: false } } : {}),
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
