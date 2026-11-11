import { NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  OnDestroy,
  OnInit,
  Renderer2,
  untracked,
  viewChild,
  ViewEncapsulation
} from '@angular/core';
import { debounceTime, Subject, switchMap, takeUntil, timer } from 'rxjs';

import { getCollisionIndex } from './gridsterCollisionIndex';
import { GridsterContentObserver } from './gridsterContentObserver';
import { GridsterCompact } from './gridsterCompact';
import type { GridsterApi, GridsterConfig, GridsterConfigStrict } from './gridsterConfig';
import { GridType } from './gridsterConfig';
import { GridsterConfigService } from './gridsterConfig.constant';
import { GridsterEmptyCell } from './gridsterEmptyCell';
import { GridsterItem } from './gridsterItem';
import { GridsterItemConfig } from './gridsterItemConfig';
import { GridsterPreview } from './gridsterPreview';
import { GridsterRenderer } from './gridsterRenderer';
import { GridsterResizeHandles } from './gridsterResizeHandles';
import { GridsterUtils } from './gridsterUtils';

@Component({
  selector: 'gridster',
  templateUrl: './gridster.html',
  styleUrl: './gridster.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [NgStyle, GridsterPreview],
  providers: [GridsterContentObserver],
  host: {
    '(pointerover)':
      '$options().resizable.handlesOnlyOnActiveItem && $event.pointerType !== "touch" ? resizeHandles.activate("hovered", $event.target) : null',
    '(pointerleave)': '$options().resizable.handlesOnlyOnActiveItem ? resizeHandles.activate("hovered", null) : null',
    '(pointerdown)':
      '$options().resizable.handlesOnlyOnActiveItem && $event.pointerType === "touch" ? resizeHandles.activate("touched", $event.target) : null',
    '(focusin)': '$options().resizable.handlesOnlyOnActiveItem ? resizeHandles.activate("focused", $event.target) : null',
    '(focusout)': '$options().resizable.handlesOnlyOnActiveItem ? resizeHandles.activate("focused", $event.relatedTarget) : null'
  }
})
export class Gridster implements OnInit, OnDestroy {
  protected readonly resizeHandles = new GridsterResizeHandles();
  private readonly contentObserver = inject(GridsterContentObserver);
  readonly renderer = inject(Renderer2);
  readonly cdRef = inject(ChangeDetectorRef);
  readonly zone = inject(NgZone);
  readonly elRef = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly api: GridsterApi = {
    calculateLayout: () => this.calculateLayout(),
    resize: () => this.onResize(),
    getNextPossiblePosition: (newItem: GridsterItemConfig, startingFrom?: { y?: number; x?: number }) =>
      this.getNextPossiblePosition(newItem, startingFrom),
    getFirstPossiblePosition: (item: GridsterItemConfig) => this.getFirstPossiblePosition(item),
    getLastPossiblePosition: (item: GridsterItemConfig) => this.getLastPossiblePosition(item),
    getItemComponent: (item: GridsterItemConfig) => this.getItemComponent(item)
  };

  gridsterPreview = viewChild.required(GridsterPreview);

  options = input.required<GridsterConfig>();
  $options = computed<GridsterConfigStrict>(() =>
    GridsterUtils.merge(JSON.parse(JSON.stringify(GridsterConfigService)), this.options(), GridsterConfigService)
  );

  movingItem: GridsterItemConfig | null;
  el: HTMLElement = this.elRef.nativeElement;
  mobile = false;
  curWidth = 0;
  curHeight = 0;
  grid: GridsterItem[] = [];
  columns = 0;
  rows = 0;
  curColWidth = 0;
  curRowHeight = 0;
  gridColumns = [];
  gridRows = [];
  windowResize: (() => void) | null;
  dragInProgress = false;
  emptyCell: GridsterEmptyCell = new GridsterEmptyCell(this);
  compact: GridsterCompact = new GridsterCompact(this);
  gridRenderer: GridsterRenderer = new GridsterRenderer(this);

  calculateLayout$ = new Subject<void>();

  private readonly dirtyItems = new Set<GridsterItem>();
  private readonly extentChanges = new Set<GridsterItem>();
  private readonly itemExtents = new Map<GridsterItem, { bottom: number; right: number }>();
  private bottom = 0;
  private right = 0;
  private rebuildExtents = true;
  private readonly registeredItems = new Map<GridsterItem, number>();
  private nextItemOrder = 0;
  private readonly layoutChanges$ = new Subject<void>();
  private fullLayoutRequired = true;
  private lastGeometry: (number | boolean)[] = [];

  private resize$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor() {
    effect(() => {
      const $options = this.$options();
      // Individual item inputs must not retrigger this full options refresh.
      untracked(() => {
        if (!$options.disableWindowResize && !this.windowResize) {
          this.windowResize = this.renderer.listen('window', 'resize', this.onResize);
        } else if ($options.disableWindowResize && this.windowResize) {
          this.windowResize();
          this.windowResize = null;
        }
        this.emptyCell.updateOptions();
        this.columns = $options.minCols;
        this.rows = $options.minRows + $options.addEmptyRowsCount;
        this.setGridSize();
        this.calculateLayout();
        this.contentObserver.configure(this.el, $options.deferContentMargin);
      });
    });
  }

  // ------ Function for swapWhileDragging option

  // identical to checkCollision() except that here we add boundaries.
  static checkCollisionTwoItemsForSwaping(item: GridsterItemConfig, item2: GridsterItemConfig): boolean {
    // if the cols or rows of the items are 1 , doesn't make any sense to set a boundary. Only if the item is bigger we set a boundary
    const horizontalBoundaryItem1 = item.cols === 1 ? 0 : 1;
    const horizontalBoundaryItem2 = item2.cols === 1 ? 0 : 1;
    const verticalBoundaryItem1 = item.rows === 1 ? 0 : 1;
    const verticalBoundaryItem2 = item2.rows === 1 ? 0 : 1;
    return (
      item.x + horizontalBoundaryItem1 < item2.x + item2.cols &&
      item.x + item.cols > item2.x + horizontalBoundaryItem2 &&
      item.y + verticalBoundaryItem1 < item2.y + item2.rows &&
      item.y + item.rows > item2.y + verticalBoundaryItem2
    );
  }

  checkCollisionTwoItems(item: GridsterItemConfig, item2: GridsterItemConfig): boolean {
    const collision = item.x < item2.x + item2.cols && item.x + item.cols > item2.x && item.y < item2.y + item2.rows && item.y + item.rows > item2.y;
    if (!collision) {
      return false;
    }
    if (!this.$options().allowMultiLayer) {
      return true;
    }
    const defaultLayerIndex = this.$options().defaultLayerIndex;
    const layerIndex = item.layerIndex === undefined ? defaultLayerIndex : item.layerIndex;
    const layerIndex2 = item2.layerIndex === undefined ? defaultLayerIndex : item2.layerIndex;
    return layerIndex === layerIndex2;
  }

  ngOnInit(): void {
    const options = this.options();
    if (options.initCallback) {
      options.initCallback(this, this.api);
    }

    // Preserve full-refresh semantics for callers of the existing public subject.
    this.calculateLayout$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.fullLayoutRequired = true;
      this.layoutChanges$.next();
    });
    this.layoutChanges$.pipe(debounceTime(0), takeUntil(this.destroy$)).subscribe(() => this.calculateLayout(false));

    this.resize$
      .pipe(
        // Cancel previously scheduled DOM timer if `calculateLayout()` has been called
        // within this time range.
        switchMap(() => timer(100)),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.resize());
  }

  private resize(): void {
    let height: number;
    let width: number;
    if (this.$options().gridType === 'fit' && !this.mobile) {
      width = this.el.offsetWidth;
      height = this.el.offsetHeight;
    } else {
      width = this.el.clientWidth;
      height = this.el.clientHeight;
    }
    if ((width !== this.curWidth || height !== this.curHeight) && this.checkIfToResize()) {
      this.resizeGrid(false);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.dirtyItems.clear();
    this.extentChanges.clear();
    this.itemExtents.clear();
    this.registeredItems.clear();
    if (this.windowResize) {
      this.windowResize();
    }
    const options = this.options();
    if (options && options.destroyCallback) {
      options.destroyCallback(this);
    }
    this.emptyCell.destroy();
    this.emptyCell = null!;
    this.compact.destroy();
    this.compact = null!;
  }

  onResize = (): void => this.resizeGrid(true);

  private resizeGrid(fullRefresh: boolean): void {
    if (this.el.clientWidth) {
      const $options = this.$options();
      if ($options.setGridSize) {
        // reset width/height so the size is recalculated afterward
        this.renderer.setStyle(this.el, 'width', '');
        this.renderer.setStyle(this.el, 'height', '');
      }
      this.setGridSize();
      this.calculateLayout(fullRefresh);
      this.contentObserver.configure(this.el, this.$options().deferContentMargin);
    }
  }

  checkIfToResize(): boolean {
    const clientWidth = this.el.clientWidth;
    const offsetWidth = this.el.offsetWidth;
    const scrollWidth = this.el.scrollWidth;
    const clientHeight = this.el.clientHeight;
    const offsetHeight = this.el.offsetHeight;
    const scrollHeight = this.el.scrollHeight;
    const verticalScrollPresent = clientWidth < offsetWidth && scrollHeight > offsetHeight && scrollHeight - offsetHeight < offsetWidth - clientWidth;
    const horizontalScrollPresent =
      clientHeight < offsetHeight && scrollWidth > offsetWidth && scrollWidth - offsetWidth < offsetHeight - clientHeight;
    if (verticalScrollPresent) {
      return false;
    }
    return !horizontalScrollPresent;
  }

  checkIfMobile(): boolean {
    const $options = this.$options();
    if ($options.useBodyForBreakpoint) {
      return $options.mobileBreakpoint > document.body.clientWidth;
    } else {
      return $options.mobileBreakpoint > this.curWidth;
    }
  }

  setGridSize(): void {
    const el = this.el;
    let width: number;
    let height: number;
    const $options = this.$options();
    if ($options.setGridSize || ($options.gridType === GridType.Fit && !this.mobile)) {
      width = el.offsetWidth;
      height = el.offsetHeight;
    } else {
      width = el.clientWidth;
      height = el.clientHeight;
    }
    this.curWidth = width;
    this.curHeight = height;
  }

  setGridDimensions(): void {
    this.setGridSize();
    if (!this.mobile && this.checkIfMobile()) {
      this.mobile = !this.mobile;
      this.renderer.addClass(this.el, 'mobile');
    } else if (this.mobile && !this.checkIfMobile()) {
      this.mobile = !this.mobile;
      this.renderer.removeClass(this.el, 'mobile');
    }
    const $options = this.$options();
    this.updateExtents();
    const rows = Math.max($options.minRows, this.bottom) + $options.addEmptyRowsCount;
    const columns = Math.max($options.minCols, this.right);
    if (this.columns !== columns || this.rows !== rows) {
      // Only extent changes can alter margins on otherwise unchanged edge items.
      for (let i = this.grid.length - 1; i >= 0; i--) {
        const widget = this.grid[i];
        if (widget.notPlaced) continue;
        const item = widget.$item();
        const bottom = item.y + item.rows;
        const right = item.x + item.cols;
        if (
          (this.rows !== rows && (bottom === this.rows || bottom === rows)) ||
          (this.columns !== columns && (right === this.columns || right === columns))
        ) {
          this.markItemDirty(widget, false);
        }
      }
      this.columns = columns;
      this.rows = rows;
      const options = this.options();
      if (options.gridSizeChangedCallback) {
        options.gridSizeChangedCallback(this);
      }
    }
  }

  private updateExtents(): void {
    // Only shrinking a cached outer edge requires finding a new maximum.
    for (const widget of this.extentChanges) {
      const previous = this.itemExtents.get(widget);
      const item = widget.$item();
      const bottom = widget.notPlaced ? 0 : item.y + item.rows;
      const right = widget.notPlaced ? 0 : item.x + item.cols;
      if (previous && ((previous.bottom === this.bottom && bottom < this.bottom) || (previous.right === this.right && right < this.right))) {
        this.rebuildExtents = true;
      }
      this.itemExtents.set(widget, { bottom, right });
    }
    const items = this.rebuildExtents ? Array.from(this.grid) : this.extentChanges;
    if (this.rebuildExtents) this.bottom = this.right = 0;
    for (const widget of items) {
      const item = widget.$item();
      const bottom = widget.notPlaced ? 0 : item.y + item.rows;
      const right = widget.notPlaced ? 0 : item.x + item.cols;
      this.itemExtents.set(widget, { bottom, right });
      this.bottom = Math.max(this.bottom, bottom);
      this.right = Math.max(this.right, right);
    }
    this.extentChanges.clear();
    this.rebuildExtents = false;
  }

  private calculateLayout(fullRefresh = true): void {
    if (fullRefresh) this.fullLayoutRequired = true;
    if (this.fullLayoutRequired) this.rebuildExtents = true;
    if (this.compact) {
      this.compact.checkCompact();
    }

    this.setGridDimensions();
    const $options = this.$options();
    if ($options.outerMargin) {
      let marginWidth = -$options.margin;
      if ($options.outerMarginLeft !== null) {
        marginWidth += $options.outerMarginLeft;
        this.renderer.setStyle(this.el, 'padding-left', $options.outerMarginLeft + 'px');
      } else {
        marginWidth += $options.margin;
        this.renderer.setStyle(this.el, 'padding-left', $options.margin + 'px');
      }
      if ($options.outerMarginRight !== null) {
        marginWidth += $options.outerMarginRight;
        this.renderer.setStyle(this.el, 'padding-right', $options.outerMarginRight + 'px');
      } else {
        marginWidth += $options.margin;
        this.renderer.setStyle(this.el, 'padding-right', $options.margin + 'px');
      }
      this.curColWidth = (this.curWidth - marginWidth) / this.columns;
      let marginHeight = -$options.margin;
      if ($options.outerMarginTop !== null) {
        marginHeight += $options.outerMarginTop;
        this.renderer.setStyle(this.el, 'padding-top', $options.outerMarginTop + 'px');
      } else {
        marginHeight += $options.margin;
        this.renderer.setStyle(this.el, 'padding-top', $options.margin + 'px');
      }
      if ($options.outerMarginBottom !== null) {
        marginHeight += $options.outerMarginBottom;
        this.renderer.setStyle(this.el, 'padding-bottom', $options.outerMarginBottom + 'px');
      } else {
        marginHeight += $options.margin;
        this.renderer.setStyle(this.el, 'padding-bottom', $options.margin + 'px');
      }
      this.curRowHeight = ((this.curHeight - marginHeight) / this.rows) * $options.rowHeightRatio;
    } else {
      this.curColWidth = (this.curWidth + $options.margin) / this.columns;
      this.curRowHeight = ((this.curHeight + $options.margin) / this.rows) * $options.rowHeightRatio;
      this.renderer.setStyle(this.el, 'padding-left', 0 + 'px');
      this.renderer.setStyle(this.el, 'padding-right', 0 + 'px');
      this.renderer.setStyle(this.el, 'padding-top', 0 + 'px');
      this.renderer.setStyle(this.el, 'padding-bottom', 0 + 'px');
    }
    this.gridRenderer.updateGridster();

    if ($options.setGridSize) {
      this.renderer.addClass(this.el, 'gridSize');
      if (!this.mobile) {
        this.renderer.setStyle(this.el, 'width', this.columns * this.curColWidth + $options.margin + 'px');
        this.renderer.setStyle(this.el, 'height', this.rows * this.curRowHeight + $options.margin + 'px');
      }
    } else {
      this.renderer.removeClass(this.el, 'gridSize');
      this.renderer.setStyle(this.el, 'width', '');
      this.renderer.setStyle(this.el, 'height', '');
    }
    this.updateGridStyles();

    const geometry = [this.curColWidth, this.curRowHeight, this.mobile, this.mobile ? this.curWidth : 0];
    const full = this.fullLayoutRequired || geometry.some((value, index) => value !== this.lastGeometry[index]);
    const items =
      full || this.dirtyItems.size === this.grid.length
        ? Array.from(this.grid).reverse()
        : [...this.dirtyItems].sort((a, b) => this.registeredItems.get(b)! - this.registeredItems.get(a)!);
    // Callbacks may dirty more items; leave those queued for the next pass.
    this.dirtyItems.clear();
    this.fullLayoutRequired = false;
    this.lastGeometry = geometry;
    for (const widget of items) {
      if (!this.registeredItems.has(widget)) continue;
      if (!full && this.dragInProgress && widget.$item() === this.movingItem) {
        // Interaction code owns the moving item's live pixel position/size.
        this.dirtyItems.add(widget);
        continue;
      }
      widget.setSize();
      widget.drag.toggle();
      widget.resize.toggle();
    }
    for (const widget of this.dirtyItems) {
      if (!this.dragInProgress || widget.$item() !== this.movingItem) {
        this.layoutChanges$.next();
        break;
      }
    }

    this.resize$.next();
  }

  /** @internal Pointer updates pass false to preserve their live pixel rendering. */
  markItemDirty(widget: GridsterItem, schedule = true): void {
    if (!this.registeredItems.has(widget)) return;
    this.dirtyItems.add(widget);
    this.extentChanges.add(widget);
    if (schedule) this.layoutChanges$.next();
  }

  updateGrid(): void {
    this.setGridDimensions();
    this.updateGridStyles();
  }

  private updateGridStyles(): void {
    const $options = this.$options();
    if ($options.displayGrid === 'always' && !this.mobile) {
      this.renderer.addClass(this.el, 'display-grid');
    } else if ($options.displayGrid === 'onDrag&Resize' && this.dragInProgress) {
      this.renderer.addClass(this.el, 'display-grid');
    } else if ($options.displayGrid === 'none' || !this.dragInProgress || this.mobile) {
      this.renderer.removeClass(this.el, 'display-grid');
    }
    this.gridColumns.length = Gridster.getNewArrayLength(this.columns, this.curWidth, this.curColWidth);
    this.gridRows.length = Gridster.getNewArrayLength(this.rows, this.curHeight, this.curRowHeight);
    this.cdRef.markForCheck();
  }

  addItem(itemComponent: GridsterItem): void {
    const $item = itemComponent.$item();
    const item = itemComponent.item();
    const $options = this.$options();
    if ($item.cols === undefined) {
      $item.cols = $options.defaultItemCols;
      item.cols = $item.cols;
      itemComponent.itemChanged();
    }
    if ($item.rows === undefined) {
      $item.rows = $options.defaultItemRows;
      item.rows = $item.rows;
      itemComponent.itemChanged();
    }
    if ($item.x === -1 || $item.y === -1) {
      this.autoPositionItem(itemComponent);
    } else if (this.checkCollision($item)) {
      if (!$options.disableWarnings) {
        itemComponent.notPlaced = true;
        console.warn(
          "Can't be placed in the bounds of the dashboard, trying to auto position!/n" +
            JSON.stringify(itemComponent.item, ['cols', 'rows', 'x', 'y'])
        );
      }
      if (!$options.disableAutoPositionOnConflict) {
        this.autoPositionItem(itemComponent);
      } else {
        itemComponent.notPlaced = true;
      }
    }
    this.resizeHandles.add(itemComponent);
    this.grid.push(itemComponent);
    getCollisionIndex(this).add(itemComponent);
    this.registeredItems.set(itemComponent, this.nextItemOrder++);
    this.markItemDirty(itemComponent);
  }

  removeItem(itemComponent: GridsterItem): void {
    const extent = this.itemExtents.get(itemComponent);
    if (extent && (extent.bottom === this.bottom || extent.right === this.right)) this.rebuildExtents = true;
    this.itemExtents.delete(itemComponent);
    this.extentChanges.delete(itemComponent);
    this.registeredItems.delete(itemComponent);
    this.dirtyItems.delete(itemComponent);
    this.resizeHandles.remove(itemComponent);
    getCollisionIndex(this).remove(itemComponent);
    this.grid.splice(this.grid.indexOf(itemComponent), 1);
    this.layoutChanges$.next();

    const options = this.options();
    if (options.itemRemovedCallback) {
      options.itemRemovedCallback(itemComponent.item(), itemComponent);
    }

    // check the moving item was removed
    if (this.movingItem && this.movingItem === itemComponent.$item()) {
      this.movingItem = null;
      this.previewStyle();
    }
  }

  checkCollision(item: GridsterItemConfig, checkRatio?: boolean): GridsterItem | boolean {
    let collision: GridsterItem | boolean = false;
    const options = this.options();
    if (options.itemValidateCallback) {
      collision = !options.itemValidateCallback(item);
    }
    if (!collision && this.checkGridCollision(item, checkRatio)) {
      collision = true;
    }
    if (!collision) {
      const c = this.findItemWithItem(item);
      if (c) {
        collision = c;
      }
    }
    return collision;
  }

  checkGridCollision(item: GridsterItemConfig, checkRatio = false): boolean {
    const $options = this.$options();
    const noNegativePosition = item.y > -1 && item.x > -1;
    const maxGridCols = item.cols + item.x <= $options.maxCols;
    const maxGridRows = item.rows + item.y <= $options.maxRows;
    const maxItemCols = item.maxItemCols === undefined ? $options.maxItemCols : item.maxItemCols;
    const minItemCols = item.minItemCols === undefined ? $options.minItemCols : item.minItemCols;
    const maxItemRows = item.maxItemRows === undefined ? $options.maxItemRows : item.maxItemRows;
    const minItemRows = item.minItemRows === undefined ? $options.minItemRows : item.minItemRows;
    const inColsLimits = item.cols <= maxItemCols && item.cols >= minItemCols;
    const inRowsLimits = item.rows <= maxItemRows && item.rows >= minItemRows;
    let inRatio: boolean = true;
    if (checkRatio) {
      const itemAspectRatio = item.itemAspectRatio || $options.itemAspectRatio;
      if (itemAspectRatio) {
        inRatio = item.cols / item.rows === itemAspectRatio;
      }
    }
    const minAreaLimit = item.minItemArea === undefined ? $options.minItemArea : item.minItemArea;
    const maxAreaLimit = item.maxItemArea === undefined ? $options.maxItemArea : item.maxItemArea;
    const area = item.cols * item.rows;
    const inMinArea = minAreaLimit <= area;
    const inMaxArea = maxAreaLimit >= area;
    return !(noNegativePosition && maxGridCols && maxGridRows && inRatio && inColsLimits && inRowsLimits && inMinArea && inMaxArea);
  }

  findItemWithItem(item: GridsterItemConfig): GridsterItem | boolean {
    for (const widget of getCollisionIndex(this).candidates(item)) {
      if (widget.$item() !== item && this.checkCollisionTwoItems(widget.$item(), item)) {
        return widget;
      }
    }
    return false;
  }

  findItemsWithItem(item: GridsterItemConfig): GridsterItem[] {
    const a: GridsterItem[] = [];
    for (const widget of getCollisionIndex(this).candidates(item)) {
      if (widget.$item() !== item && this.checkCollisionTwoItems(widget.$item(), item)) {
        a.push(widget);
      }
    }
    return a;
  }

  autoPositionItem(itemComponent: GridsterItem): void {
    if (this.getNextPossiblePosition(itemComponent.$item())) {
      itemComponent.notPlaced = false;
      itemComponent.item().x = itemComponent.$item().x;
      itemComponent.item().y = itemComponent.$item().y;
      itemComponent.itemChanged();
    } else {
      itemComponent.notPlaced = true;
      if (!this.$options().disableWarnings) {
        console.warn("Can't be placed in the bounds of the dashboard!/n" + JSON.stringify(itemComponent.item, ['cols', 'rows', 'x', 'y']));
      }
    }
  }

  getNextPossiblePosition = (newItem: GridsterItemConfig, startingFrom: { y?: number; x?: number } = {}): boolean => {
    const $options = this.$options();
    if (newItem.cols === -1) {
      newItem.cols = $options.defaultItemCols;
    }
    if (newItem.rows === -1) {
      newItem.rows = $options.defaultItemRows;
    }
    this.setGridDimensions();
    for (let y = startingFrom.y || 0; y < this.rows; y++) {
      newItem.y = y;
      for (let x = startingFrom.x || 0; x < this.columns; x++) {
        newItem.x = x;
        if (!this.checkCollision(newItem)) {
          return true;
        }
      }
    }
    const canAddToRows = $options.maxRows >= this.rows + newItem.rows;
    const canAddToColumns = $options.maxCols >= this.columns + newItem.cols;
    const addToRows = this.rows <= this.columns && canAddToRows;
    if (!addToRows && canAddToColumns) {
      newItem.x = this.columns;
      newItem.y = 0;
      return true;
    } else if (canAddToRows) {
      newItem.y = this.rows;
      newItem.x = 0;
      return true;
    }
    return false;
  };

  getFirstPossiblePosition = (item: GridsterItemConfig): GridsterItemConfig => {
    const tmpItem = Object.assign({}, item);
    this.getNextPossiblePosition(tmpItem);
    return tmpItem;
  };

  getLastPossiblePosition = (item: GridsterItemConfig): GridsterItemConfig => {
    let farthestItem: { y: number; x: number } = { y: 0, x: 0 };
    farthestItem = this.grid.reduce((prev: { y: number; x: number }, curr: GridsterItem) => {
      const $item = curr.$item();
      const currCoords = {
        y: $item.y + $item.rows - 1,
        x: $item.x + $item.cols - 1
      };
      if (GridsterUtils.compareItems(prev, currCoords) === 1) {
        return currCoords;
      } else {
        return prev;
      }
    }, farthestItem);

    const tmpItem = Object.assign({}, item);
    this.getNextPossiblePosition(tmpItem, farthestItem);
    return tmpItem;
  };

  pixelsToPositionX(x: number, roundingMethod: (x: number) => number, noLimit?: boolean): number {
    const position = roundingMethod(x / this.curColWidth);
    if (noLimit) {
      return position;
    } else {
      return Math.max(position, 0);
    }
  }

  pixelsToPositionY(y: number, roundingMethod: (x: number) => number, noLimit?: boolean): number {
    const position = roundingMethod(y / this.curRowHeight);
    if (noLimit) {
      return position;
    } else {
      return Math.max(position, 0);
    }
  }

  positionXToPixels(x: number): number {
    return x * this.curColWidth;
  }

  positionYToPixels(y: number): number {
    return y * this.curRowHeight;
  }

  getItemComponent(item: GridsterItemConfig): GridsterItem | undefined {
    return this.grid.find(c => c.item() === item);
  }

  // ------ Functions for swapWhileDragging option

  // identical to checkCollision() except that this function calls findItemWithItemForSwaping() instead of findItemWithItem()
  checkCollisionForSwaping(item: GridsterItemConfig): GridsterItem | boolean {
    let collision: GridsterItem | boolean = false;
    const options = this.options();
    if (options.itemValidateCallback) {
      collision = !options.itemValidateCallback(item);
    }
    if (!collision && this.checkGridCollision(item)) {
      collision = true;
    }
    if (!collision) {
      const c = this.findItemWithItemForSwapping(item);
      if (c) {
        collision = c;
      }
    }
    return collision;
  }

  // identical to findItemWithItem() except that this function calls checkCollisionTwoItemsForSwaping() instead of checkCollisionTwoItems()
  findItemWithItemForSwapping(item: GridsterItemConfig): GridsterItem | boolean {
    for (const widget of getCollisionIndex(this).candidates(item).reverse()) {
      if (widget.$item() !== item && Gridster.checkCollisionTwoItemsForSwaping(widget.$item(), item)) {
        return widget;
      }
    }
    return false;
  }

  previewStyle(drag = false): void {
    const preview = this.gridsterPreview();

    if (this.movingItem) {
      if (this.compact && drag) {
        this.compact.checkCompactItem(this.movingItem);
      }
      preview.previewStyle(this.movingItem);
    } else {
      preview.previewStyle(null);
    }
  }

  // ------ End of functions for swapWhileDragging option

  // eslint-disable-next-line @typescript-eslint/member-ordering
  private static getNewArrayLength(length: number, overallSize: number, size: number): number {
    const newLength = Math.max(length, Math.floor(overallSize / size));

    if (newLength < 0) {
      return 0;
    }

    if (Number.isFinite(newLength)) {
      return Math.floor(newLength);
    }

    return 0;
  }
}
