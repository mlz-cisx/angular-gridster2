A fork of [angular-gridster2](https://github.com/tiberiuzuld/angular-gridster2) focused on performance for large and long grids. Customized for [MLZ-eln](https://github.com/mlz-cisx/eln-frontend). Requires Angular 21.x.

## Install this fork

```sh
npm install git+https://github.com/wongJG/angular-gridster2.git
```

## Usage for large grids

Import the standalone grid, item, and deferred-content directive into your component:

```typescript
import { Component } from '@angular/core';
import { Gridster, GridsterItem, GridsterDeferContent, GridType } from 'angular-gridster2';
import type { GridsterConfig, GridsterItemConfig } from 'angular-gridster2';

@Component({
  selector: 'app-dashboard',
  imports: [Gridster, GridsterItem, GridsterDeferContent],
  templateUrl: './dashboard.html'
})
export class Dashboard {
  options: GridsterConfig = {
    gridType: GridType.ScrollVertical,
    minCols: 12,
    maxCols: 12,
    draggable: { enabled: true },
    resizable: {
      enabled: true,
      handlesOnlyOnActiveItem: true
    },
    deferContentMargin: '1000px 0px'
  };

  dashboard: GridsterItemConfig[] = [
    { x: 0, y: 0, cols: 6, rows: 2 },
    { x: 6, y: 0, cols: 6, rows: 2 }
  ];
}
```

```html
<!-- dashboard.html; give the grid's parent an explicit size. -->
<div style="height: 80vh">
  <gridster [options]="options">
    @for (item of dashboard; track item) {
    <gridster-item [item]="item">
      <ng-template gridsterDeferContent>
        <!-- Put expensive editors, charts, or other widget content here. -->
        <p>Widget at {{ item.x }}, {{ item.y }}</p>
      </ng-template>
    </gridster-item>
    }
  </gridster>
</div>
```

### Deferred content

`GridsterDeferContent` delays creating the template until its item approaches the scroll viewport. The item shell remains in the grid, so layout, dragging, resizing, and collision detection still include every item.

- `deferContentMargin` is an IntersectionObserver root margin; the default `'1000px 0px'` preloads content 1000px above and below the viewport.
- Bind `[gridsterDeferContent]="false"` to render eagerly.
- Only content inside the template is deferred.
- In case a item outside viewport is needed before it enters the viewport, export the directive and call `activate()` first. It creates the view synchronously and is safe to call repeatedly:

```html
<ng-template gridsterDeferContent #content="gridsterDeferContent">
  <p>Deferred content</p>
</ng-template>
<button type="button" (click)="content.activate()">Load defer content</button>
```

### Resize handles on active items

Set `resizable.handlesOnlyOnActiveItem: true` alongside `resizable.enabled: true` to mount handles only for hovered, focused, touch-selected, or currently resizing items. This reduces DOM nodes on large grids.

## Other performance changes

- indexes collision candidates by vertical bands ([`8cb4e48`](https://github.com/wongJG/angular-gridster2/commit/8cb4e4868e1d129161da24b4c57ebdbf8e6bc5eb))
- limits layout updates to dirty widgets ([`2f560d5`](https://github.com/wongJG/angular-gridster2/commit/2f560d5b96eed2df8a42e67483e632e70a893252))
- avoids redundant layout scans and style writes ([`8c0f856`](https://github.com/wongJG/angular-gridster2/commit/8c0f8560110d790214ca9cb13dd96a8a5a0ee168))
- renders the grid background with CSS gradients ([`356c4ac`](https://github.com/wongJG/angular-gridster2/commit/356c4ac82b5e5cc0b2b13f144c87225fc364ebbe))

## Benchmarks

After installing dependencies, run the browser benchmarks:

```sh
npx playwright install chromium
npm run benchmark
```

Initial render times (lower is better) and DOM element counts inside the grid, measured on the same machine with Chromium 159, production builds:

|  Items | `original` |     `perf` | `original` DOM nodes | `perf` DOM nodes |
| -----: | ---------: | ---------: | -------------------: | ---------------: |
|    500 |   194.4 ms |   127.3 ms |                4,555 |              503 |
|  2,000 |   606.9 ms |   370.7 ms |               18,180 |            2,003 |
| 10,000 | 8,056.0 ms | 1,323.4 ms |               90,847 |           10,003 |

Content rendering and scrolling with 2,000 widgets:

| Metric                      |     `original` | `perf` (eager) | `perf` (defer enable) |
| :-------------------------- | -------------: | -------------: | --------------------: |
| Initial render              |     1,257.1 ms |     1,003.1 ms |              265.0 ms |
| Initially mounted widgets   |          2,000 |          2,000 |                   192 |
| Scroll down frame p95 / max | 33.3 / 50.0 ms | 16.8 / 33.3 ms |        33.3 / 66.7 ms |

## License

MIT; see [LICENSE](LICENSE).
