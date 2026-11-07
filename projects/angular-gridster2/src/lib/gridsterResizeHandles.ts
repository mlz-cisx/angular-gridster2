import type { GridsterItem } from './gridsterItem';

type Activation = 'hovered' | 'focused' | 'touched';

/** Delegate activation at the grid level instead of adding listeners to every item. */
export class GridsterResizeHandles {
  private readonly items = new WeakMap<Element, GridsterItem>();
  private hovered?: GridsterItem;
  private focused?: GridsterItem;
  private touched?: GridsterItem;

  add(item: GridsterItem): void {
    this.items.set(item.el, item);
  }

  remove(item: GridsterItem): void {
    this.items.delete(item.el);
    for (const state of ['hovered', 'focused', 'touched'] as const) {
      if (this[state] === item) this[state] = undefined;
    }
  }

  activate(state: Activation, target: EventTarget | null): void {
    const previous = this[state];
    const element = target instanceof Element ? target.closest('gridster-item') : null;
    const next = element ? this.items.get(element) : undefined;
    if (previous === next) return;
    this[state] = next;
    if (previous) {
      previous.resize.handlesActive.set(previous === this.hovered || previous === this.focused || previous === this.touched);
    }
    if (next) next.resize.handlesActive.set(true);
  }
}
