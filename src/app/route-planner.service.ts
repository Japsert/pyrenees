import { computed, inject, Injectable, signal } from '@angular/core';
import { FeatureCollection, Position } from 'geojson';
import { HttpClient } from '@angular/common/http';
import { map, mergeMap, Subject } from 'rxjs';
import { Route, Segment, Waypoint } from './route/route';
import { LngLat } from 'mapbox-gl';

@Injectable({
  providedIn: 'root',
})
export class RoutePlannerService {
  route = signal<Route>(new Route());
  private readonly history = signal<Route[]>([]);
  private readonly future = signal<Route[]>([]);
  readonly canUndo = computed(() => this.history().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);
  private readonly apiCall = new Subject<Segment>();

  private readonly http = inject(HttpClient);
  private readonly BROUTER_API = 'https://brouter.de/brouter';

  constructor() {
    // Load route from local storage
    this.loadRoute();

    // RxJS magic to merge simultaneous requests when user clicks rapidly
    this.apiCall
      .pipe(
        mergeMap((segment) => {
          const start = segment.start.position;
          const end = segment.end.position;
          return this.http
            .get<FeatureCollection>(this.BROUTER_API, {
              params: {
                lonlats: `${start[0]},${start[1]}|${end[0]},${end[1]}`,
                profile: 'shortest',
                alternativeidx: 0,
                format: 'geojson',
              },
            })
            .pipe(map((fc) => ({ segment, fc })));
        }),
      )
      .subscribe(({ segment, fc }) => {
        segment.updateFromFeatureCollection(fc);
        this.route.update((route) => route.clone());
        this.saveRoute();
      });
  }

  newWaypoint(lng: number, lat: number): void {
    this.pushHistory();
    const next = this.route().clone();
    const segment = next.appendWaypoint(lng, lat);
    this.setRoute(next);
    if (segment) this.routeSegment(segment);
  }

  splitSegment(segment: Segment, newPos: Position): void {
    this.pushHistory();
    const next = this.route().clone();
    const { seg1, seg2 } = next.splitSegment(segment, newPos);
    this.setRoute(next);
    this.routeSegment(seg1);
    this.routeSegment(seg2);
  }

  clear(): void {
    this.pushHistory();
    this.setRoute(new Route());
  }

  undo(): void {
    if (!this.canUndo()) return;
    const h = this.history();
    this.future.update((f) => [this.route(), ...f]);
    this.setRoute(h.at(-1)!);
    this.history.set(h.slice(0, -1));
  }

  redo(): void {
    if (!this.canRedo()) return;
    const f = this.future();
    this.history.update((h) => [...h, this.route()]);
    this.setRoute(f[0]);
    this.future.set(f.slice(1));
  }

  private pushHistory(): void {
    this.history.update((h) => [...h, this.route()]);
    this.future.set([]);
  }

  private routeSegment(segment: Segment): void {
    this.apiCall.next(segment);
  }

  private setRoute(route: Route): void {
    this.route.set(route);
    this.saveRoute();
  }

  private saveRoute(): void {
    const fc: FeatureCollection = this.route().toGeoJSON();
    localStorage.setItem('route', JSON.stringify(fc));
  }

  private loadRoute(): void {
    const savedRoute = localStorage.getItem('route');
    if (savedRoute == null) return;

    const fc = JSON.parse(savedRoute) as FeatureCollection;
    this.setRoute(Route.fromGeoJSON(fc));
  }
}
