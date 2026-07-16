import { Directive, HostListener, inject, input } from '@angular/core';
import { MenuAction, MenuService } from '../services';

@Directive({
  selector: '[appContextMenu]',
})
export class ContextMenuDirective {
  actions = input.required<MenuAction[]>();

  private readonly menu = inject(MenuService);

  @HostListener('contextmenu', ['$event'])
  protected onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    this.menu.open({ coords: { x: e.clientX, y: e.clientY }, actions: this.actions() });
  }
}
