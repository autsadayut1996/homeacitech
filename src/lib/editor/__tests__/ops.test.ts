import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "@/lib/plan-core/samples";
import { area, edges, pointAlong, validatePlan, type Plan } from "@/lib/plan-core";
import {
  addOpeningAt,
  addRoom,
  chainDimensions,
  deleteRoom,
  moveRoom,
  resizeRoomSide,
  roomRect,
  setRoomRect,
  slideOpening,
  snapCoord,
  updateOpening,
  updateRoom,
} from "../ops";
import { historyReducer, initHistory } from "../history";

const plan = () => sampleTwoStoreyPlan();
const room = (p: Plan, li: number, id: string) => p.levels[li].rooms.find((r) => r.id === id)!;
const opening = (p: Plan, li: number, id: string) => p.levels[li].openings.find((o) => o.id === id)!;
const worldCentre = (p: Plan, li: number, id: string) => {
  const o = opening(p, li, id);
  const e = edges(room(p, li, o.host.roomId).polygon)[o.host.edgeIndex];
  return pointAlong(e, o.host.offsetM + o.widthM / 2);
};
const SNAP = { grid: 0.25, magnet: 0.2 };

describe("snapping", () => {
  it("prefers nearby wall lines over the grid", () => {
    expect(snapCoord(4.93, [5], SNAP)).toBe(5);
    expect(snapCoord(4.6, [5], SNAP)).toBe(4.5);
    expect(snapCoord(4.6, [5], { grid: 0.1, magnet: 0 })).toBe(4.6);
  });
});

describe("moveRoom", () => {
  it("moves a room and its openings together, snapping to the grid", () => {
    const p = moveRoom(plan(), 0, "g-store", 0.33, 0, { grid: 0.25, magnet: 0 });
    expect(roomRect(room(p, 0, "g-store"))).toEqual({ x0: 4.25, y0: 13, x1: 6.25, y1: 16 });
    expect(opening(p, 0, "g-d-store").host).toEqual(opening(plan(), 0, "g-d-store").host);
  });

  it("locks onto another room's edge", () => {
    // move the elderly bedroom so its right edge (4) lands near 4.9 → should lock to 5 (kitchen x0 is 6, store x0 4…)
    const p = moveRoom(plan(), 0, "g-bed", 0.93, 0, SNAP);
    expect(roomRect(room(p, 0, "g-bed")).x1).toBe(5);
  });

  it("moves linked stairs on every level", () => {
    const p = moveRoom(plan(), 1, "u-stair", 0, 1, { grid: 0.5, magnet: 0 });
    expect(roomRect(room(p, 0, "g-stair")).y0).toBe(7);
    expect(roomRect(room(p, 1, "u-stair")).y0).toBe(7);
  });

  it("returns the same object when nothing changes", () => {
    const p0 = plan();
    expect(moveRoom(p0, 0, "g-store", 0.01, 0, { grid: 0.25, magnet: 0 })).toBe(p0);
  });
});

describe("resizeRoomSide", () => {
  it("moves the shared wall: both rooms resize, total area unchanged", () => {
    const p0 = plan();
    const p = resizeRoomSide(p0, 0, "g-living", "left", 6, { snap: SNAP });
    expect(roomRect(room(p, 0, "g-living")).x0).toBe(6);
    expect(roomRect(room(p, 0, "g-garage")).x1).toBe(6);
    expect(area(room(p, 0, "g-living").polygon) + area(room(p, 0, "g-garage").polygon)).toBe(72);
    expect(validatePlan(p).errors).toEqual([]);
  });

  it("resizes only this room when not linked", () => {
    const p = resizeRoomSide(plan(), 0, "g-living", "right", 13, { linked: false });
    expect(roomRect(room(p, 0, "g-living")).x1).toBe(13);
    expect(roomRect(room(p, 0, "g-dining")).x1).toBe(12);
  });

  it("keeps doors and windows where they are in the real world", () => {
    const p0 = plan();
    const before = worldCentre(p0, 0, "g-d-main");
    const p = resizeRoomSide(p0, 0, "g-living", "left", 6);
    expect(worldCentre(p, 0, "g-d-main")).toEqual(before);
  });

  it("never shrinks a room below the minimum size", () => {
    const p = resizeRoomSide(plan(), 0, "g-store", "top", 13.1);
    expect(roomRect(room(p, 0, "g-store")).y1).toBeCloseTo(13.6);
  });

  it("shrinks openings that no longer fit", () => {
    const p = resizeRoomSide(plan(), 0, "g-living", "left", 10.5, { linked: true });
    const o = opening(p, 0, "g-o-living-dining");
    expect(o.widthM).toBeLessThanOrEqual(1.5);
  });
});

describe("rooms and openings", () => {
  it("adds, edits and deletes rooms", () => {
    const { plan: p, id } = addRoom(plan(), 0, "shrine", { x0: 0, y0: 16, x1: 2, y1: 18 });
    expect(room(p, 0, id).type).toBe("shrine");
    const p2 = updateRoom(p, 0, id, { type: "stair" });
    expect(room(p2, 0, id).stairLinkId).toBe("S1");
    const p3 = deleteRoom(p2, 0, "g-bed");
    expect(p3.levels[0].rooms.some((r) => r.id === "g-bed")).toBe(false);
    expect(p3.levels[0].openings.some((o) => o.host.roomId === "g-bed")).toBe(false);
  });

  it("sets a room rectangle from numbers", () => {
    const p = setRoomRect(plan(), 0, "g-store", { x0: 4, y0: 13, x1: 6, y1: 15 });
    expect(area(room(p, 0, "g-store").polygon)).toBe(4);
  });

  it("adds a window on the nearest wall and slides it", () => {
    const res = addOpeningAt(plan(), 0, [0.05, 13], "window")!;
    const o = opening(res.plan, 0, res.id);
    expect(o.host.roomId).toBe("g-bed");
    expect(o.host.edgeIndex).toBe(3);
    const slid = slideOpening(res.plan, 0, res.id, [0, 11]);
    expect(worldCentre(slid, 0, res.id)[1]).toBeCloseTo(11);
    expect(addOpeningAt(plan(), 0, [2, 3], "door")).toBeNull(); // middle of the carport — no wall nearby
  });

  it("changing kind resets height/sill and keeps the opening on its wall", () => {
    const p = updateOpening(plan(), 0, "g-w-living", { kind: "sliding_door", widthM: 9 });
    const o = opening(p, 0, "g-w-living");
    expect(o.sillM).toBe(0);
    expect(o.widthM).toBeCloseTo(6.9);
    expect(o.host.offsetM).toBeCloseTo(0.1); // slid back so it ends on the 7 m wall
  });

  it("produces chain dimension lines", () => {
    expect(chainDimensions(plan(), 0).xs).toEqual([0, 2.5, 4, 5, 6, 9, 12]);
  });
});

describe("history", () => {
  it("commits, undoes, redoes, and records a drag as one step", () => {
    let h = initHistory(1);
    h = historyReducer(h, { type: "commit", value: 2 });
    h = historyReducer(h, { type: "preview", value: 3 });
    h = historyReducer(h, { type: "preview", value: 4 });
    h = historyReducer(h, { type: "endPreview" });
    expect(h.past).toEqual([1, 2]);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(2);
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(4);
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "commit", value: 9 });
    expect(h.future).toEqual([]);
  });
});
