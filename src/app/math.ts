import { Map as MapboxMap } from 'mapbox-gl';

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

export function generateId(): string {
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
