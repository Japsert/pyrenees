import { Injectable } from '@angular/core';

export type CursorReason = 'adding-waypoint' | 'dragging' | 'hovering-draggable' | 'default';
const CURSOR_PRIORITY: CursorReason[] = [
  'adding-waypoint', // highest — always overrides everything
  'dragging',
  'hovering-draggable',
  'default', // lowest
];
const CURSOR_STYLE: Record<CursorReason, string> = {
  'adding-waypoint': 'crosshair',
  dragging: 'grabbing',
  'hovering-draggable': 'grab',
  default: '',
};

@Injectable({
  providedIn: 'root',
})
export class CursorService {
  private readonly activeReasons = new Set<CursorReason>(['default']);

  set(reason: CursorReason, active: boolean): void {
    if (active) this.activeReasons.add(reason);
    else this.activeReasons.delete(reason);

    const winner = CURSOR_PRIORITY.find((r) => this.activeReasons.has(r))!;
    document.documentElement.style.setProperty('--map-cursor', CURSOR_STYLE[winner]);
  }
}
