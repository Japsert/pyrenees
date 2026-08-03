import { Service } from '@angular/core';

export type Overlay = {
  element: OverlayIds | string;
  onClose: () => void;
};

export enum OverlayIds {
  CONTEXT_MENU = 'context-menu',
  COLOR_PICKER = 'color-picker',
}

@Service()
export class OverlayService {
  stack: Overlay[] = [];

  constructor() {
    globalThis.addEventListener('mousedown', (event: MouseEvent) => {
      const didClose = this.closeTopmostOverlay();
      if (didClose) event.stopPropagation();
    });
    globalThis.addEventListener('keydown', (event: KeyboardEvent) => {
      console.debug('overlay service handling keydown event');
      if (event.key === 'Escape') {
        const didClose = this.closeTopmostOverlay();
        if (didClose) event.stopPropagation();
      }
    });
  }

  private closeTopmostOverlay(): boolean {
    console.debug('removing topmost from stack,', this.stack);
    const popped = this.stack.pop();
    if (popped === undefined) return false;
    popped.onClose();
    return true;
  }

  add(overlay: Overlay): void {
    console.debug('adding overlay:', overlay);
    this.stack.push(overlay);
  }

  remove(element: OverlayIds | string): void {
    console.debug(`removing ${element} from stack`);
    const idx = this.stack.findIndex((overlay) => overlay.element === element);
    if (idx === -1) return;
    this.stack.splice(idx, 1);
    console.debug('removed', element, 'from stack', this.stack);
  }
}
