import { Injectable } from '@angular/core';
import { GeoJSONSource, Map as MapboxMap, Popup } from 'mapbox-gl';
import { LayerIds, SourceIds } from '../ids.enum';
import { GeoJSON } from 'geojson';

@Injectable({
  providedIn: 'root',
})
export class MapLayersService {
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

  addAllLayers(map: MapboxMap): void {
    this.addTrailLayers(map);
    //this.addShelterLayer(map);
    this.addTripLayers(map);
    //this.addRouteDebugLayers(map);
    this.addChartMarkerLayer(map);
    this.addEditLinesLayer(map);
    this.addDraggingCursorLayer(map);
    this.addRouteHoverCursorLayer(map);
  }

  private addTrailLayers(map: MapboxMap): void {
    map
      .addSource(SourceIds.GR10, {
        type: 'vector',
        url: 'mapbox://japsert-.cmolcxvbv061n1opdqvgpna20-33hp1',
      })
      .addSource(SourceIds.GR11, {
        type: 'vector',
        url: 'mapbox://japsert-.cmolcxw8e09v01mk0zoifowc7-4xu85',
      })
      .addLayer({
        id: LayerIds.GR10,
        type: 'line',
        source: SourceIds.GR10,
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
        id: LayerIds.GR11,
        type: 'line',
        source: SourceIds.GR11,
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

  private addTripLayers(map: MapboxMap): void {
    map
      .addSource(SourceIds.TRIP, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
        promoteId: 'id',
      })
      .addLayer({
        id: LayerIds.SEGMENT_LINE,
        type: 'line',
        source: SourceIds.TRIP,
        filter: ['==', '$type', 'LineString'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5,
        },
      })
      .addLayer({
        id: LayerIds.SEGMENT_LINE_HITBOX,
        type: 'line',
        source: SourceIds.TRIP,
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
        source: SourceIds.TRIP,
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
            ['get', 'selectColor'],
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'hoverProgress'], 0],
              0,
              ['get', 'color'],
              1,
              ['get', 'hoverColor'],
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

  private addRouteDebugLayers(map: MapboxMap): void {
    map
      .addSource('debug-averaged-route', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      })
      .addLayer({
        id: 'debug-averaged-line',
        type: 'line',
        source: 'debug-averaged-route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#00f',
          'line-width': 3,
        },
      });
    //.addSource('debug-smoothed-route', {
    //  type: 'geojson',
    //  data: {
    //    type: 'FeatureCollection',
    //    features: [],
    //  },
    //})
    //.addLayer({
    //  id: 'debug-smoothed-line',
    //  type: 'line',
    //  source: 'debug-smoothed-route',
    //  layout: {
    //    'line-cap': 'round',
    //    'line-join': 'round',
    //  },
    //  paint: {
    //    'line-color': '#0f0',
    //    'line-width': 3,
    //  },
    //});
  }

  addChartMarkerLayer(map: MapboxMap): void {
    map.addSource(LayerIds.CHART_MARKER, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
    map.addLayer(
      {
        id: LayerIds.CHART_MARKER,
        type: 'circle',
        source: LayerIds.CHART_MARKER,
        paint: {
          'circle-radius': 4,
          'circle-color': '#f80',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      },
      LayerIds.WAYPOINTS,
    );
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
    map.addSource(LayerIds.SEGMENT_HOVER_CURSOR, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
    map.addLayer({
      id: LayerIds.SEGMENT_HOVER_CURSOR,
      type: 'circle',
      source: LayerIds.SEGMENT_HOVER_CURSOR,
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
}
