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
import { RoutePlannerService } from '../../route-planner.service';
import { RouteInteractionService } from '../../route-interaction.service';
import { ConfirmClearComponent } from './confirm-clear/confirm-clear.component';

@Component({
  selector: 'app-route-control',
  templateUrl: './route-control.html',
  imports: [ConfirmClearComponent],
})
export class RouteControlComponent {
  private readonly routeInteraction = inject(RouteInteractionService);
  private readonly routePlanner = inject(RoutePlannerService);

  protected isEditing = this.routeInteraction.isAddingWaypoints;
  protected showConfirmClear = signal<boolean>(false);

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    const modifier = e.ctrlKey || e.metaKey;
    if (!modifier) return;

    if ((e.metaKey && !e.shiftKey && e.key == 'z') || (e.ctrlKey && e.key == 'z')) {
      e.preventDefault();
      this.undo();
    } else if ((e.metaKey && e.shiftKey && e.key == 'z') || (e.ctrlKey && e.key == 'y')) {
      e.preventDefault();
      this.redo();
    }
  }

  undo(): void {
    this.routePlanner.undo();
  }

  redo(): void {
    this.routePlanner.redo();
  }

  canUndo(): boolean {
    return this.routePlanner.canUndo();
  }

  canRedo(): boolean {
    return this.routePlanner.canRedo();
  }

  edit(): void {
    this.routeInteraction.toggleAddingWaypoints();
  }

  toggleShowConfirmClear(): void {
    this.showConfirmClear.update(b => !b);
  }

  clear(): void {
    this.routePlanner.clear();
    this.showConfirmClear.set(false);
  }

  cancelClear(): void {
    this.showConfirmClear.set(false);
  }

  export(): void {
    this.routePlanner.export();
  }

  import(): void {
    this.routePlanner.import();
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
