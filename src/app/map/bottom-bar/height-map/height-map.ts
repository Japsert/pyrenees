import { Component, inject, computed, effect } from '@angular/core';
import haversine from 'haversine-distance';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { EChartsOption, EChartsType, ElementEvent } from 'echarts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { LayerIds } from '../../../ids.enum';
import { Position } from 'geojson';
import {
  InteractionService,
  MapLayersService,
  MapService,
  PlannerService,
} from '../../../services';
import { Node } from '../../../model';
echarts.use([SVGRenderer, GridComponent, TooltipComponent, LineChart]);

type DataPoint = {
  distance: number;
  elevation: number;
  position: Position;
};

@Component({
  selector: 'app-height-map',
  imports: [NgxEchartsDirective],
  templateUrl: './height-map.html',
  providers: [provideEchartsCore({ echarts })],
})
export class HeightMap {
  private readonly map = inject(MapService);
  private readonly layers = inject(MapLayersService);
  private readonly planner = inject(PlannerService);
  private readonly interaction = inject(InteractionService);

  private chart: EChartsType | null = null;

  protected readonly initOptions = { renderer: 'svg' };
  protected readonly options: EChartsOption = {
    textStyle: {
      fontFamily:
        'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
      fontSize: 15,
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },

    xAxis: {
      type: 'value',
      boundaryGap: [0, 0],
      max(extent) {
        return Math.ceil(extent.max);
      },
      axisLine: {
        show: true,
        lineStyle: { width: 2, color: '#d0d0d0' },
      },
      splitLine: {
        show: true,
        lineStyle: { width: 2, color: '#e0e0e0' },
      },
      axisTick: {
        lineStyle: { width: 2, color: '#d0d0d0' },
      },
      axisLabel: {
        formatter: (v: number) => {
          if (v < 1000) {
            return `${v} m`;
          }
          const km = v / 1000;
          return km % 1 === 0 ? `${km} km` : `${km.toFixed(1)} km`;
        },
      },
    },

    yAxis: {
      type: 'value',
      min(extent) {
        return Math.floor(extent.min / 100) * 100;
      },
      max(extent) {
        return Math.ceil(extent.max / 100) * 100;
      },
      interval: 99999999,
      axisLine: {
        show: true,
        lineStyle: { width: 2, color: '#d0d0d0' },
      },
      splitLine: {
        show: true,
        lineStyle: { width: 2, color: '#e0e0e0' },
      },
      axisTick: {
        lineStyle: { width: 2, color: '#d0d0d0' },
      },
      axisLabel: {
        formatter: (v: number) => `${Math.round(v)}m`,
      },
    },

    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        snap: true,
        lineStyle: { width: 1, color: '#b0b0b0' },
      },
      formatter(params: any) {
        const x = `distance: ${Math.round(params[0].axisValue)} m`;
        const y = `elevation: ${Math.round(params[0].value[1])} m`;
        return `${x}<br/>${y}`;
      },
    },

    series: {
      name: 'elevation',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 10,
      areaStyle: { opacity: 0.1 },
      lineStyle: { color: '#ffa500', width: 2 },
      itemStyle: { opacity: 0, color: '#f80' },
      triggerEvent: true,
      animation: false,
      emphasis: {
        itemStyle: {
          opacity: 1,
          color: '#f80',
          borderWidth: 1,
          borderColor: '#fff',
        },
      },
    },
  };

  private readonly data = computed(() => this.buildChartData());

  protected readonly updateOptions = computed<EChartsOption>(() => ({
    series: { data: this.data().map((d) => [d.distance, d.elevation]) },
  }));

  constructor() {
    effect(() => {
      const idx = this.interaction.routeHoverIdx();
      if (idx === null) this.clearHighlight();
      else this.highlightPoint(idx);
    });
  }

  private buildChartData(): DataPoint[] {
    const points: DataPoint[] = [];
    let totalDistance = 0;

    const selectedStage = this.planner.selectedStage();
    if (selectedStage === null) return [];

    for (const segment of selectedStage.segments) {
      if (!segment.track) {
        totalDistance += haversine(segment.start.asLngLat(), segment.end.asLngLat());
        continue;
      }

      let prevNode: Node | null = null;
      for (const node of segment.track) {
        if (prevNode) totalDistance += haversine(prevNode.asLngLat(), node.asLngLat());
        points.push({
          distance: totalDistance,
          elevation: node.elevation,
          position: node.position,
        });
        prevNode = node;
      }
    }

    return points;
  }

  protected onChartInit(chart: EChartsType): void {
    this.chart = chart;

    this.chart.getZr().on('mousemove', (e) => this.updateMarker(e));
    this.chart.getZr().on('mouseout', () => this.clearMarker());
  }

  protected updateMarker(e: ElementEvent): void {
    if (!this.chart) return;

    const gridPoint = [e.offsetX, e.offsetY];
    const seriesPoint = this.chart.convertFromPixel('grid', gridPoint);
    const distance = seriesPoint[0];
    const idx = this.findClosestIndex(this.data(), distance);
    const targetItem = this.data().at(idx);

    if (!targetItem) return console.warn(`No valid data point found for distance ${distance}!`);
    this.layers.setLayerData(this.map.getActiveMap(), LayerIds.CHART_MARKER, {
      type: 'Point',
      coordinates: targetItem.position,
    });
  }

  private findClosestIndex(data: DataPoint[], target: number): number {
    if (data.length === 0) return -1;

    let low = 0;
    let high = data.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (data[mid].distance < target) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    // Check if the previous neighbor is actually closer
    if (
      low > 0 &&
      Math.abs(data[low].distance - target) > Math.abs(data[low - 1].distance - target)
    ) {
      return low - 1;
    }
    return low;
  }

  protected clearMarker(): void {
    this.layers.removeLayerData(this.map.getActiveMap(), LayerIds.CHART_MARKER);
  }

  private highlightPoint(idx: number) {
    if (!this.chart) return;
    this.chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx });
    this.chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
  }

  private clearHighlight() {
    if (!this.chart) return;
    this.chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
    this.chart.dispatchAction({ type: 'hideTip' });
    // hideTip doesn't hide the axisPointer line (https://github.com/apache/echarts/issues/8892)
    // hence the below workaround
    this.chart.dispatchAction({
      type: 'showTip',
      seriesIndex: 0,
      dataIndex: -1,
    });
  }
}
