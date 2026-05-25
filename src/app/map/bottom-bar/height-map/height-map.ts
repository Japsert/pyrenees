import { Component, inject, computed } from '@angular/core';
import haversine from 'haversine-distance';
import { RoutePlannerService } from '../../../route-planner.service';
import { Node } from '../../../route/route';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { EChartsOption } from 'echarts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CallbackDataParams } from 'echarts/types/dist/shared';
echarts.use([SVGRenderer, GridComponent, TooltipComponent, LineChart]);

@Component({
  selector: 'app-height-map',
  imports: [NgxEchartsDirective],
  templateUrl: './height-map.html',
  styleUrl: './height-map.css',
  providers: [provideEchartsCore({ echarts })],
})
export class HeightMap {
  private readonly routePlannerService = inject(RoutePlannerService);
  private readonly route = this.routePlannerService.route;

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
      symbol: 'none',
      areaStyle: { opacity: 0.1 },
      lineStyle: { color: '#ffa500', width: 2 },
      itemStyle: { color: '#ffa500' },
    },
  };

  protected readonly updateOptions = computed<EChartsOption>(() => ({
    series: { data: this.buildChartPoints() },
  }));

  private buildChartPoints(): [number, number][] {
    const points: [number, number][] = [];
    let totalDistance = 0;

    for (const segment of this.route().segments) {
      if (!segment.track) {
        totalDistance += haversine(segment.start.asLngLat(), segment.end.asLngLat());
        continue;
      }

      let prevNode: Node | null = null;
      for (const node of segment.track) {
        if (prevNode) {
          totalDistance += haversine(prevNode.asLngLat(), node.asLngLat());
        }
        points.push([totalDistance, node.elevation]);
        prevNode = node;
      }
    }

    return points;
  }
}
