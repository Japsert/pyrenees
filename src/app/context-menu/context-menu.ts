import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MenuService } from '../services';
import { RouteContextMenu } from './route-context-menu/route-context-menu';
import { StageContextMenu } from './stage-context-menu/stage-context-menu';

const WINDOW_EDGE_MARGIN_PX = 6;

@Component({
  selector: 'app-context-menu',
  imports: [RouteContextMenu, StageContextMenu],
  templateUrl: './context-menu.html',
  styleUrl: './context-menu.css',
})
export class ContextMenu {
  private readonly contextMenu = viewChild<ElementRef<HTMLDivElement>>('contextMenu');

  protected readonly menu = inject(MenuService);

  protected readonly isOpen = computed(() => this.menu.menu() !== null);
  protected readonly left = computed(() => this.menu.menu()?.coords.x);
  protected readonly top = computed(() => this.menu.menu()?.coords.y);
  protected readonly contentType = computed(() => this.menu.menu()!.content.type);

  protected readonly x = signal<number>(0);
  protected readonly y = signal<number>(0);
  protected readonly isPositioned = signal<boolean>(false);

  constructor() {
    effect(() => {
      const menuData = this.menu.menu();
      const menuElement = this.contextMenu();

      if (!menuData || !menuElement) {
        this.isPositioned.set(false);
        return;
      }

      queueMicrotask(() => {
        const rect = menuElement.nativeElement.getBoundingClientRect();
        const windowWidth = globalThis.innerWidth;
        const windowHeight = globalThis.innerHeight;
        const safeX = Math.min(menuData.coords.x, windowWidth - rect.width - WINDOW_EDGE_MARGIN_PX);
        const safeY = Math.min(
          menuData.coords.y,
          windowHeight - rect.height - WINDOW_EDGE_MARGIN_PX,
        );
        this.x.set(safeX);
        this.y.set(safeY);
        this.isPositioned.set(true);
      });
    });
  }

  protected onMenuMouseDown(event: MouseEvent): void {
    event.stopPropagation();
  }
}
