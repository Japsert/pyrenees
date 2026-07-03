import { computed, inject, Injectable, signal } from '@angular/core';
import { Feature, Point, Position } from 'geojson';
import { HttpClient } from '@angular/common/http';
import { map, mergeMap, Subject, tap } from 'rxjs';
import {
  Trip,
  Stage,
  Segment,
  BRouterFeatureCollection,
  Waypoint,
  VersionMismatchError,
  TripJson,
  Route,
} from '../model';
import { HistoryService } from './history';
import { LngLat } from 'mapbox-gl';
import { Id } from '../util';

export type NearestPointOnLine = Feature<
  Point,
  {
    lineStringIndex: number;
    segmentIndex: number;
    totalDistance: number;
    lineDistance: number;
    segmentDistance: number;
    pointDistance: number;
  }
>;

@Injectable({
  providedIn: 'root',
})
export class PlannerService {
  private static readonly BROUTER_API = 'https://brouter.de/brouter';
  private static readonly LOCAL_STORAGE_TRIP_KEY = 'trip';

  private readonly http = inject(HttpClient);
  private readonly history: HistoryService<Trip> = inject(HistoryService);

  trip = this.history.current;
  private selectedRouteId = signal<Id | null>(null);
  selectedRoute = computed(() => {
    const selectedRouteId = this.selectedRouteId();
    return selectedRouteId === null ? null : this.findRouteById(selectedRouteId);
  });
  private selectedStageId = signal<Id | null>(null);
  selectedStage = computed(() => {
    const selectedStageId = this.selectedStageId();
    return selectedStageId === null ? null : this.findStageById(selectedStageId);
  });
  private readonly apiCall = new Subject<{ route: Route; stage: Stage; segment: Segment }>();

  constructor() {
    this.history.init(Trip.create());

    // Load trip from local storage
    try {
      console.debug('loading trip');
      this.load();
    } catch (error) {
      console.log('Error during loading from local storage:', error);
    }

    // RxJS magic to merge simultaneous requests when user clicks rapidly
    this.apiCall
      .pipe(
        mergeMap(({ route, stage, segment }) => {
          const start = segment.start.position;
          const end = segment.end.position;
          return this.http
            .get<BRouterFeatureCollection>(PlannerService.BROUTER_API, {
              params: {
                lonlats: `${start[0]},${start[1]}|${end[0]},${end[1]}`,
                profile: 'shortest',
                alternativeidx: 0,
                format: 'geojson',
              },
            })
            .pipe(map((fc) => ({ route, stage, segment, fc })));
        }),
      )
      .subscribe(({ route, stage, segment, fc }) => {
        this.trip.update((trip) =>
          trip.withUpdatedSegment(route, stage, segment, (segment) => segment.withData(fc)),
        );
        this.save();
      });
  }

  //#region Editing

  private findRouteById(id: Id): Route | null {
    return this.trip().findRouteById(id);
  }

  private findStageById(id: Id): Stage | null {
    return this.trip().findStageById(id);
  }

  selectRoute(route: Route): void {
    this.selectedRouteId.set(route.id);
    console.debug('selected route:', route);
  }

  selectStage(route: Route, stage: Stage): void {
    this.selectRoute(route);
    this.selectedStageId.set(stage.id);
    console.debug('selected stage:', stage);
  }

  deselectRoute(): void {
    this.selectedRouteId.set(null);
    console.debug('deselected route');
  }

  deselectStage(): void {
    this.selectedStageId.set(null);
    console.debug('deselected stage');
  }

  addRoute(): void {
    this.history.commit();
    const [newTrip, newRoute] = this.trip().withAddedRoute();
    this.trip.set(newTrip);
    this.selectRoute(newRoute);
    this.save();
  }

  addStage(route: Route): void {
    this.history.commit();
    const [newTrip, newStage] = this.trip().withAddedStage(route);
    this.trip.set(newTrip);
    this.selectStage(route, newStage);
    this.save();
  }

  updateRoute(route: Route, func: (route: Route) => Route): void {
    this.history.commit();
    this.trip.update((trip) => trip.withUpdatedRoute(route, func));
    this.save();
  }

  updateSelectedStage(newStage: Stage): void {
    const selectedRoute = this.selectedRoute();
    const selectedStage = this.selectedStage();
    if (selectedRoute === null || selectedStage === null)
      throw new Error('Updating selected stage, but either no route or no stage is selected!');
    this.updateStage(selectedRoute, selectedStage, () => newStage);
    // The selected stage ID shouldn't change, but we set it anyway to re-compute selectedStage etc.
    // TODO: remove sanity check
    if (this.selectedStageId() !== newStage.id) throw new Error('this should never happen');
    this.selectedStageId.set(newStage.id);
    console.debug(
      'updated selected stage id after updating selected stage. new selectedStage:',
      this.selectedStage(),
    );
  }

  updateStage(route: Route, stage: Stage, func: (stage: Stage) => Stage): void {
    this.history.commit();
    this.trip.update((trip) => trip.withUpdatedStage(route, stage, func));
    this.save();
  }

  deleteRoute(route: Route): void {
    this.history.commit();
    this.trip.update((trip) => trip.withDeletedRoute(route));
    if (this.selectedRoute() === route) this.deselectRoute();
    this.save();
  }

  deleteStage(route: Route, stage: Stage): void {
    this.history.commit();
    this.trip.update((trip) => trip.withDeletedStage(route, stage));
    if (this.selectedStage() === stage) this.deselectStage();
    console.debug('selected stage is now', this.selectedStage());
    this.save();
  }

  addWaypoint(position: Position): void {
    const selectedRoute = this.selectedRoute();
    const selectedStage = this.selectedStage();
    if (selectedRoute === null || selectedStage === null)
      throw new Error('Either no route or no stage selected!');

    const [newStage, segment] = selectedStage.withAppendedWaypoint(position);
    this.updateSelectedStage(newStage);
    if (segment) this.routeSegment(selectedRoute, newStage, segment);
  }

  moveWaypoint(id: string, newPos: Position): void {
    const selectedRoute = this.selectedRoute();
    const selectedStage = this.selectedStage();
    if (selectedRoute === null || selectedStage === null)
      throw new Error('Either no route or no stage selected!');

    const [newStage, newSegments] = selectedStage.withMovedWaypoint(id, newPos);
    this.updateSelectedStage(newStage);
    if (newSegments) {
      const { prevSegment, nextSegment } = newSegments;
      if (prevSegment) this.routeSegment(selectedRoute, newStage, prevSegment);
      if (nextSegment) this.routeSegment(selectedRoute, newStage, nextSegment);
    }
  }

  deleteWaypoint(id: string): void {
    const selectedRoute = this.selectedRoute();
    const selectedStage = this.selectedStage();
    if (selectedRoute === null || selectedStage === null)
      throw new Error('Either no route or no stage selected!');

    const [newStage, maybeSegment] = selectedStage.withDeletedWaypoint(id);
    this.updateSelectedStage(newStage);
    if (maybeSegment) this.routeSegment(selectedRoute, newStage, maybeSegment);
  }

  findWaypointById(id: string): Waypoint | null {
    return this.trip().findWaypointById(id);
  }

  findSegment(func: (segment: Segment) => boolean): Segment | null {
    return this.trip().findSegment(func);
  }

  splitSegment(segment: Segment, newPos: Position): void {
    const selectedRoute = this.selectedRoute();
    const selectedStage = this.selectedStage();
    if (selectedRoute === null || selectedStage === null)
      throw new Error('Either no route or no stage selected!');

    const [newStage, { prevSegment, nextSegment }] = selectedStage.withSplitSegment(
      segment,
      newPos,
    );
    this.updateSelectedStage(newStage);
    this.routeSegment(selectedRoute, newStage, prevSegment);
    this.routeSegment(selectedRoute, newStage, nextSegment);
  }

  hasRoutes(): boolean {
    return this.trip().hasRoutes();
  }

  clear(): void {
    this.history.commit();
    this.trip.set(Trip.create());
  }

  private routeSegment(route: Route, stage: Stage, segment: Segment): void {
    console.debug('routeSegment called:', route, stage, segment);
    this.apiCall.next({ route, stage, segment });
  }

  nearestPoint(lngLat: LngLat): NearestPointOnLine | undefined {
    return this.trip().nearestPoint(lngLat);
  }

  //#endregion
  //#region Serialization

  private save(): void {
    const data: TripJson = this.trip().toJson();
    localStorage.setItem(PlannerService.LOCAL_STORAGE_TRIP_KEY, JSON.stringify(data));
  }

  private load(): boolean {
    const savedTrip = localStorage.getItem(PlannerService.LOCAL_STORAGE_TRIP_KEY);
    if (savedTrip === null) return false;

    const data = JSON.parse(savedTrip) as TripJson;
    try {
      this.trip.set(Trip.fromJson(data));
      return true;
    } catch (error) {
      if (!(error instanceof VersionMismatchError)) throw error;
    }
    return false;
  }

  export(): void {
    const data = this.trip().toJson();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'route.geojson';
    a.click();

    URL.revokeObjectURL(url);
  }

  import(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.item(0);
      if (!file) return console.error('No file selected!');

      const text = await file.text();
      const data = JSON.parse(text) as TripJson;
      this.trip.set(Trip.fromJson(data));
    };
    input.click();
  }
}
