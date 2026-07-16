import {
  Component,
  inject,
  computed,
  effect,
  signal,
  DestroyRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import haversine from 'haversine-distance';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { EChartsOption, EChartsType, ElementEvent } from 'echarts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { LayerIds } from '../../ids.enum';
import { Position } from 'geojson';
import { InteractionService, MapLayersService, MapService, PlannerService } from '../../services';
import { Node, Route, Stage } from '../../model';
echarts.use([SVGRenderer, GridComponent, TooltipComponent, LineChart]);

type DataPoint = {
  distance: number;
  elevation: number;
  position: Position;
};
type StageChartData = DataPoint[];
type RouteChartData = StageChartData[];

type Palette = {
  text: string;
  axis: string;
  split: string;
  pointer: string;
  emphasisBorder: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
};

const LIGHT_PALETTE: Palette = {
  text: '#333',
  axis: '#d0d0d0',
  split: '#e0e0e0',
  pointer: '#b0b0b0',
  emphasisBorder: '#fff',
  tooltipBg: '#ffffff',
  tooltipBorder: '#d0d0d0',
  tooltipText: '#333',
};

const DARK_PALETTE: Palette = {
  text: '#d4d4d4',
  axis: '#5c5c5c',
  split: '#444444',
  pointer: '#808080',
  emphasisBorder: '#2e2e2e',
  tooltipBg: '#2a2a2a',
  tooltipBorder: '#5a5a5a',
  tooltipText: '#e5e5e5',
};

@Component({
  selector: 'app-height-map',
  imports: [NgxEchartsDirective],
  templateUrl: './height-map.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [provideEchartsCore({ echarts })],
})
export class HeightMap {
  private readonly map = inject(MapService);
  private readonly layers = inject(MapLayersService);
  private readonly planner = inject(PlannerService);
  private readonly interaction = inject(InteractionService);

  //#region Chart setup

  private chart: EChartsType | null = null;

  private readonly prefersDark = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  private readonly palette = computed<Palette>(() =>
    this.prefersDark() ? DARK_PALETTE : LIGHT_PALETTE,
  );

  protected readonly initOptions = { renderer: 'svg' };
  protected readonly options: EChartsOption = this.buildOptions(this.palette());

  private buildOptions(p: Palette): EChartsOption {
    return {
      textStyle: {
        color: p.text,
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
          lineStyle: { width: 2, color: p.axis },
        },
        splitLine: {
          show: true,
          lineStyle: { width: 2, color: p.split },
        },
        axisTick: {
          lineStyle: { width: 2, color: p.axis },
        },
        axisLabel: {
          color: p.text,
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
          lineStyle: { width: 2, color: p.axis },
        },
        splitLine: {
          show: true,
          lineStyle: { width: 2, color: p.split },
        },
        axisTick: {
          lineStyle: { width: 2, color: p.axis },
        },
        axisLabel: {
          color: p.text,
          formatter: (v: number) => `${Math.round(v)}m`,
        },
      },

      tooltip: {
        trigger: 'axis',
        backgroundColor: p.tooltipBg,
        borderColor: p.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: p.tooltipText },
        axisPointer: {
          type: 'line',
          snap: true,
          lineStyle: { width: 1, color: p.pointer },
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
            borderColor: p.emphasisBorder,
          },
        },
      },
    };
  }

  constructor() {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => this.prefersDark.set(e.matches);
    media.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));

    effect(() => {
      const options = this.buildOptions(this.palette());
      this.chart?.setOption(options);
    });

    effect(() => {
      const idx = this.interaction.routeHoverIdx();
      if (idx === null) this.clearHighlight();
      else this.highlightPoint(idx);
    });
  }

  //#region Data

  private readonly data = computed(() => this.buildChartData());
  private readonly flatData = computed(() => this.data().flat());

  protected readonly updateOptions = computed<EChartsOption>(() => ({
    series: { data: this.flatData().map((d) => [d.distance, d.elevation]) },
  }));

  private buildChartData(): RouteChartData {
    const selectedStage = this.planner.selectedStage();
    if (selectedStage !== null) return [this.buildStageData(selectedStage)];
    const selectedRoute = this.planner.selectedRoute();
    if (selectedRoute !== null) return this.buildRouteData(selectedRoute);
    return [];
  }

  private buildStageData(stage: Stage, startDistance?: number): StageChartData {
    const points: DataPoint[] = [];
    let totalDistance = startDistance ?? 0;

    for (const segment of stage.segments) {
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

  private buildRouteData(route: Route): RouteChartData {
    const stages: StageChartData[] = [];
    let startDistance = 0;

    for (const stage of route.stages) {
      const stageData = this.buildStageData(stage, startDistance);
      startDistance += stageData.at(-1)?.distance ?? 0;
      stages.push(stageData);
    }

    return stages;
  }

  //#region Interaction

  protected onChartInit(chart: EChartsType): void {
    this.chart = chart;

    this.chart.getZr().on('mousemove', (e) => this.updateMapMarker(e));
    this.chart.getZr().on('mouseout', () => this.clearMarker());
  }

  protected updateMapMarker(e: ElementEvent): void {
    if (this.chart === null || this.planner.selectedRoute() === null) return;

    const gridPoint = [e.offsetX, e.offsetY];
    const seriesPoint = this.chart.convertFromPixel('grid', gridPoint);
    const distance = seriesPoint[0];
    const idx = this.findClosestIndex(this.flatData(), distance);
    const targetItem = this.flatData().at(idx);

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
