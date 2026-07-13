import { afterNextRender, AnimationCallbackEvent, Component, inject, OnInit } from '@angular/core';
import { InteractionService, PlannerService } from '../../services';
import { Route, Stage } from '../../model';

@Component({
  selector: 'app-trip-bar',
  templateUrl: './trip-bar.html',
  styleUrl: './trip-bar.css',
})
export class TripBar implements OnInit {
  private readonly planner = inject(PlannerService);
  private readonly interaction = inject(InteractionService);

  protected trip = this.planner.trip;

  // animate.enter also fires for elements already present on first render; skip
  // those so stages only animate in when actually added.
  private renderedOnce = false;

  constructor() {
    afterNextRender(() => (this.renderedOnce = true));
  }

  ngOnInit(): void {
    document.addEventListener('mousemove', (e) => {
      const createStageButtons = document.querySelectorAll<HTMLElement>('.create-stage-button');
      const createRouteButton = document.getElementById('create-route-button');
      if (createRouteButton === null) return;

      for (const button of createStageButtons) {
        const rect = button.getBoundingClientRect();
        const buttonX = rect.left;
        const buttonY = rect.top + rect.height / 2;
        const distance = Math.hypot(e.clientX - buttonX, e.clientY - buttonY);
        button.classList.toggle('mouse-is-near', distance < 50);
      }

      const rect = createRouteButton.getBoundingClientRect();
      const buttonX = rect.left;
      const buttonY = rect.top + rect.height / 2;
      const distance = Math.hypot(e.clientX - buttonX, e.clientY - buttonY);
      createRouteButton.classList.toggle('mouse-is-near', distance < 50);
    });
  }

  protected isStageSelected(stage: Stage): boolean {
    return this.planner.selectedStage() === stage;
  }

  protected onRouteRightClick(route: Route, event: MouseEvent): void {
    event.preventDefault();
    // TODO: show context menu (and select) instead of deleting
    this.planner.deleteRoute(route);
  }

  protected onStageLeftClick(route: Route, stage: Stage): void {
    if (this.isStageSelected(stage)) {
      this.planner.deselectStage();
      return;
    }
    this.planner.selectStage(route, stage);
  }

  protected onStageRightClick(route: Route, stage: Stage, event: MouseEvent): void {
    event.preventDefault();
    // TODO: show context menu (and select) instead of deleting
    this.interaction.turnAddingWaypointsOff();
    this.planner.deleteStage(route, stage);
  }

  protected setRouteName(route: Route, name: string): void {
    this.planner.updateRoute(route, (route) => route.withName(name));
  }

  protected setStageName(route: Route, stage: Stage, name: string): void {
    this.planner.updateStage(route, stage, (stage) => stage.withName(name));
  }

  protected createStage(route: Route): void {
    this.planner.addStage(route);
    this.interaction.turnAddingWaypointsOn();
    // manually update classlist instead of only after mousemove
    for (const button of document.getElementsByClassName('create-stage-button')) {
      button.classList.remove('mouse-is-near');
    }
  }

  protected onEnter(event: AnimationCallbackEvent, type: 'route' | 'stage'): void {
    if (!this.renderedOnce) return event.animationComplete();
    const stageElement = event.target as HTMLElement;
    const isFirst = stageElement.parentElement!.querySelectorAll(`[data-${type}-id]`).length === 1;
    const width = stageElement.offsetWidth;
    const animation = isFirst
      ? stageElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' })
      : stageElement.animate(
          [
            { width: '0px', minWidth: '0px', opacity: 0 },
            { width: `${width}px`, minWidth: '0px', opacity: 1 },
          ],
          { duration: 200, easing: 'ease' },
        );
    animation.finished.then(() => event.animationComplete());
  }

  protected onLeave(event: AnimationCallbackEvent, type: 'route' | 'stage'): void {
    const el = event.target as HTMLElement;
    const width = el.offsetWidth;
    const isLast = el.parentElement!.querySelectorAll(`[data-${type}-id]`).length === 1;
    let animation: Animation;
    if (isLast) {
      el.style.position = 'absolute';
      el.style.width = `${width}px`;
      animation = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease' });
    } else {
      animation = el.animate(
        [
          { width: `${width}px`, minWidth: '0px', opacity: 1 },
          { width: '0px', minWidth: '0px', opacity: 0 },
        ],
        { duration: 200, easing: 'ease' },
      );
    }
    animation.finished.then(() => event.animationComplete());
  }

  protected onEmptyEnter(event: AnimationCallbackEvent, type: 'route' | 'stage'): void {
    if (!this.renderedOnce) return event.animationComplete();
    const el = event.target as HTMLElement;
    const target = el.offsetWidth;
    const leaving = el.parentElement!.querySelector<HTMLElement>(`[data-${type}-id]`);
    const from = leaving?.offsetWidth;
    const animation =
      from === undefined
        ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' })
        : el.animate(
            [
              { width: `${from}px`, minWidth: '0px', opacity: 0 },
              { width: `${target}px`, minWidth: '0px', opacity: 1 },
            ],
            { duration: 200, easing: 'ease' },
          );
    animation.finished.then(() => event.animationComplete());
  }

  protected createRoute(): void {
    // manually update classlist instead of only after mousemove
    document.getElementById('create-route-button')?.classList.remove('mouse-is-near');
    this.planner.addRoute();
  }
}
