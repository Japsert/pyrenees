import { inject, Injectable } from '@angular/core';
import { Feature, Point, Position } from 'geojson';
import { HttpClient } from '@angular/common/http';
import { map, mergeMap, Subject } from 'rxjs';
import {
  Trip,
  Stage,
  Segment,
  BRouterFeatureCollection,
  Waypoint,
  VersionMismatchError,
  TripData,
  Route,
} from '../model';
import { HistoryService } from './history';
import { LngLat } from 'mapbox-gl';

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
  private readonly http = inject(HttpClient);
  private readonly BROUTER_API = 'https://brouter.de/brouter';
  private readonly history: HistoryService<Trip> = inject(HistoryService);

  trip = this.history.current;
  selectedRoute: Route | null = null;
  selectedStage: Stage | null = null;
  private readonly apiCall = new Subject<{ stage: Stage; segment: Segment }>();

  constructor() {
    this.history.init(Trip.create());

    // Load routes from local storage
    try {
      this.load();
    } catch (error) {
      console.log('Error during loading from local storage:', error);
    }

    // RxJS magic to merge simultaneous requests when user clicks rapidly
    this.apiCall
      .pipe(
        mergeMap(({ stage, segment }) => {
          const start = segment.start.position;
          const end = segment.end.position;
          return this.http
            .get<BRouterFeatureCollection>(this.BROUTER_API, {
              params: {
                lonlats: `${start[0]},${start[1]}|${end[0]},${end[1]}`,
                profile: 'shortest',
                alternativeidx: 0,
                format: 'geojson',
              },
            })
            .pipe(map((fc) => ({ stage, segment, fc })));
        }),
      )
      .subscribe(({ stage, segment, fc }) => {
        this.updateStage(stage, (stage) => stage.withUpdatedSegment(segment, segment.withData(fc)));
        this.save();
      });
  }

  //#region Editing
  
  updateRoute(route: Route, func: (route: Route) => Route): void {
    this.history.commit();
    const newRoute = func(route);
    this.selectedRoute = newRoute;
    this.save();
  }

  private updateSelectedStage<T>(func: (stage: Stage) => [Stage, T]): T {
    if (this.selectedStage === null)
      throw new Error('Updating selected stage, but no stage is selected!');
    return this.updateStage(this.selectedStage, func);
  }

  private updateStage<T>(stage: Stage, func: (stage: Stage) => [Stage, T]): T {
    this.history.commit();
    const [newStage, ret] = func(stage);
    this.selectedStage = newStage;
    this.save();
    return ret;
  }

  addWaypoint(position: Position): void {
    const stage = this.selectedStage;
    if (stage === null) throw new Error('No stage selected!');
    const segment = this.updateSelectedStage((stage) => stage.withAppendedWaypoint(position));
    if (segment) this.routeSegment(stage, segment);
  }

  moveWaypoint(id: string, newPos: Position): void {
    if (this.selectedStage === null)
      throw new Error('Moving waypoint of selected stage, but no stage is selected!');
    const newSegments = this.updateSelectedStage((stage) => stage.withMovedWaypoint(id, newPos));
    if (newSegments) {
      const { prevSegment, nextSegment } = newSegments;
      if (prevSegment) this.routeSegment(this.selectedStage, prevSegment);
      if (nextSegment) this.routeSegment(this.selectedStage, nextSegment);
    }
  }

  deleteWaypoint(id: string): void {
    if (this.selectedStage === null)
      throw new Error('Deleting waypoint of selected stage, but no stage is selected!');
    const maybeSegment = this.updateSelectedStage((stage) => stage.withDeletedWaypoint(id));
    if (maybeSegment) this.routeSegment(this.selectedStage, maybeSegment);
  }

  findWaypointById(id: string): Waypoint | null {
    return this.trip().findWaypointById(id);
  }

  findSegment(func: (segment: Segment) => boolean): Segment | null {
    return this.trip().findSegment(func);
  }

  splitSegment(segment: Segment, newPos: Position): void {
    if (this.selectedStage === null)
      throw new Error('Splitting segment of selected stage, but no stage is selected!');
    const { prevSegment, nextSegment } = this.updateSelectedStage((route) =>
      route.withSplitSegment(segment, newPos),
    );
    this.routeSegment(this.selectedStage, prevSegment);
    this.routeSegment(this.selectedStage, nextSegment);
  }

  hasRoutes(): boolean {
    return this.trip().hasRoutes();
  }

  clear(): void {
    this.history.commit();
    this.trip.set(Trip.create());
  }

  private routeSegment(stage: Stage, segment: Segment): void {
    this.apiCall.next({ stage, segment });
  }

  nearestPoint(lngLat: LngLat): NearestPointOnLine | undefined {
    return this.trip().nearestPoint(lngLat);
  }

  //#endregion
  //#region Serialization

  private save(): void {
    const data: TripData = this.trip().toJson();
    localStorage.setItem('trip', JSON.stringify(data));
  }

  private load(): boolean {
    const savedTrip = localStorage.getItem('trip');
    if (savedTrip === null) return false;

    const data = JSON.parse(savedTrip) as TripData;
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
      const data = JSON.parse(text) as TripData;
      this.trip.set(Trip.fromJson(data));
    };
    input.click();
  }
}
