import { Component, computed, inject } from '@angular/core';
import { MenuService, MenuAction, PlannerService } from '../../services';
import { Input } from '../../input/input';
import { OverlayService } from '../../services/overlay';
import { RouteMenu } from '../../trip-bar/route/bar-route';

@Component({
  selector: 'app-route-context-menu',
  imports: [Input],
  templateUrl: './route-context-menu.html',
  styleUrl: './route-context-menu.css',
})
export class RouteContextMenu {
  protected menu = inject(MenuService);
  protected overlay = inject(OverlayService);
  protected planner = inject(PlannerService);

  // context-menu.html guarantees that menu is defined and of type StageMenu
  protected readonly menuContent = computed(() => this.menu.menu()!.content as RouteMenu);
  protected readonly actions = computed(() => this.menuContent().actions);
  protected readonly route = computed(() => this.menuContent().route());

  protected onNameChange(name: string): void {
    if (name.trim() === '') return;
    this.planner.updateRoute(this.route(), (route) => route.withName(name));
  }

  protected onDescriptionChange(event: Event): void {
    const element = event.target as HTMLInputElement;
    this.planner.updateRoute(this.route(), (route) => route.withDescription(element.value));
  }

  protected onActionMouseUp(action: MenuAction): void {
    action.run();
    this.menu.close();
  }
}
