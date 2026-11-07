import type { Gridster } from './gridster';
import type { GridsterItem } from './gridsterItem';
import type { GridsterItemConfig } from './gridsterItemConfig';

type BandRange = { first: number; last: number };
type Entry = { order: number; range?: BandRange };

/** Internal broad-phase index. Exact overlap and layer checks stay in Gridster. */
class GridsterCollisionIndex {
  private readonly bands = new Map<number, Set<GridsterItem>>();
  private readonly entries = new Map<GridsterItem, Entry>();
  private readonly overflow = new Set<GridsterItem>();
  private readonly rectangles = new WeakMap<GridsterItem, GridsterItemConfig>();
  private nextOrder = 0;

  track(widget: GridsterItem, item: GridsterItemConfig): GridsterItemConfig {
    this.update(widget, item);
    // Internal rectangles are mutated directly by drag, push, swap and rollback.
    // Observe vertical changes here so indexing never depends on DOM rendering.
    for (const property of ['y', 'rows'] as const) {
      let value = item[property];
      Object.defineProperty(item, property, {
        enumerable: true,
        configurable: true,
        get: () => value,
        set: next => {
          value = next;
          if (this.rectangles.get(widget) === item) this.update(widget, item);
        }
      });
    }
    return item;
  }

  add(widget: GridsterItem): void {
    this.entries.set(widget, { order: this.nextOrder++ });
    this.overflow.add(widget);
    this.update(widget, widget.$item());
  }

  remove(widget: GridsterItem): void {
    const entry = this.entries.get(widget);
    if (entry?.range) {
      for (let band = entry.range.first; band <= entry.range.last; band++) {
        const items = this.bands.get(band)!;
        items.delete(widget);
        if (!items.size) this.bands.delete(band);
      }
    }
    this.overflow.delete(widget);
    this.entries.delete(widget);
  }

  candidates(item: GridsterItemConfig): GridsterItem[] {
    const range = this.range(item);
    const candidates = new Set(range ? this.overflow : this.entries.keys());
    if (range) {
      for (let band = range.first; band <= range.last; band++) {
        for (const widget of this.bands.get(band) ?? []) candidates.add(widget);
      }
    }
    // Preserve grid insertion order, including when an item changes bands.
    return [...candidates].sort((a, b) => this.entries.get(a)!.order - this.entries.get(b)!.order);
  }

  update(widget: GridsterItem, item: GridsterItemConfig): void {
    this.rectangles.set(widget, item);
    const entry = this.entries.get(widget);
    if (!entry) return;
    const range = this.range(item);
    if (entry.range?.first === range?.first && entry.range?.last === range?.last) return;
    this.remove(widget);
    this.entries.set(widget, { order: entry.order, range });
    if (!range) {
      this.overflow.add(widget);
      return;
    }
    for (let band = range.first; band <= range.last; band++) {
      let items = this.bands.get(band);
      if (!items) this.bands.set(band, (items = new Set()));
      items.add(widget);
    }
  }

  private range(item: GridsterItemConfig): BandRange | undefined {
    const first = Math.floor(item.y / 32);
    const last = Math.ceil((item.y + item.rows) / 32) - 1;
    // Bound work for malformed or exceptionally tall rectangles; use a full scan.
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last < first || last - first > 1024) return;
    return { first, last };
  }
}

const indexes = new WeakMap<Gridster, GridsterCollisionIndex>();

export function getCollisionIndex(gridster: Gridster): GridsterCollisionIndex {
  let index = indexes.get(gridster);
  if (!index) indexes.set(gridster, (index = new GridsterCollisionIndex()));
  return index;
}
