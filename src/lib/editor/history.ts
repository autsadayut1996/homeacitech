/** Undo/redo stack. `preview` replaces the present without recording (used while dragging). */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Snapshot taken when a drag started; committed as one undo step on release. */
  dragStart: T | null;
}

export type HistoryAction<T> =
  | { type: "commit"; value: T }
  | { type: "preview"; value: T }
  | { type: "endPreview" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

const LIMIT = 100;

export function initHistory<T>(value: T): History<T> {
  return { past: [], present: value, future: [], dragStart: null };
}

export function historyReducer<T>(h: History<T>, a: HistoryAction<T>): History<T> {
  switch (a.type) {
    case "commit":
      if (a.value === h.present) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: a.value, future: [], dragStart: null };
    case "preview":
      return { ...h, present: a.value, dragStart: h.dragStart ?? h.present };
    case "endPreview": {
      if (!h.dragStart) return h;
      if (h.dragStart === h.present) return { ...h, dragStart: null };
      return { past: [...h.past, h.dragStart].slice(-LIMIT), present: h.present, future: [], dragStart: null };
    }
    case "undo": {
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], dragStart: null };
    }
    case "redo": {
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), dragStart: null };
    }
    case "reset":
      return initHistory(a.value);
  }
}
