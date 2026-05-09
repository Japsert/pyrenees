import { computed, inject, Injectable, signal, OnInit } from '@angular/core';
import { FeatureCollection, Position } from 'geojson';
import { HttpClient } from '@angular/common/http';
import { map, Subject, switchMap } from 'rxjs';
import { Route, Track, Waypoint } from './route/route';

@Injectable({
  providedIn: 'root',
})
export class RoutePlannerService {
  route = signal<Route>(new Route());
  private history = signal<Route[]>([]);
  private future = signal<Route[]>([]);
  readonly canUndo = computed(() => this.history().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);
  private apiCall = new Subject<Waypoint[]>();

  private http = inject(HttpClient);
  private readonly BROUTER_API = 'https://brouter.de/brouter';

  constructor() {
    // RxJS magic to cancel in-flight requests when user clicks rapidly
    this.apiCall
      .pipe(
        switchMap((waypoints) => {
          return this.http
            .get<FeatureCollection>(this.BROUTER_API, {
              params: {
                lonlats: waypoints.map(({ position: [lon, lat] }) => `${lon},${lat}`).join('|'),
                profile: 'shortest',
                alternativeidx: 0,
                format: 'geojson',
              },
            })
            .pipe(map((track) => ({ waypoints, track })));
        }),
      )
      .subscribe(({ waypoints, track }) => {
        this.setRoute(new Route(waypoints, new Track(track)));
      });

    // Load route from local storage
    this.loadRoute();
  }

  appendWaypoint(wp: Waypoint): void {
    console.log('appendWaypoint called', wp);
    this.pushHistory();
    const next = this.route().clone();
    next.waypoints.push(wp);
    this.setRoute(next);
    this.reroute();
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
    this.reroute();
  }

  redo(): void {
    if (!this.canRedo()) return;
    const f = this.future();
    this.history.update((h) => [...h, this.route()]);
    this.setRoute(f[0]);
    this.future.set(f.slice(1));
    this.reroute();
  }

  private pushHistory(): void {
    this.history.update((h) => [...h, this.route()]);
    this.future.set([]);
  }

  private reroute(): void {
    const waypoints = this.route().waypoints;
    if (waypoints.length < 2) return;

    this.apiCall.next(waypoints);
  }

  private setRoute(route: Route): void {
    this.route.set(route);
    this.saveRoute();
  }

  private saveRoute(): void {
    const fc: FeatureCollection = this.route().toGeoJSON();
    localStorage.setItem('route', JSON.stringify(fc));
  }

  private loadRoute() {
    const savedRoute = localStorage.getItem('route');
    if (savedRoute == null) return;

    const fc = JSON.parse(savedRoute) as FeatureCollection;
    this.setRoute(Route.fromGeoJSON(fc));
  }
}
