import { Injectable } from '@angular/core';
import { GeoJSONSource, Map as MapboxMap, Popup } from 'mapbox-gl';
import { LayerIds } from './layer-ids.enum';
import { GeoJSON } from 'geojson';

@Injectable({
  providedIn: 'root',
})
export class MapLayersService {
  addAllLayers(map: MapboxMap): void {
    this.addTrailLayers(map);
    //this.addShelterLayer(map);
    this.addRouteLayer(map);
    this.addEditLinesLayer(map);
    this.addDraggingCursorLayer(map);
    this.addRouteHoverCursorLayer(map);
  }

  private addTrailLayers(map: MapboxMap): void {
    map
      .addSource('gr10-tileset', {
        type: 'vector',
        url: 'mapbox://japsert-.cmolcxvbv061n1opdqvgpna20-33hp1',
      })
      .addSource('gr11-tileset', {
        type: 'vector',
        url: 'mapbox://japsert-.cmolcxw8e09v01mk0zoifowc7-4xu85',
      })
      .addLayer({
        id: 'gr10',
        type: 'line',
        source: 'gr10-tileset',
        'source-layer': 'GR10',
        paint: {
          'line-color': 'hsl(0, 100%, 50%)',
          'line-width': 3,
        },
        layout: {
          'line-join': 'round',
        },
      })
      .addLayer({
        id: 'gr11',
        type: 'line',
        source: 'gr11-tileset',
        'source-layer': 'GR11',
        paint: {
          'line-color': 'hsl(200, 100%, 50%)',
          'line-width': 3,
        },
        layout: {
          'line-join': 'round',
        },
      });
  }

  private addShelterLayer(map: MapboxMap): void {
    map
      .addSource('shelters-tileset', {
        type: 'vector',
        url: 'mapbox://japsert-.cmou6e96z02wp1mtif2jkcyz5-06exw',
      })
      .addLayer({
        id: 'shelters',
        type: 'circle',
        source: 'shelters-tileset',
        'source-layer': 'shelters',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffcc00',
          'circle-stroke-color': '#333',
          'circle-stroke-width': 1,
        },
      })
      .on('click', 'shelters', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        const props = feature.properties;
        const coordinates = (feature.geometry as any).coordinates.slice() as [number, number];

        new Popup()
          .setLngLat(coordinates)
          .setHTML(
            `
          <strong>${props?.['name'] ?? 'Unknown'}</strong><br/>
          ${props?.['ele'] ? `Elevation: ${props['ele']}m<br/>` : ''}
          ${props?.['capacity'] ? `Capacity: ${props['capacity']}<br/>` : ''}
          ${props?.['website'] ? `<a href="${props['website']}" target="_blank">Website</a>` : ''}
        `,
          )
          .addTo(map);
      })
      .on('mouseenter', 'shelters', () => (map.getCanvas().style.cursor = 'pointer'))
      .on('mouseleave', 'shelters', () => (map.getCanvas().style.cursor = ''));
  }

  private addRouteLayer(map: MapboxMap): void {
    map
      .addSource('route', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
        promoteId: 'id',
      })
      .addLayer({
        id: LayerIds.ROUTE_LINE,
        type: 'line',
        source: 'route',
        filter: ['==', '$type', 'LineString'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ffaa00',
          'line-width': 3,
        },
      })
      .addLayer({
        id: LayerIds.ROUTE_LINE_HITBOX,
        type: 'line',
        source: 'route',
        filter: ['==', '$type', 'LineString'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': 'transparent',
          'line-width': 16,
        },
      })
      .addLayer({
        id: LayerIds.WAYPOINTS,
        type: 'circle',
        source: 'route',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': [
            'case',
            ['coalesce', ['feature-state', 'selected'], false],
            10,
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'hoverProgress'], 0],
              0,
              6,
              1,
              10,
            ],
          ],
          'circle-color': [
            'case',
            ['coalesce', ['feature-state', 'selected'], false],
            '#ff3300',
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'hoverProgress'], 0],
              0,
              '#ffaa00',
              1,
              '#ff6600',
            ],
          ],
          'circle-opacity': ['case', ['coalesce', ['feature-state', 'dragging'], false], 0.5, 1],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': [
            'case',
            ['coalesce', ['feature-state', 'dragging'], false],
            0.5,
            1,
          ],
        },
      });
  }

  private addEditLinesLayer(map: MapboxMap): void {
    map.addSource(LayerIds.EDITING_LINES, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
    map.addLayer({
      id: LayerIds.EDITING_LINES,
      type: 'line',
      source: LayerIds.EDITING_LINES,
      paint: {
        'line-color': '#ff6600',
        'line-width': 3,
        'line-opacity': 0.5,
      },
    });
  }

  private addDraggingCursorLayer(map: MapboxMap): void {
    map.addSource(LayerIds.DRAGGING_CURSOR, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
    map.addLayer({
      id: LayerIds.DRAGGING_CURSOR,
      type: 'circle',
      source: LayerIds.DRAGGING_CURSOR,
      paint: {
        'circle-radius': 10,
        'circle-color': '#ff6600',
        'circle-opacity': 0.5,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-stroke-opacity': 0.5,
      },
    });
  }

  private addRouteHoverCursorLayer(map: MapboxMap): void {
    map.addSource(LayerIds.ROUTE_HOVER_CURSOR, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
    map.addLayer({
      id: LayerIds.ROUTE_HOVER_CURSOR,
      type: 'circle',
      source: LayerIds.ROUTE_HOVER_CURSOR,
      layout: {
        visibility: 'none',
      },
      paint: {
        'circle-radius': 6,
        'circle-color': '#ff6600',
        'circle-opacity': 0.5,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-stroke-opacity': 0.5,
      },
    });
  }

  setLayerData(map: MapboxMap, layerId: string, data: GeoJSON): void {
    const source = map.getSource(layerId) as GeoJSONSource | undefined;
    if (!source) return console.error(`Source for layer ${layerId} not found`);
    source.setData(data);
  }

  removeLayerData(map: MapboxMap, layerId: string): void {
    const source = map.getSource(layerId) as GeoJSONSource | undefined;
    if (!source) return console.error(`Source for layer ${layerId} not found`);
    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
  }
}
