import { Injectable, signal } from '@angular/core';

export type MenuCoordinates = {
  x: number;
  y: number;
};
export type MenuAction = {
  icon: string;
  label: string;
  run: () => any;
};
export type Menu = {
  coords: MenuCoordinates;
  actions: MenuAction[];
};

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  menu = signal<Menu | null>(null);

  open(menu: Menu): void {
    this.menu.set(menu);
  }

  close(): void {
    this.menu.set(null);
  }
}
