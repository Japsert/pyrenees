import { LngLat } from 'mapbox-gl';
import { NearestPointOnLine } from './services';
import { Color } from 'use-color';

function cubicBezier(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  // Newton's method to solve for t given x, then evaluate y
  const cx = 3 * p1x,
    bx = 3 * (p2x - p1x) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * p1y,
    by = 3 * (p2y - p1y) - cy,
    ay = 1 - cy - by;

  function sampleX(t: number) {
    return ((ax * t + bx) * t + cx) * t;
  }
  function sampleY(t: number) {
    return ((ay * t + by) * t + cy) * t;
  }

  // Solve for t where sampleX(t) = x using Newton's method
  let t2 = t;
  for (let i = 0; i < 8; i++) {
    const x = sampleX(t2) - t;
    const dx = (3 * ax * t2 + 2 * bx) * t2 + cx;
    if (Math.abs(dx) < 1e-6) break;
    t2 -= x / dx;
  }
  return sampleY(t2);
}

export function ease(t: number): number {
  return cubicBezier(t, 0.25, 0.1, 0.25, 1);
}

export type Id = string;

export function generateId(): Id {
  return Math.random().toString(36).slice(2, 8);
}

// moving average function, yanked from sma npm package
export function sma(data: number[], window: number): number[] {
  const padding = Math.floor(window / 2);
  // Pad array to maintain original length
  const padded = [
    ...new Array(padding).fill(data[0]),
    ...data,
    ...new Array(padding).fill(data.at(-1)),
  ];

  const result: number[] = [];
  for (let i = window; i <= padded.length; i++) {
    const slice = padded.slice(i - window, i);
    const avg = slice.reduce((a, b) => a + b, 0) / window;
    result.push(avg);
  }
  return result;
}

export function nearestPoint<
  T extends { nearestPoint(lngLat: LngLat): NearestPointOnLine | undefined },
>(array: readonly T[], lngLat: LngLat): NearestPointOnLine | undefined {
  let min: NearestPointOnLine | undefined = undefined;
  for (const item of array) {
    const point = item.nearestPoint(lngLat);
    if (point === undefined) continue;
    if (min === undefined || point.properties.pointDistance < min.properties.pointDistance)
      min = point;
  }
  return min;
}

type ColorProperties = {
  color: string;
  hoverColor: string;
  selectColor: string;
};

export function colorProperties(baseColor: Color): ColorProperties {
  return {
    color: baseColor.toHex(),
    hoverColor: baseColor.darken(0.1).toHex(),
    selectColor: baseColor.darken(0.2).toHex(),
  };
}

export function getGlobalStyle(style: string): string {
  return globalThis.getComputedStyle(document.documentElement).getPropertyValue(style).trim();
}

export function getGlobalStyleAsNumber(style: string): number {
  return Number.parseFloat(getGlobalStyle(style));
}
