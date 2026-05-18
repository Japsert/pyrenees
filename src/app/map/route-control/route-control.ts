import {
  ApplicationRef,
  Component,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  HostListener,
  inject,
} from '@angular/core';
import { MapService } from '../../map.service';
import { IControl } from 'mapbox-gl';
import { RoutePlannerService } from '../../route-planner.service';

@Component({
  selector: 'app-route-control',
  templateUrl: './route-control.html',
})
export class RouteControlComponent {
  private readonly mapService = inject(MapService);
  private readonly routePlannerService = inject(RoutePlannerService);
  
  protected isEditing = this.mapService.isEditingRoute;

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
    this.routePlannerService.undo();
  }

  redo(): void {
    this.routePlannerService.redo();
  }

  canUndo(): boolean {
    return this.routePlannerService.canUndo();
  }

  canRedo(): boolean {
    return this.routePlannerService.canRedo();
  }

  edit(): void {
    this.mapService.toggleEditingRoute();
  }

  clear(): void {
    this.routePlannerService.clear();
  }

  debug(): void {
    this.routePlannerService.printDebugInfo();
    this.mapService.printDebugInfo();
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
    this.container?.parentNode?.removeChild(this.container);
  }
}
