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
    e.preventDefault(); // don't show default context menu
    e.stopPropagation(); // don't also trigger context menu of element below
    this.menu.open({ coords: { x: e.clientX, y: e.clientY }, actions: this.actions() });
  }
}
