import { computed, inject, Injectable, signal } from '@angular/core';
import { LngLat } from 'mapbox-gl';
import { FeatureCollection, Position } from 'geojson';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class RoutePlannerService {
  private readonly _route = signal<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  readonly route = this._route.asReadonly();
  private waypoints = signal<Position[]>([]);
  private history = signal<Position[][]>([]);
  private future = signal<Position[][]>([]);
  readonly canUndo = computed(() => this.history().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  private http = inject(HttpClient);
  private readonly BROUTER_API = 'https://brouter.de/brouter';

  appendWaypoint(lnglat: LngLat): void {
    this.pushHistory();
    const { lng, lat } = lnglat;
    this.waypoints.update((w) => [...w, [lng, lat] as Position]);
    this.reroute();
  }

  clear(): void {
    this.pushHistory();
    this.waypoints.set([]);
    this._route.set({ type: 'FeatureCollection', features: [] });
  }

  undo(): void {
    if (!this.canUndo()) return;
    this.future.update((f) => [this.waypoints(), ...f]);
    this.waypoints.set(this.history().at(-1)!);
    this.history.update((h) => h.slice(0, -1));
    this.reroute();
  }

  redo(): void {
    if (!this.canRedo()) return;
    this.history.update((h) => [...h, this.waypoints()]);
    this.waypoints.set(this.future().at(0)!);
    this.future.update((f) => f.slice(1));
    this.reroute();
  }

  private pushHistory(): void {
    this.history.update((h) => [...h, this.waypoints()]);
    this.future.set([]);
  }

  private reroute(): void {
    if (this.waypoints().length < 2) {
      this._route.set({ type: 'FeatureCollection', features: []});
      return;
    }
    this.http
      .get<FeatureCollection>(this.BROUTER_API, {
        params: {
          lonlats: this.waypoints()
            .map(([lon, lat]) => `${lon},${lat}`)
            .join('|'),
          profile: 'hiking-mountain',
          alternativeidx: 0,
          format: 'geojson',
        },
      })
      .subscribe((route) => {
        this._route.set(route);
        console.debug(`Route updated. Now contains ${this._route()!.features.length} features`);
      });
  }
}
