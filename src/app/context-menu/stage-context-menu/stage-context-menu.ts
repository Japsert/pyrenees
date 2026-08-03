import { Component, computed, effect, inject, signal } from '@angular/core';
import { ColorPicker } from './color-picker/color-picker';
import { Color, color } from 'use-color';
import { MenuAction, MenuService, PlannerService } from '../../services';
import { OverlayIds, OverlayService } from '../../services/overlay';
import { StageMenu } from '../../trip-bar/stage/bar-stage';
import { Input } from '../../input/input';

@Component({
  selector: 'app-stage-context-menu',
  imports: [ColorPicker, Input],
  templateUrl: './stage-context-menu.html',
  styleUrl: './stage-context-menu.css',
})
export class StageContextMenu {
  protected menu = inject(MenuService);
  protected overlay = inject(OverlayService);
  protected planner = inject(PlannerService);
  protected color = color;

  // context-menu.html guarantees that menu is defined and of type StageMenu
  protected readonly menuContent = computed(() => this.menu.menu()!.content as StageMenu);
  protected readonly actions = computed(() => this.menuContent().actions);
  protected readonly route = computed(() => this.menuContent().route());
  protected readonly stage = computed(() => this.menuContent().stage());
  protected readonly isColorPickerOpen = signal<boolean>(false);

  protected toggleColorPicker(): void {
    if (this.isColorPickerOpen()) this.closeColorPicker();
    else this.openColorPicker();
  }

  private openColorPicker(): void {
    this.isColorPickerOpen.set(true);
    this.overlay.add({
      element: OverlayIds.COLOR_PICKER,
      onClose: () => this.isColorPickerOpen.set(false),
    });
  }

  protected closeColorPicker(): void {
    this.isColorPickerOpen.set(false);
    this.overlay.remove(OverlayIds.COLOR_PICKER);
  }

  protected onNameChange(name: string): void {
    if (name.trim() === '') return;
    this.planner.updateStage(this.route(), this.stage(), (stage) => stage.withName(name));
  }

  protected onColorChange(color: Color): void {
    this.planner.updateStage(this.route(), this.stage(), (stage) => stage.withColor(color));
  }

  protected onDescriptionChange(event: Event): void {
    const element = event.target as HTMLInputElement;
    this.planner.updateStage(this.route(), this.stage(), (stage) =>
      stage.withDescription(element.value),
    );
  }

  protected onActionMouseUp(action: MenuAction): void {
    action.run();
    this.menu.close();
  }
}
