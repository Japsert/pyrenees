import { AnimationCallbackEvent, Component, inject, OnInit } from '@angular/core';
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

  ngOnInit(): void {
    document.addEventListener('mousemove', (e) => {
      const button = document.getElementById('create-stage-button');
      if (button === null) return;

      const rect = button.getBoundingClientRect();
      const buttonX = rect.left;
      const buttonY = rect.top + rect.height / 2;
      const distance = Math.hypot(e.clientX - buttonX, e.clientY - buttonY);

      button.classList.toggle('mouse-is-near', distance < 75);
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
    document.getElementById('create-stage-button')?.classList.remove('mouse-is-near');
    this.planner.addStage(route);
    this.interaction.turnAddingWaypointsOn();
  }

  protected onStageEnter(event: AnimationCallbackEvent): void {
    const el = event.target as HTMLElement;
    const isFirst = el.parentElement!.querySelectorAll('[data-stage-id]').length === 1;
    const width = el.offsetWidth;
    const animation = isFirst
      ? el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' })
      : el.animate(
          [
            { width: '0px', minWidth: '0px', opacity: 0 },
            { width: `${width}px`, minWidth: '0px', opacity: 1 },
          ],
          { duration: 200, easing: 'ease' },
        );
    animation.finished.then(() => event.animationComplete());
  }

  protected onStageLeave(event: AnimationCallbackEvent): void {
    const el = event.target as HTMLElement;
    const width = el.offsetWidth;
    const animation = el.animate(
      [
        { width: `${width}px`, minWidth: '0px', opacity: 1 },
        { width: '0px', minWidth: '0px', opacity: 0 },
      ],
      { duration: 200, easing: 'ease' },
    );
    animation.finished.then(() => event.animationComplete());
  }

  protected createRoute(): void {
    this.planner.addRoute();
  }
}
