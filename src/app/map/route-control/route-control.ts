import {
  ApplicationRef,
  Component,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { IControl } from 'mapbox-gl';
import { ConfirmClearComponent } from './confirm-clear/confirm-clear.component';
import { HistoryService, InteractionService, PlannerService } from '../../services';

@Component({
  selector: 'app-route-control',
  templateUrl: './route-control.html',
  imports: [ConfirmClearComponent],
})
export class RouteControlComponent {
  private readonly interaction = inject(InteractionService);
  private readonly planner = inject(PlannerService);
  private readonly history = inject(HistoryService);

  protected isEditingRoute = this.interaction.isEditingRoute;
  protected showConfirmClear = signal<boolean>(false);

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    const modifier = e.ctrlKey || e.metaKey;
    if (!modifier) return;

    if ((e.metaKey && !e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'z')) {
      e.preventDefault();
      this.undo();
    } else if ((e.metaKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
      e.preventDefault();
      this.redo();
    }
  }

  protected undo(): void {
    this.history.undo();
  }

  protected redo(): void {
    this.history.redo();
  }

  protected canUndo(): boolean {
    return this.history.canUndo();
  }

  protected canRedo(): boolean {
    return this.history.canRedo();
  }

  protected edit(): void {
    this.interaction.toggleAddingWaypoints();
  }

  protected toggleShowConfirmClear(): void {
    this.showConfirmClear.update((b) => !b);
  }

  canClear(): boolean {
    return this.planner.hasRoutes();
  }

  protected clear(): void {
    this.planner.clear();
    this.showConfirmClear.set(false);
  }

  @HostListener('document:mousedown')
  protected onMousedownOutside(): void {
    this.cancelClear();
  }

  protected cancelClear(): void {
    this.showConfirmClear.set(false);
  }

  protected export(): void {
    this.planner.export();
  }

  protected import(): void {
    this.planner.import();
  }

  protected debug(): void {
    console.debug(this.planner.selectedRoute(), this.planner.selectedStage());
  }
}

// Mapbox control. Needs appRef and injector to work as an Angular component
export class RouteControl implements IControl {
  private container!: HTMLElement;
  private componentRef!: ComponentRef<RouteControlComponent>;

  constructor(
    private readonly appRef: ApplicationRef,
    private readonly injector: EnvironmentInjector,
  ) {}

  onAdd(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    this.componentRef = createComponent(RouteControlComponent, {
      environmentInjector: this.injector,
      hostElement: this.container,
    });
    this.appRef.attachView(this.componentRef.hostView);

    return this.container;
  }

  onRemove(): void {
    this.appRef.detachView(this.componentRef.hostView);
    this.componentRef.destroy();
    this.container.remove();
  }
}
