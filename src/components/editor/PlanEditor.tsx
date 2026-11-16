"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type Opening,
  type Plan,
  type Point,
  type RoomType,
  ROOM_TYPES,
  ROOM_TYPE_INFO,
  area,
  bbox,
  buildableArea,
  centroid,
  computeMetrics,
  deriveWalls,
  describeIssue,
  edges,
  pointAlong,
  roomLabel,
  validatePlan,
} from "@/lib/plan-core";
import {
  type Rect,
  type Side,
  addOpeningAt,
  addRoom,
  chainDimensions,
  deleteOpening,
  deleteRoom,
  isRectRoom,
  moveRoom,
  resizeRoomSide,
  roomRect,
  setRoomRect,
  slideOpening,
  snapTo,
  updateOpening,
  updateRoom,
} from "@/lib/editor/ops";
import { historyReducer, initHistory } from "@/lib/editor/history";
import { estimate, type CatalogMaterial } from "@/lib/pricing/materials";
import { savePlanVersion } from "@/app/projects/[id]/edit/actions";
import { evaluateAll, overallStatus, type ComplianceContext, type RuleData } from "@/lib/compliance/rules";
import { CompliancePanel } from "@/components/CompliancePanel";

type Tool = "select" | "room" | Opening["kind"];
type Selection = { kind: "room"; id: string } | { kind: "opening"; id: string } | null;
type Drag =
  | { kind: "move"; base: Plan; start: Point; roomId: string }
  | { kind: "resize"; base: Plan; roomId: string; side: Side; linked: boolean }
  | { kind: "slide"; base: Plan; openingId: string }
  | { kind: "draw"; start: Point; current: Point }
  | { kind: "pan"; startClient: [number, number]; view: View };
interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GRIDS = [0.1, 0.25, 0.5];
const SIDES: Side[] = ["bottom", "right", "top", "left"];

export function PlanEditor({
  projectId,
  baseVersion,
  initialPlan,
  catalog,
  rules,
  complianceContext,
  jurisdiction,
  locale,
}: {
  projectId: string;
  baseVersion: { id: string; number: number | null };
  initialPlan: Plan;
  catalog: CatalogMaterial[];
  rules: RuleData[];
  complianceContext: Omit<ComplianceContext, "plan">;
  jurisdiction: string | null;
  locale: "th" | "en";
}) {
  const t = useTranslations("editor");
  const tc = useTranslations("compliance");
  const tu = useTranslations("units");
  const router = useRouter();
  const [hist, dispatch] = useReducer(historyReducer<Plan>, initialPlan, initHistory);
  const plan = hist.present;
  const [levelIndex, setLevelIndex] = useState(0);
  const [sel, setSel] = useState<Selection>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [newRoomType, setNewRoomType] = useState<RoomType>("bedroom");
  const [grid, setGrid] = useState(0.25);
  const [magnet, setMagnet] = useState(true);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dirty = hist.past.length > 0;

  const level = plan.levels[levelIndex];
  const [ox, oy] = plan.building.origin;
  const S = useCallback((p: Point): Point => [p[0] + ox, -(p[1] + oy)], [ox, oy]); // plan → svg

  // view: fit the whole plot (svg y is flipped), matching the canvas aspect ratio
  const siteBox = useMemo(() => bbox(plan.site.boundary), [plan.site.boundary]);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>(() => ({ x: siteBox.minX - 3, y: -siteBox.maxY - 3, w: siteBox.width + 6, h: siteBox.height + 6 }));
  const fitted = useRef(false);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (w < 10 || h < 10) return;
      setSize({ w, h });
      const ratio = h / w;
      if (!fitted.current) {
        fitted.current = true;
        const bw = siteBox.width + 6;
        const bh = siteBox.height + 6;
        const vw = bh / bw > ratio ? bh / ratio : bw;
        const vh = vw * ratio;
        const cx = siteBox.minX + siteBox.width / 2;
        const cy = -(siteBox.minY + siteBox.height / 2);
        setView({ x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh });
      } else {
        setView((v) => ({ ...v, h: v.w * ratio }));
      }
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [siteBox]);

  const validation = useMemo(() => validatePlan(plan), [plan]);
  const metrics = useMemo(() => computeMetrics(plan), [plan]);
  const total = useMemo(() => estimate(plan, catalog).total, [plan, catalog]);
  const compliance = useMemo(() => evaluateAll(rules, { plan, ...complianceContext }), [plan, rules, complianceContext]);
  const walls = useMemo(() => deriveWalls(plan, level), [plan, level]);
  const chains = useMemo(() => chainDimensions(plan, levelIndex), [plan, levelIndex]);
  const errorRooms = new Set(validation.errors.filter((e) => !e.levelId || e.levelId === level.id).flatMap((e) => e.roomIds ?? []));
  const buildable = useMemo(() => buildableArea(plan.site), [plan.site]);

  const pxPerM = () => size.w / view.w;
  const snapOpts = () => ({ grid, magnet: magnet ? 10 / pxPerM() : 0 });

  const toPlan = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [p.x - ox, -p.y - oy];
  };

  // ---- warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (e.key === "Escape") {
        setSel(null);
        setTool("select");
        setDrag(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        dispatch({ type: "commit", value: sel.kind === "room" ? deleteRoom(plan, levelIndex, sel.id) : deleteOpening(plan, levelIndex, sel.id) });
        setSel(null);
      } else if (sel?.kind === "room" && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = { ArrowLeft: [-grid, 0], ArrowRight: [grid, 0], ArrowUp: [0, grid], ArrowDown: [0, -grid] }[e.key] as [number, number];
        dispatch({ type: "commit", value: moveRoom(plan, levelIndex, sel.id, d[0], d[1]) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plan, levelIndex, sel, grid]);

  // ---- wheel zoom (non-passive so the page does not scroll)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      const k = Math.exp(e.deltaY * 0.0015);
      setView((v) => {
        const w = Math.min(200, Math.max(4, v.w * k));
        const h = (v.h * w) / v.w;
        return { x: p.x - ((p.x - v.x) * w) / v.w, y: p.y - ((p.y - v.y) * h) / v.h, w, h };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // ---- pointer handling
  const startDrag = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag(d);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const p = toPlan(e);
    if (tool === "room") {
      const s: Point = [snapTo(p[0], grid), snapTo(p[1], grid)];
      startDrag(e, { kind: "draw", start: s, current: s });
      return;
    }
    if (tool !== "select") {
      const res = addOpeningAt(plan, levelIndex, p, tool, grid);
      if (res) {
        dispatch({ type: "commit", value: res.plan });
        setSel({ kind: "opening", id: res.id });
        setTool("select");
      }
      return;
    }
    setSel(null);
    startDrag(e, { kind: "pan", startClient: [e.clientX, e.clientY], view });
  };

  const onRoomDown = (e: React.PointerEvent, roomId: string) => {
    if (tool !== "select") return; // let tools handle it on the background
    setSel({ kind: "room", id: roomId });
    startDrag(e, { kind: "move", base: plan, start: toPlan(e), roomId });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "pan") {
      const k = view.w / (svgRef.current?.clientWidth || 1);
      setView({ ...drag.view, x: drag.view.x - (e.clientX - drag.startClient[0]) * k, y: drag.view.y - (e.clientY - drag.startClient[1]) * k });
      return;
    }
    const p = toPlan(e);
    if (drag.kind === "draw") {
      setDrag({ ...drag, current: [snapTo(p[0], grid), snapTo(p[1], grid)] });
    } else if (drag.kind === "move") {
      dispatch({ type: "preview", value: moveRoom(drag.base, levelIndex, drag.roomId, p[0] - drag.start[0], p[1] - drag.start[1], snapOpts()) });
    } else if (drag.kind === "resize") {
      const coord = drag.side === "left" || drag.side === "right" ? p[0] : p[1];
      dispatch({ type: "preview", value: resizeRoomSide(drag.base, levelIndex, drag.roomId, drag.side, coord, { linked: drag.linked, snap: snapOpts() }) });
    } else if (drag.kind === "slide") {
      dispatch({ type: "preview", value: slideOpening(drag.base, levelIndex, drag.openingId, p, 0.05) });
    }
  };

  const onUp = () => {
    if (!drag) return;
    if (drag.kind === "draw") {
      const r: Rect = {
        x0: Math.min(drag.start[0], drag.current[0]),
        y0: Math.min(drag.start[1], drag.current[1]),
        x1: Math.max(drag.start[0], drag.current[0]),
        y1: Math.max(drag.start[1], drag.current[1]),
      };
      if (r.x1 - r.x0 >= 0.6 && r.y1 - r.y0 >= 0.6) {
        const res = addRoom(plan, levelIndex, newRoomType, r);
        dispatch({ type: "commit", value: res.plan });
        setSel({ kind: "room", id: res.id });
        setTool("select");
      }
    } else if (drag.kind !== "pan") {
      dispatch({ type: "endPreview" });
    }
    setDrag(null);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const res = await savePlanVersion(projectId, baseVersion.id, plan, label || t("defaultLabel"));
    setSaving(false);
    if (res.ok) {
      dispatch({ type: "reset", value: plan });
      router.push(`/projects/${projectId}?v=${res.versionId}`);
      router.refresh();
    } else setSaveError(res.error);
  };

  const selectedRoom = sel?.kind === "room" ? level.rooms.find((r) => r.id === sel.id) : undefined;
  const selectedOpening = sel?.kind === "opening" ? level.openings.find((o) => o.id === sel.id) : undefined;
  const sw = view.w / size.w; // one screen pixel, in metres
  const fs = 13 * sw; // label font size ≈ 13 px at any zoom
  const fmt = (v: number) => v.toFixed(2);
  const pts = (poly: Point[]) => poly.map((p) => S(p).join(",")).join(" ");
  const sitePts = (poly: Point[]) => poly.map((p) => `${p[0]},${-p[1]}`).join(" ");

  // ---- render helpers
  const dimLine = (a: Point, b: Point, offset: Point, text: string, key: string) => {
    const A = S([a[0] + offset[0], a[1] + offset[1]]);
    const B = S([b[0] + offset[0], b[1] + offset[1]]);
    const mid: Point = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const vertical = Math.abs(A[0] - B[0]) < 1e-6;
    return (
      <g key={key} className="pointer-events-none" stroke="var(--muted)" fill="var(--muted)">
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} strokeWidth={sw * 0.6} />
        {[A, B].map((P, i) => (
          <line key={i} x1={P[0] - sw * 3} y1={P[1] + sw * 3} x2={P[0] + sw * 3} y2={P[1] - sw * 3} strokeWidth={sw * 0.8} />
        ))}
        <text
          x={mid[0]}
          y={mid[1]}
          fontSize={fs * 0.85}
          stroke="none"
          textAnchor="middle"
          dy={vertical ? 0 : -sw * 3}
          transform={vertical ? `rotate(-90 ${mid[0]} ${mid[1]})` : undefined}
        >
          {text}
        </text>
      </g>
    );
  };

  const issueList = [...validation.errors, ...validation.warnings];

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[600px] gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line bg-paper">
            {plan.levels.map((l, i) => (
              <button
                key={l.id}
                onClick={() => {
                  setLevelIndex(i);
                  setSel(null);
                }}
                className={`px-3 py-1.5 text-sm ${i === levelIndex ? "bg-accent text-white" : "hover:bg-bg"}`}
              >
                {l.name[locale]}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-line bg-paper text-sm">
            {(["select", "room", "door", "window", "sliding_door", "opening"] as Tool[]).map((k) => (
              <button key={k} onClick={() => setTool(k)} className={`px-3 py-1.5 ${tool === k ? "bg-ink text-white" : "hover:bg-bg"}`} title={t(`toolHint_${k}`)}>
                {t(`tool_${k}`)}
              </button>
            ))}
          </div>
          {tool === "room" && (
            <select className="input w-auto py-1.5" value={newRoomType} onChange={(e) => setNewRoomType(e.target.value as RoomType)}>
              {ROOM_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {ROOM_TYPE_INFO[rt][locale]}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto flex items-center gap-2 text-sm">
            <button className="btn-ghost px-2 py-1.5" disabled={!hist.past.length} onClick={() => dispatch({ type: "undo" })} title="Ctrl+Z">
              ↶ {t("undo")}
            </button>
            <button className="btn-ghost px-2 py-1.5" disabled={!hist.future.length} onClick={() => dispatch({ type: "redo" })} title="Ctrl+Shift+Z">
              ↷ {t("redo")}
            </button>
            <label className="flex items-center gap-1">
              {t("grid")}
              <select className="input w-auto py-1" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
                {GRIDS.map((g) => (
                  <option key={g} value={g}>
                    {g} {tu("m")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={magnet} onChange={(e) => setMagnet(e.target.checked)} />
              {t("magnet")}
            </label>
          </div>
        </div>
        <p className="text-xs text-muted">{t(`toolHint_${tool}`)}</p>

        {/* canvas */}
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={`w-full flex-1 touch-none select-none rounded-lg border border-line bg-paper ${tool === "select" ? (drag?.kind === "pan" ? "cursor-grabbing" : "cursor-default") : "cursor-crosshair"}`}
          onPointerDown={onBackgroundDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          data-testid="plan-canvas"
        >
          {/* grid */}
          <defs>
            <pattern id="grid" width={1} height={1} patternUnits="userSpaceOnUse" x={ox} y={-oy}>
              <path d="M 1 0 L 0 0 0 1" fill="none" stroke="var(--line)" strokeWidth={sw * 0.5} />
            </pattern>
          </defs>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#grid)" />
          <polygon points={sitePts(plan.site.boundary)} fill="var(--land)" fillOpacity={0.6} stroke="var(--ink)" strokeWidth={sw * 1.5} />
          {buildable.polygon.length > 2 && (
            <polygon points={sitePts(buildable.polygon)} fill="none" stroke="var(--setback)" strokeWidth={sw} strokeDasharray={`${sw * 6} ${sw * 4}`} />
          )}

          {/* level below as a ghost, for aligning upper floors */}
          {levelIndex > 0 &&
            plan.levels[levelIndex - 1].rooms.map((r) => (
              <polygon key={`ghost-${r.id}`} points={pts(r.polygon)} fill="none" stroke="var(--muted)" strokeOpacity={0.5} strokeWidth={sw * 0.8} strokeDasharray={`${sw * 3} ${sw * 3}`} className="pointer-events-none" />
            ))}

          {/* rooms */}
          {level.rooms.map((r) => {
            const info = ROOM_TYPE_INFO[r.type];
            const c = S(centroid(r.polygon));
            const rr = roomRect(r);
            const isSel = sel?.kind === "room" && sel.id === r.id;
            const lab = roomLabel(r, locale);
            const lfs = Math.min(fs, ((rr.x1 - rr.x0) * 0.9) / (lab.length * 0.55));
            return (
              <g key={r.id} onPointerDown={(e) => onRoomDown(e, r.id)} className={tool === "select" ? "cursor-move" : ""}>
                <polygon
                  points={pts(r.polygon)}
                  fill={errorRooms.has(r.id) ? "var(--bad-bg)" : info.outdoor ? "var(--outdoor)" : info.wet ? "var(--wet)" : "var(--room)"}
                  stroke={isSel ? "var(--accent)" : info.outdoor ? "var(--muted)" : "none"}
                  strokeWidth={isSel ? sw * 2.5 : sw * 0.6}
                  strokeDasharray={!isSel && info.outdoor ? `${sw * 3} ${sw * 2}` : undefined}
                />
                <text x={c[0]} y={c[1] - lfs * 0.2} fontSize={lfs} textAnchor="middle" className="pointer-events-none" fill="var(--ink)">
                  {lab}
                </text>
                <text x={c[0]} y={c[1] + fs * 1.1} fontSize={Math.min(fs * 0.8, ((rr.x1 - rr.x0) * 0.9) / 16)} textAnchor="middle" className="pointer-events-none" fill="var(--muted)">
                  {fmt(rr.x1 - rr.x0)}×{fmt(rr.y1 - rr.y0)} · {area(r.polygon).toFixed(1)} {tu("sqm")}
                </text>
              </g>
            );
          })}

          {/* walls */}
          {walls.map((w) => {
            const a = S(w.a);
            const b = S(w.b);
            return <line key={w.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--ink)" strokeWidth={w.thicknessM} strokeLinecap="square" className="pointer-events-none" />;
          })}

          {/* openings */}
          {level.openings.map((o) => {
            const room = level.rooms.find((r) => r.id === o.host.roomId);
            const e = room && edges(room.polygon)[o.host.edgeIndex];
            if (!e) return null;
            const a = S(pointAlong(e, o.host.offsetM));
            const b = S(pointAlong(e, o.host.offsetM + o.widthM));
            const isSel = sel?.kind === "opening" && sel.id === o.id;
            const color = o.kind === "window" ? "var(--window)" : o.kind === "opening" ? "var(--muted)" : "var(--door)";
            return (
              <g
                key={o.id}
                className={tool === "select" ? "cursor-ew-resize" : ""}
                onPointerDown={(ev) => {
                  if (tool !== "select") return;
                  setSel({ kind: "opening", id: o.id });
                  startDrag(ev, { kind: "slide", base: plan, openingId: o.id });
                }}
              >
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--paper)" strokeWidth={0.22} />
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={isSel ? "var(--accent)" : color} strokeWidth={isSel ? 0.18 : o.kind === "window" ? 0.08 : 0.12} strokeDasharray={o.kind === "opening" ? "0.15 0.1" : undefined} />
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={Math.max(0.4, sw * 10)} />
              </g>
            );
          })}

          {/* chain dimensions along the bottom and left of this level */}
          {chains.xs.length > 1 &&
            chains.xs.slice(0, -1).map((x, i) => dimLine([x, chains.ys[0]], [chains.xs[i + 1], chains.ys[0]], [0, -24 * sw], fmt(chains.xs[i + 1] - x), `cx${i}`))}
          {chains.xs.length > 1 && dimLine([chains.xs[0], chains.ys[0]], [chains.xs[chains.xs.length - 1], chains.ys[0]], [0, -48 * sw], fmt(chains.xs[chains.xs.length - 1] - chains.xs[0]), "cxt")}
          {chains.ys.length > 1 &&
            chains.ys.slice(0, -1).map((y, i) => dimLine([chains.xs[0], y], [chains.xs[0], chains.ys[i + 1]], [-24 * sw, 0], fmt(chains.ys[i + 1] - y), `cy${i}`))}
          {chains.ys.length > 1 && dimLine([chains.xs[0], chains.ys[0]], [chains.xs[0], chains.ys[chains.ys.length - 1]], [-48 * sw, 0], fmt(chains.ys[chains.ys.length - 1] - chains.ys[0]), "cyt")}

          {/* resize handles for the selected room */}
          {selectedRoom && isRectRoom(selectedRoom) && tool === "select" &&
            SIDES.map((side) => {
              const e = edges(selectedRoom.polygon)[{ bottom: 0, right: 1, top: 2, left: 3 }[side]];
              const a = S(e[0]);
              const b = S(e[1]);
              const m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
              const vertical = side === "left" || side === "right";
              const hs = sw * 7;
              return (
                <g
                  key={side}
                  className={vertical ? "cursor-ew-resize" : "cursor-ns-resize"}
                  onPointerDown={(ev) => startDrag(ev, { kind: "resize", base: plan, roomId: selectedRoom.id, side, linked: !ev.altKey })}
                  data-testid={`handle-${side}`}
                >
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={sw * 10} />
                  <rect x={m[0] - hs / 2} y={m[1] - hs / 2} width={hs} height={hs} fill="var(--paper)" stroke="var(--accent)" strokeWidth={sw * 1.5} />
                </g>
              );
            })}

          {/* regulation problems */}
          {compliance
            .flatMap((r) => r.marks)
            .filter((m) => !m.levelId || m.levelId === level.id)
            .map((m, i) => (
              <line key={`cm-${i}`} x1={m.a[0]} y1={-m.a[1]} x2={m.b[0]} y2={-m.b[1]} stroke={m.status === "fail" ? "var(--bad)" : "var(--warn)"} strokeWidth={Math.max(0.3, sw * 8)} strokeOpacity={0.7} strokeLinecap="round" className="pointer-events-none" />
            ))}

          {/* room being drawn */}
          {drag?.kind === "draw" && (
            <polygon
              points={pts([drag.start, [drag.current[0], drag.start[1]], drag.current, [drag.start[0], drag.current[1]]])}
              fill="var(--accent)"
              fillOpacity={0.15}
              stroke="var(--accent)"
              strokeWidth={sw * 1.5}
              className="pointer-events-none"
            />
          )}
        </svg>
      </div>

      {/* side panel */}
      <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
        <div className="card space-y-2 p-4">
          <p className="text-xs text-muted">{t("editingFrom", { n: baseVersion.number ?? "?" })}</p>
          <input className="input" placeholder={t("labelPlaceholder")} value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn-primary w-full" disabled={saving || !dirty} onClick={save}>
            {saving ? t("saving") : t("save")}
          </button>
          {saveError && <p className="text-xs text-bad">{saveError}</p>}
          <p className="text-xs text-muted">
            {t("summary", { area: metrics.totalAreaM2.toFixed(0), bed: metrics.bedrooms, bath: metrics.bathrooms })} ·{" "}
            {total.toLocaleString(locale === "th" ? "th-TH" : "en-US")} {tu("baht")}*
          </p>
        </div>

        {selectedRoom && (
          <RoomInspector
            key={selectedRoom.id}
            plan={plan}
            levelIndex={levelIndex}
            roomId={selectedRoom.id}
            locale={locale}
            onChange={(p) => dispatch({ type: "commit", value: p })}
            onDelete={() => {
              dispatch({ type: "commit", value: deleteRoom(plan, levelIndex, selectedRoom.id) });
              setSel(null);
            }}
          />
        )}
        {selectedOpening && (
          <OpeningInspector
            key={selectedOpening.id}
            opening={selectedOpening}
            onChange={(patch) => dispatch({ type: "commit", value: updateOpening(plan, levelIndex, selectedOpening.id, patch) })}
            onDelete={() => {
              dispatch({ type: "commit", value: deleteOpening(plan, levelIndex, selectedOpening.id) });
              setSel(null);
            }}
          />
        )}

        <div className="card p-4">
          <p className="mb-2 font-semibold">
            {t("check")}{" "}
            <span className="text-sm font-normal">
              {validation.errors.length ? `❌ ${validation.errors.length}` : "✅"} {validation.warnings.length ? `⚠️ ${validation.warnings.length}` : ""}
            </span>
          </p>
          <ul className="space-y-1 text-xs">
            {issueList.map((i, k) => {
              const li = plan.levels.findIndex((l) => l.id === i.levelId);
              const rid = i.roomIds?.[0];
              const name = rid && plan.levels.flatMap((l) => l.rooms).find((r) => r.id === rid);
              return (
                <li key={k}>
                  <button
                    className={`text-left hover:underline ${i.severity === "error" ? "text-bad" : "text-warn"}`}
                    onClick={() => {
                      if (li >= 0) setLevelIndex(li);
                      if (rid) setSel({ kind: "room", id: rid });
                    }}
                  >
                    {i.severity === "error" ? "❌" : "⚠️"} {name ? `${roomLabel(name, locale)}: ` : ""}
                    {describeIssue(i, locale)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="card p-4">
          <CompliancePanel
            compact
            results={compliance}
            locale={locale}
            jurisdiction={jurisdiction}
            labels={{ title: tc("title"), disclaimer: tc("disclaimer"), unverified: tc("unverified"), source: tc("source"), summary: tc(`overall_${overallStatus(compliance)}`) }}
          />
        </div>
        <p className="text-xs text-muted">{t("help")}</p>
      </aside>
    </div>
  );
}

function NumberInput({ value, onCommit, step = 0.05, className = "" }: { value: number; onCommit: (v: number) => void; step?: number; className?: string }) {
  const [text, setText] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setText(String(Number(value.toFixed(3)))), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v) && v !== value) onCommit(v);
    else setText(String(Number(value.toFixed(3))));
  };
  return (
    <input
      className={`input py-1 ${className}`}
      type="number"
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

function RoomInspector({
  plan,
  levelIndex,
  roomId,
  locale,
  onChange,
  onDelete,
}: {
  plan: Plan;
  levelIndex: number;
  roomId: string;
  locale: "th" | "en";
  onChange: (p: Plan) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("editor");
  const room = plan.levels[levelIndex].rooms.find((r) => r.id === roomId)!;
  const r = roomRect(room);
  const w = r.x1 - r.x0;
  const d = r.y1 - r.y0;
  const rect = isRectRoom(room);
  return (
    <div className="card space-y-2 p-4 text-sm">
      <p className="font-semibold">{t("room")}</p>
      <select className="input py-1" value={room.type} onChange={(e) => onChange(updateRoom(plan, levelIndex, roomId, { type: e.target.value as RoomType }))}>
        {ROOM_TYPES.map((rt) => (
          <option key={rt} value={rt}>
            {ROOM_TYPE_INFO[rt][locale]}
          </option>
        ))}
      </select>
      <input
        className="input py-1"
        placeholder={t("customName")}
        defaultValue={room.name?.[locale] ?? ""}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v === (room.name?.[locale] ?? "")) return;
          onChange(updateRoom(plan, levelIndex, roomId, { name: v ? { th: v, en: v, ...(room.name ?? {}), [locale]: v } : { th: "", en: "" } }));
        }}
      />
      {rect ? (
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">{t("width")}</span>
            <NumberInput value={w} onCommit={(v) => onChange(setRoomRect(plan, levelIndex, roomId, { ...r, x1: r.x0 + v }))} />
          </label>
          <label>
            <span className="label">{t("depth")}</span>
            <NumberInput value={d} onCommit={(v) => onChange(setRoomRect(plan, levelIndex, roomId, { ...r, y1: r.y0 + v }))} />
          </label>
          <label>
            <span className="label">X</span>
            <NumberInput value={r.x0} onCommit={(v) => onChange(setRoomRect(plan, levelIndex, roomId, { x0: v, x1: v + w, y0: r.y0, y1: r.y1 }))} />
          </label>
          <label>
            <span className="label">Y</span>
            <NumberInput value={r.y0} onCommit={(v) => onChange(setRoomRect(plan, levelIndex, roomId, { x0: r.x0, x1: r.x1, y0: v, y1: v + d }))} />
          </label>
        </div>
      ) : (
        <p className="text-xs text-muted">{t("nonRect")}</p>
      )}
      <p className="text-muted">{t("area", { a: area(room.polygon).toFixed(2) })}</p>
      {room.type === "stair" && (
        <label>
          <span className="label">{t("stairLink")}</span>
          <input className="input py-1" defaultValue={room.stairLinkId} onBlur={(e) => onChange(updateRoom(plan, levelIndex, roomId, { stairLinkId: e.target.value.trim() || "S1" }))} />
        </label>
      )}
      <button className="text-sm text-bad hover:underline" onClick={onDelete}>
        {t("deleteRoom")}
      </button>
    </div>
  );
}

function OpeningInspector({ opening, onChange, onDelete }: { opening: Opening; onChange: (p: Parameters<typeof updateOpening>[3]) => void; onDelete: () => void }) {
  const t = useTranslations("editor");
  return (
    <div className="card space-y-2 p-4 text-sm">
      <p className="font-semibold">{t("opening")}</p>
      <select className="input py-1" value={opening.kind} onChange={(e) => onChange({ kind: e.target.value as Opening["kind"] })}>
        {(["door", "sliding_door", "window", "opening"] as const).map((k) => (
          <option key={k} value={k}>
            {t(`tool_${k}`)}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">{t("width")}</span>
          <NumberInput value={opening.widthM} onCommit={(v) => onChange({ widthM: v })} />
        </label>
        <label>
          <span className="label">{t("offset")}</span>
          <NumberInput value={opening.host.offsetM} onCommit={(v) => onChange({ offsetM: v })} />
        </label>
        <label>
          <span className="label">{t("height")}</span>
          <NumberInput value={opening.heightM ?? 2.1} onCommit={(v) => onChange({ heightM: v })} />
        </label>
        <label>
          <span className="label">{t("sill")}</span>
          <NumberInput value={opening.sillM ?? 0} onCommit={(v) => onChange({ sillM: v })} />
        </label>
      </div>
      <button className="text-sm text-bad hover:underline" onClick={onDelete}>
        {t("deleteOpening")}
      </button>
    </div>
  );
}
