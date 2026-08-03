import { AnimationCallbackEvent, Component, inject, input, Signal, signal } from '@angular/core';
import { Route, Stage } from '../../model';
import { MenuAction, MenuContent, PlannerService } from '../../services';
import { ContextMenuDirective } from '../../context-menu/context-menu-directive';

export interface StageMenu extends MenuContent {
  readonly type: 'stage';
  route: Signal<Route>;
  stage: Signal<Stage>;
  actions: MenuAction[];
}

@Component({
  selector: 'app-stage',
  imports: [ContextMenuDirective],
  templateUrl: './bar-stage.html',
  host: {
    class: 'overflow-hidden',
    '(animate.enter)': 'onEnter($event)',
    '(animate.leave)': 'onLeave($event)',
  },
})
export class BarStage {
  readonly route = input.required<Route>();
  readonly stage = input.required<Stage>();
  readonly renderedOnce = input.required<boolean>();
  readonly isOnly = input.required<boolean>();

  private readonly planner = inject(PlannerService);

  // Will be initialized immediately in ngOnInit
  protected readonly menuContent = signal<StageMenu>(null as unknown as StageMenu);

  ngOnInit(): void {
    this.menuContent.set({
      type: 'stage',
      route: this.route,
      stage: this.stage,
      actions: [
        {
          icon: '📑',
          label: 'Duplicate',
          run: () => this.planner.duplicateStage(this.route(), this.stage()),
        },
        {
          icon: '🗑️',
          label: 'Delete',
          run: () => this.planner.deleteStage(this.route(), this.stage()),
        },
      ],
    });
  }

  protected onEnter(event: AnimationCallbackEvent): void {
    if (!this.renderedOnce()) return event.animationComplete();
    const element = event.target as HTMLElement;
    const width = element.offsetWidth;
    const animation = this.isOnly()
      ? element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' })
      : element.animate(
          [
            { width: '0px', minWidth: '0px', opacity: 0 },
            { width: `${width}px`, minWidth: '0px', opacity: 1 },
          ],
          { duration: 200, easing: 'ease' },
        );
    animation.finished.then(() => event.animationComplete());
  }

  protected onLeave(event: AnimationCallbackEvent): void {
    const element = event.target as HTMLElement;
    const width = element.offsetWidth;
    let animation: Animation;
    if (this.isOnly()) {
      element.style.position = 'absolute';
      element.style.width = `${width}px`;
      animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 200,
        easing: 'ease',
      });
    } else {
      animation = element.animate(
        [
          { width: `${width}px`, minWidth: '0px', opacity: 1 },
          { width: '0px', minWidth: '0px', opacity: 0 },
        ],
        { duration: 200, easing: 'ease' },
      );
    }
    animation.finished.then(() => event.animationComplete());
  }

  protected isStageSelected(stage: Stage): boolean {
    return this.planner.selectedStage() === stage;
  }

  protected onStageLeftClick(event: PointerEvent, route: Route, stage: Stage): void {
    event.stopPropagation();
    if (this.isStageSelected(stage)) {
      this.planner.deselectStage();
      return;
    }
    this.planner.selectStage(route, stage);
  }

  protected setStageName(route: Route, stage: Stage, name: string): void {
    this.planner.updateStage(route, stage, (stage) => stage.withName(name));
  }
}
