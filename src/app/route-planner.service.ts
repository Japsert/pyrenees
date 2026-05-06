import { inject, Injectable } from '@angular/core';
import { LngLat } from 'mapbox-gl';
import { LineString, Position } from 'geojson';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class RoutePlannerService {
  private route: LineString = { type: 'LineString', coordinates: [] };
  private http = inject(HttpClient);
  private readonly BROUTER_API = 'https://brouter.de/brouter';

  appendWaypoint(lnglat: LngLat): void {
    const { lng, lat } = lnglat;
    this.route.coordinates.push([lng, lat] as Position);
    this.reroute();
  }

  clear(): void {
    this.route.coordinates.length = 0;
  }

  private reroute(): void {
    this.http
      .get<unknown>(this.BROUTER_API, {
        params: {
          lonlats: this.route.coordinates.map(([lon, lat]) => `${lon},${lat}`).join('|'),
          profile: 'hiking-mountain',
          format: 'geojson',
        },
      })
      .subscribe((route) => {
        console.debug(route);
      });
  }
}
