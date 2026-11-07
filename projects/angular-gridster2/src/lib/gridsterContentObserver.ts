import { Injectable, inject, NgZone, OnDestroy } from '@angular/core';

/** One observer per grid; only templates that have not rendered remain registered. */
@Injectable()
export class GridsterContentObserver implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly pending = new Map<Element, Set<() => void>>();
  private observer?: IntersectionObserver;
  private root: Element | null = null;
  private margin = '1000px 0px';

  configure(host: Element, margin: string): void {
    const root = this.scrollRoot(host);
    if (this.root === root && this.margin === margin) return;
    this.root = root;
    this.margin = margin;
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.pending.size) {
      const observer = this.createObserver();
      for (const element of this.pending.keys()) observer.observe(element);
    }
  }

  observe(element: Element, activate: () => void): () => void {
    if (typeof IntersectionObserver === 'undefined') {
      activate();
      return () => {};
    }
    let callbacks = this.pending.get(element);
    if (!callbacks) this.pending.set(element, (callbacks = new Set()));
    callbacks.add(activate);
    this.createObserver().observe(element);
    return () => {
      const callbacks = this.pending.get(element);
      callbacks?.delete(activate);
      if (callbacks && !callbacks.size) {
        this.pending.delete(element);
        this.observer?.unobserve(element);
      }
    };
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.pending.clear();
  }

  private createObserver(): IntersectionObserver {
    if (this.observer) return this.observer;
    this.observer = this.zone.runOutsideAngular(
      () =>
        new IntersectionObserver(
          entries => {
            const callbacks: (() => void)[] = [];
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              callbacks.push(...(this.pending.get(entry.target) ?? []));
              this.pending.delete(entry.target);
              this.observer?.unobserve(entry.target);
            }
            if (callbacks.length) this.zone.run(() => callbacks.forEach(activate => activate()));
          },
          { root: this.root, rootMargin: this.margin }
        )
    );
    return this.observer;
  }

  private scrollRoot(host: Element): Element | null {
    if (typeof getComputedStyle === 'undefined') return null;
    for (
      let element: Element | null = host;
      element && element !== document.body && element !== document.documentElement;
      element = element.parentElement
    ) {
      const style = getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY + style.overflowX)) return element;
    }
    return null;
  }
}
