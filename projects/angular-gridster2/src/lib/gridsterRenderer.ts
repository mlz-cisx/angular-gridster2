import { Renderer2 } from '@angular/core';

import { Gridster } from './gridster';
import { DirTypes, GridType } from './gridsterConfig';
import { GridsterItemConfig } from './gridsterItemConfig';
import { CommonGridStyle, GridColumnCachedStyle, GridRowCachedStyle } from './gridsterRendererTypes';

export class GridsterRenderer {
  /**
   * Caches the last grid column styles.
   * This improves the grid responsiveness by caching and reusing the last style object instead of creating a new one.
   */
  private lastGridColumnStyles: Record<number, GridColumnCachedStyle> = {};

  /**
   * Caches the last grid column styles.
   * This improves the grid responsiveness by caching and reusing the last style object instead of creating a new one.
   */
  private lastGridRowStyles: Record<number, GridRowCachedStyle> = {};

  constructor(private gridster: Gridster) {}

  updateItem(el: Element, item: GridsterItemConfig, renderer: Renderer2): void {
    const $options = this.gridster.$options();
    if (this.gridster.mobile) {
      this.clearCellPosition(renderer, el);
      if ($options.keepFixedHeightInMobile) {
        this.setItemStyle(renderer, el, 'height', (item.rows - 1) * $options.margin + item.rows * $options.fixedRowHeight + 'px');
      } else {
        this.setItemStyle(renderer, el, 'height', (item.rows * this.gridster.curWidth) / item.cols + 'px');
      }
      if ($options.keepFixedWidthInMobile) {
        this.setItemStyle(renderer, el, 'width', $options.fixedColWidth + 'px');
      } else {
        this.setItemStyle(renderer, el, 'width', '');
      }

      this.setItemStyle(renderer, el, 'margin-bottom', $options.margin + 'px');
      this.setItemStyle(renderer, el, DirTypes.LTR ? 'margin-right' : 'margin-left', '');
    } else {
      const x = Math.round(this.gridster.curColWidth * item.x);
      const y = Math.round(this.gridster.curRowHeight * item.y);
      const width = this.gridster.curColWidth * item.cols - $options.margin;
      const height = this.gridster.curRowHeight * item.rows - $options.margin;
      // set the cell style
      this.setCellPosition(renderer, el, x, y);
      this.setItemStyle(renderer, el, 'width', width + 'px');
      this.setItemStyle(renderer, el, 'height', height + 'px');
      let marginBottom: string | null = null;
      let marginRight: string | null = null;
      if ($options.outerMargin) {
        if (this.gridster.rows === item.rows + item.y) {
          if ($options.outerMarginBottom !== null) {
            marginBottom = $options.outerMarginBottom + 'px';
          } else {
            marginBottom = $options.margin + 'px';
          }
        }
        if (this.gridster.columns === item.cols + item.x) {
          if ($options.outerMarginBottom !== null) {
            marginRight = $options.outerMarginRight + 'px';
          } else {
            marginRight = $options.margin + 'px';
          }
        }
      }

      this.setItemStyle(renderer, el, 'margin-bottom', marginBottom);
      this.setItemStyle(renderer, el, $options.dirType === DirTypes.LTR ? 'margin-right' : 'margin-left', marginRight);
    }
  }

  updateGridster(): void {
    const $options = this.gridster.$options();
    let addClass = '';
    let removeClass1 = '';
    let removeClass2 = '';
    let removeClass3 = '';
    if ($options.gridType === GridType.Fit) {
      addClass = GridType.Fit;
      removeClass1 = GridType.ScrollVertical;
      removeClass2 = GridType.ScrollHorizontal;
      removeClass3 = GridType.Fixed;
    } else if ($options.gridType === GridType.ScrollVertical) {
      this.gridster.curRowHeight = this.gridster.curColWidth * $options.rowHeightRatio;
      addClass = GridType.ScrollVertical;
      removeClass1 = GridType.Fit;
      removeClass2 = GridType.ScrollHorizontal;
      removeClass3 = GridType.Fixed;
    } else if ($options.gridType === GridType.ScrollHorizontal) {
      const widthRatio = $options.rowHeightRatio;
      const calWidthRatio = widthRatio >= 1 ? widthRatio : widthRatio + 1;
      this.gridster.curColWidth = this.gridster.curRowHeight * calWidthRatio;
      addClass = GridType.ScrollHorizontal;
      removeClass1 = GridType.Fit;
      removeClass2 = GridType.ScrollVertical;
      removeClass3 = GridType.Fixed;
    } else if ($options.gridType === GridType.Fixed) {
      this.gridster.curColWidth = $options.fixedColWidth + ($options.ignoreMarginInRow ? 0 : $options.margin);
      this.gridster.curRowHeight = $options.fixedRowHeight + ($options.ignoreMarginInRow ? 0 : $options.margin);
      addClass = GridType.Fixed;
      removeClass1 = GridType.Fit;
      removeClass2 = GridType.ScrollVertical;
      removeClass3 = GridType.ScrollHorizontal;
    } else if ($options.gridType === GridType.VerticalFixed) {
      this.gridster.curRowHeight = $options.fixedRowHeight + ($options.ignoreMarginInRow ? 0 : $options.margin);
      addClass = GridType.ScrollVertical;
      removeClass1 = GridType.Fit;
      removeClass2 = GridType.ScrollHorizontal;
      removeClass3 = GridType.Fixed;
    } else if ($options.gridType === GridType.HorizontalFixed) {
      this.gridster.curColWidth = $options.fixedColWidth + ($options.ignoreMarginInRow ? 0 : $options.margin);
      addClass = GridType.ScrollHorizontal;
      removeClass1 = GridType.Fit;
      removeClass2 = GridType.ScrollVertical;
      removeClass3 = GridType.Fixed;
    }

    if (this.gridster.mobile || ($options.setGridSize && $options.gridType !== GridType.Fit)) {
      this.gridster.renderer.removeClass(this.gridster.el, addClass);
    } else {
      this.gridster.renderer.addClass(this.gridster.el, addClass);
    }
    this.gridster.renderer.removeClass(this.gridster.el, removeClass1);
    this.gridster.renderer.removeClass(this.gridster.el, removeClass2);
    this.gridster.renderer.removeClass(this.gridster.el, removeClass3);
  }

  /** Two repeated paint layers replace one DOM element per logical row/column. */
  getGridBackgroundStyle(horizontal: boolean): Record<string, string> {
    const grid = this.gridster;
    const options = grid.$options();
    const pitch = horizontal ? grid.curRowHeight : grid.curColWidth;
    const count = horizontal ? grid.gridRows.length : grid.gridColumns.length;
    const cell = Math.max(0, pitch - options.margin);
    if (!Number.isFinite(pitch) || pitch <= 0 || count === 0 || cell <= 0) {
      return { display: 'none' };
    }
    const rtlOffset = options.dirType === DirTypes.RTL ? -(grid.gridColumns.length - 1) * grid.curColWidth : 0;
    const width = horizontal ? grid.gridColumns.length * grid.curColWidth + options.margin : (count - 1) * pitch + cell;
    const height = horizontal ? (count - 1) * pitch + cell : grid.gridRows.length * grid.curRowHeight - options.margin;
    return {
      left: this.getLeftMargin() + (horizontal ? 0 : rtlOffset) + 'px',
      top: this.getTopMargin() + 'px',
      width: Math.max(0, width) + 'px',
      height: Math.max(0, height) + 'px',
      'background-image': `repeating-linear-gradient(to ${horizontal ? 'bottom' : 'right'}, var(--gridster-grid-line-color, white) 0px, var(--gridster-grid-line-color, white) 1px, transparent 1px, transparent ${Math.max(1, cell - 1)}px, var(--gridster-grid-line-color, white) ${Math.max(1, cell - 1)}px, var(--gridster-grid-line-color, white) ${cell}px, transparent ${cell}px, transparent ${pitch}px)`
    };
  }

  getGridColumnStyle(i: number): CommonGridStyle {
    const margin = this.gridster.$options().margin;
    // generates the new style
    const newPos: GridColumnCachedStyle = {
      left: this.gridster.curColWidth * i,
      width: this.gridster.curColWidth - margin,
      height: this.gridster.gridRows.length * this.gridster.curRowHeight - margin,
      style: {}
    };
    newPos.style = {
      ...this.getLeftPosition(newPos.left),
      width: newPos.width + 'px',
      height: newPos.height + 'px'
    };

    // use the last cached style if it has same values as the generated one
    const last = this.lastGridColumnStyles[i];
    if (last && last.left === newPos.left && last.width === newPos.width && last.height === newPos.height) {
      return last.style;
    }

    // cache and set new style
    this.lastGridColumnStyles[i] = newPos;
    return newPos.style;
  }

  getGridRowStyle(i: number): CommonGridStyle {
    const margin = this.gridster.$options().margin;
    // generates the new style
    const newPos: GridRowCachedStyle = {
      top: this.gridster.curRowHeight * i,
      width: this.gridster.gridColumns.length * this.gridster.curColWidth + margin,
      height: this.gridster.curRowHeight - margin,
      style: {}
    };
    newPos.style = {
      ...this.getTopPosition(newPos.top),
      width: newPos.width + 'px',
      height: newPos.height + 'px'
    };

    // use the last cached style if it has same values as the generated one
    const last = this.lastGridRowStyles[i];
    if (last && last.top === newPos.top && last.width === newPos.width && last.height === newPos.height) {
      return last.style;
    }

    // cache and set new style
    this.lastGridRowStyles[i] = newPos;
    return newPos.style;
  }

  getLeftPosition(d: number): { left: string } | { transform: string } {
    const $options = this.gridster.$options();
    const dPosition = $options.dirType === DirTypes.RTL ? -d : d;
    if ($options.useTransformPositioning) {
      return {
        transform: 'translateX(' + dPosition + 'px)'
      };
    } else {
      return {
        left: this.getLeftMargin() + dPosition + 'px'
      };
    }
  }

  getTopPosition(d: number): { top: string } | { transform: string } {
    if (this.gridster.$options().useTransformPositioning) {
      return {
        transform: 'translateY(' + d + 'px)'
      };
    } else {
      return {
        top: this.getTopMargin() + d + 'px'
      };
    }
  }

  clearCellPosition(renderer: Renderer2, el: Element): void {
    if (this.gridster.$options().useTransformPositioning) {
      this.setItemStyle(renderer, el, 'transform', '');
    } else {
      this.setItemStyle(renderer, el, 'top', '');
      this.setItemStyle(renderer, el, 'left', '');
    }
  }

  setCellPosition(renderer: Renderer2, el: Element, x: number, y: number): void {
    const $options = this.gridster.$options();
    const xPosition = $options.dirType === DirTypes.RTL ? -x : x;
    if ($options.useTransformPositioning) {
      const transform = 'translate3d(' + xPosition + 'px, ' + y + 'px, 0)';
      this.setItemStyle(renderer, el, 'transform', transform);
    } else {
      this.setItemStyle(renderer, el, 'left', this.getLeftMargin() + xPosition + 'px');
      this.setItemStyle(renderer, el, 'top', this.getTopMargin() + y + 'px');
    }
  }

  private setItemStyle(renderer: Renderer2, el: Element, property: string, value: string | null): void {
    // Read inline styles, not computed layout. Drag/resize may have written them directly.
    if ((el as HTMLElement).style.getPropertyValue(property) !== (value ?? '')) {
      renderer.setStyle(el, property, value);
    }
  }

  getLeftMargin(): number {
    const $options = this.gridster.$options();
    if ($options.outerMargin) {
      if ($options.outerMarginLeft !== null) {
        return $options.outerMarginLeft;
      } else {
        return $options.margin;
      }
    } else {
      return 0;
    }
  }

  getTopMargin(): number {
    const $options = this.gridster.$options();
    if ($options.outerMargin) {
      if ($options.outerMarginTop !== null) {
        return $options.outerMarginTop;
      } else {
        return $options.margin;
      }
    } else {
      return 0;
    }
  }
}
