import { MapService } from '../../map.service';
import { IControl, Map } from 'mapbox-gl';
import { RoutePlannerService } from '../../route-planner.service';

export class RouteControl implements IControl {
  private container?: HTMLElement;
  private editBtn?: HTMLButtonElement;
  private clearBtn?: HTMLButtonElement;
  private isEditing: boolean = false;

  constructor(
    private mapService: MapService,
    private routePlannerService: RoutePlannerService,
  ) {}

  onAdd(map: Map): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    this.editBtn = document.createElement('button');
    this.editBtn.title = 'Edit route';
    this.editBtn.setAttribute('aria-pressed', 'false');
    this.editBtn.onclick = () => {
      this.isEditing = !this.isEditing;
      console.debug(`now: ${this.isEditing ? 'editing' : 'not editing'}`);
      this.editBtn!.setAttribute('aria-pressed', String(this.isEditing));
      this.edit();
    };

    this.clearBtn = document.createElement('button');
    this.clearBtn.title = 'Clear route';
    this.clearBtn.onclick = () => this.clear();

    this.container.appendChild(this.editBtn);
    this.container.appendChild(this.clearBtn);
    return this.container;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = undefined;
  }

  edit(): void {
    this.mapService.toggleEditingRoute();
  }

  clear(): void {
    this.routePlannerService.clear();
  }
}
