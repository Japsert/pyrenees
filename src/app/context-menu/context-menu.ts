import { Component, computed, HostListener, inject } from '@angular/core';
import { MenuAction, MenuService } from '../services';

@Component({
  selector: 'app-context-menu',
  imports: [],
  templateUrl: './context-menu.html',
  styleUrl: './context-menu.css',
})
export class ContextMenu {
  private readonly menu = inject(MenuService);
  protected readonly isOpen = computed(() => this.menu.menu() !== null);
  protected readonly left = computed(() => this.menu.menu()?.coords.x);
  protected readonly top = computed(() => this.menu.menu()?.coords.y);
  protected readonly actions = computed(() => this.menu.menu()?.actions);

  protected onMenuMouseDown(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected onActionMouseUp(action: MenuAction): void {
    action.run();
    this.menu.close();
  }

  @HostListener('document:mousedown')
  protected onDocumentMouseDown(): void {
    this.menu.close();
  }

  @HostListener('document:keydown.escape')
  protected onDocumentEscape(): void {
    this.menu.close();
  }
}
