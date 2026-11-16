import { TOL, type Point, edges, uniqSorted } from "./geometry";
import { ROOM_TYPE_INFO, type Level, type Plan } from "./schema";

export type WallKind = "exterior" | "interior";

export interface Wall {
  id: string;
  levelId: string;
  a: Point;
  b: Point;
  kind: WallKind;
  thicknessM: number;
  /** Rooms on either side (1 or 2). */
  roomIds: string[];
}

interface EdgeRef {
  coord: number;
  start: number;
  end: number;
  roomId: string;
}

/**
 * Derive walls from room edges. A segment bordered by two enclosed rooms is an interior
 * wall; bordered by one enclosed room (other side open air or an outdoor room) it is an
 * exterior wall; bordered only by outdoor rooms it is no wall at all.
 */
export function deriveWalls(plan: Plan, level: Level): Wall[] {
  const outdoor = new Set(level.rooms.filter((r) => ROOM_TYPE_INFO[r.type].outdoor).map((r) => r.id));
  const horizontal: EdgeRef[] = [];
  const vertical: EdgeRef[] = [];
  for (const room of level.rooms) {
    for (const [a, b] of edges(room.polygon)) {
      if (Math.abs(a[1] - b[1]) < TOL && Math.abs(a[0] - b[0]) > TOL) {
        horizontal.push({ coord: a[1], start: Math.min(a[0], b[0]), end: Math.max(a[0], b[0]), roomId: room.id });
      } else if (Math.abs(a[0] - b[0]) < TOL && Math.abs(a[1] - b[1]) > TOL) {
        vertical.push({ coord: a[0], start: Math.min(a[1], b[1]), end: Math.max(a[1], b[1]), roomId: room.id });
      }
    }
  }

  const walls: Wall[] = [];
  const build = (refs: EdgeRef[], orientation: "h" | "v") => {
    const lines = groupBy(refs, (r) => Math.round(r.coord / TOL));
    for (const group of lines.values()) {
      const coord = group[0].coord;
      const stops = uniqSorted(group.flatMap((r) => [r.start, r.end]));
      let current: { start: number; end: number; kind: WallKind; key: string; roomIds: string[] } | null = null;
      const flush = () => {
        if (!current) return;
        const a: Point = orientation === "h" ? [current.start, coord] : [coord, current.start];
        const b: Point = orientation === "h" ? [current.end, coord] : [coord, current.end];
        walls.push({
          id: `${level.id}-w${walls.length + 1}`,
          levelId: level.id,
          a,
          b,
          kind: current.kind,
          thicknessM: current.kind === "exterior" ? plan.wallSpec.exteriorThicknessM : plan.wallSpec.interiorThicknessM,
          roomIds: current.roomIds,
        });
        current = null;
      };
      for (let i = 0; i < stops.length - 1; i++) {
        const s = stops[i];
        const e = stops[i + 1];
        const mid = (s + e) / 2;
        const roomIds = [...new Set(group.filter((r) => r.start - TOL <= mid && r.end + TOL >= mid).map((r) => r.roomId))].sort();
        const enclosed = roomIds.filter((id) => !outdoor.has(id));
        const kind: WallKind | null = enclosed.length === 0 ? null : enclosed.length >= 2 ? "interior" : "exterior";
        const key = `${kind}:${roomIds.join(",")}`;
        if (!kind) {
          flush();
          continue;
        }
        if (current && current.key === key && Math.abs(current.end - s) < TOL) {
          current.end = e;
        } else {
          flush();
          current = { start: s, end: e, kind, key, roomIds };
        }
      }
      flush();
    }
  };
  build(horizontal, "h");
  build(vertical, "v");
  return walls;
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}
