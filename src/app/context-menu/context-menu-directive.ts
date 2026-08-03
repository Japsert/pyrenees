import { Directive, HostListener, inject, input } from '@angular/core';
import { MenuContent, MenuService } from '../services';

@Directive({
  selector: '[appContextMenu]',
})
export class ContextMenuDirective {
  content = input.required<MenuContent>();

  private readonly menu = inject(MenuService);

  @HostListener('mousedown', ['$event'])
  protected onMouseDown(e: MouseEvent): void {
    if (e.button === 2) e.stopPropagation();
  }

  @HostListener('contextmenu', ['$event'])
  protected onContextMenu(e: MouseEvent): void {
    e.preventDefault(); // don't show default context menu
    e.stopPropagation(); // don't also trigger context menu of element below
    this.menu.open({ coords: { x: e.clientX, y: e.clientY }, content: this.content() });
  }
}
