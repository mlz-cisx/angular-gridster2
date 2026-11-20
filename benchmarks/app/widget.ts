import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Deterministic DOM workload, without network requests or third-party widget code. */
@Component({
  selector: 'app-benchmark-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <strong>Widget {{ id() }}</strong>
    <div class="values">
      @for (value of values; track value) {
        <span>{{ id() + value }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 4px;
      font-size: 10px;
    }
    .values {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
    }
  `
})
export class BenchmarkWidget {
  readonly id = input.required<number>();
  readonly values = Array.from({ length: 24 }, (_, index) => index);
}
