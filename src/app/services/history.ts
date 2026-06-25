import { computed, Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class HistoryService<T> {
  private isInitialized = false;

  private readonly history = signal<T[]>([]);
  private readonly future = signal<T[]>([]);

  readonly current = signal<T>(null as unknown as T); // Assume initialized via init()
  readonly canUndo = computed(() => this.history().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  init(initial: T): void {
    if (this.isInitialized) throw new Error('UndoRedoService::init() called twice');
    this.current.set(initial);
    this.isInitialized = true;
  }

  commit(): void {
    this.checkInit();

    this.history.update((h) => [...h, this.current()]);
    this.future.set([]);
  }

  undo(): void {
    this.checkInit();
    if (!this.canUndo()) return;

    const prev = this.history().at(-1)!;
    this.future.update((f) => [this.current(), ...f]);
    this.history.update((h) => h.slice(0, -1));
    this.current.set(prev);
  }

  redo(): void {
    this.checkInit();
    if (!this.canRedo()) return;

    const next = this.future().at(0)!;
    this.history.update((h) => [...h, this.current()]);
    this.future.update((f) => f.slice(1));
    this.current.set(next);
  }

  private checkInit(): void {
    if (!this.isInitialized) throw new Error('UndoRedoService::init() not called before use');
  }
}
