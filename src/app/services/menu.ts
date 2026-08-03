import { effect, ElementRef, HostListener, inject, Injectable, signal } from '@angular/core';
import { OverlayIds, OverlayService } from './overlay';

export type MenuAction = {
  icon: string;
  label: string;
  run: () => void;
};
export type MenuCoordinates = { x: number; y: number };
export interface MenuContent {
  readonly type: 'route' | 'stage';
  actions: MenuAction[];
}
export type Menu = {
  coords: MenuCoordinates;
  content: MenuContent;
};

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  protected overlay = inject(OverlayService);

  menu = signal<Menu | null>(null);

  open(menu: Menu): void {
    this.menu.set(menu);
    this.overlay.add({ element: OverlayIds.CONTEXT_MENU, onClose: () => this.close() });
  }

  close(): void {
    this.overlay.remove(OverlayIds.CONTEXT_MENU);
    this.menu.set(null);
  }
}
