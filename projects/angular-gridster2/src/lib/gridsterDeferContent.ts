import { booleanAttribute, Directive, inject, Input, NgZone, OnDestroy, OnInit, TemplateRef, ViewContainerRef } from '@angular/core';

import { GridsterContentObserver } from './gridsterContentObserver';
import { GridsterItem } from './gridsterItem';

/** Delay creation, then retain the view so leaving the viewport never discards edits. */
@Directive({
  selector: 'ng-template[gridsterDeferContent]',
  exportAs: 'gridsterDeferContent'
})
export class GridsterDeferContent implements OnInit, OnDestroy {
  private readonly item = inject(GridsterItem);
  private readonly observer = inject(GridsterContentObserver);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private readonly zone = inject(NgZone);
  private activated = false;
  private stopObserving?: () => void;
  private initialized?: { unsubscribe(): void };

  /** Setting false renders eagerly; an already-created view is never unloaded. */
  @Input({ alias: 'gridsterDeferContent', transform: booleanAttribute })
  set enabled(enabled: boolean) {
    if (!enabled) this.activate();
  }

  ngOnInit(): void {
    if (this.activated) return;
    if (typeof IntersectionObserver === 'undefined') {
      this.activate();
    } else if (this.item.init) {
      this.observe();
    } else {
      // Unsized shells can all intersect at the origin. Wait for actual geometry.
      this.initialized = this.item.itemInit.subscribe(() => this.observe());
    }
  }

  /** Synchronously create the Angular view before search/highlight code inspects it. */
  activate(): void {
    if (this.activated) return;
    this.activated = true;
    this.initialized?.unsubscribe();
    this.stopObserving?.();
    this.zone.run(() => {
      this.container.createEmbeddedView(this.template).detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.activated = true;
    this.initialized?.unsubscribe();
    this.stopObserving?.();
  }

  private observe(): void {
    if (this.activated) return;
    this.stopObserving = this.observer.observe(this.item.el, () => this.activate());
  }
}
