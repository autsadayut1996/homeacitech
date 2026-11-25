/** Overlays drawn inside SitePlanSvg for the drawing set (server-safe, no hooks). */
import {
  type MepKind,
  type MepLayout,
  type Plan,
  type Point,
  type OpeningMarks,
  area,
  centroid,
  columns,
  fmtLevel,
  openingMarkPosition,
  roofPlan,
  roomTag,
  sectionCut,
  structuralGrid,
  toSite,
} from "@/lib/plan-core";
import { siteSvgFrame } from "@/components/SitePlanSvg";

function mapper(plan: Plan) {
  const f = siteSvgFrame(plan.site);
  return (p: Point) => f.toSvg(toSite(plan, p));
}

/** Distance (m) from the building to the grid bubbles. */
const GRID_OUT = 3.2;

/** SVG window around the building and its grid bubbles, for plans drawn at a larger scale than the site. */
export function buildingCrop(plan: Plan, margin = GRID_OUT + 1.1) {
  const g = structuralGrid(plan).bounds;
  const f = siteSvgFrame(plan.site);
  const pts = [
    [g.minX - margin, g.minY - margin],
    [g.maxX + margin, g.minY - margin],
    [g.maxX + margin, g.maxY + margin],
    [g.minX - margin, g.maxY + margin],
  ].map((p) => f.toSvg(toSite(plan, p as Point)));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/**
 * Structural grid: dash-dot axes with numbered / lettered bubbles on all four sides, the
 * dimension chain between axes and the overall dimension, and columns on this level.
 */
export function GridOverlay({ plan, levelIndex }: { plan: Plan; levelIndex: number }) {
  const M = mapper(plan);
  const g = structuralGrid(plan);
  const b = g.bounds;
  const R = 0.38;
  const ext = GRID_OUT;
  const bubble = (p: Point, label: string, key: string) => {
    const P = M(p);
    return (
      <g key={key}>
        <circle cx={P[0]} cy={P[1]} r={R} fill="var(--paper)" stroke="var(--ink)" strokeWidth={0.035} />
        <text x={P[0]} y={P[1]} fontSize={0.4} textAnchor="middle" dominantBaseline="central" fill="var(--ink)">
          {label}
        </text>
      </g>
    );
  };
  const line = (a: Point, c: Point, key: string, w = 0.018, dash?: string) => {
    const A = M(a);
    const C = M(c);
    return <line key={key} x1={A[0]} y1={A[1]} x2={C[0]} y2={C[1]} stroke="var(--muted)" strokeWidth={w} strokeDasharray={dash} />;
  };
  const dim = (a: Point, c: Point, label: string, vertical: boolean, key: string) => {
    const A = M(a);
    const C = M(c);
    const m: Point = [(A[0] + C[0]) / 2, (A[1] + C[1]) / 2];
    return (
      <g key={key} stroke="var(--ink)" fill="var(--ink)">
        <line x1={A[0]} y1={A[1]} x2={C[0]} y2={C[1]} strokeWidth={0.015} />
        {[A, C].map((P, i) => (
          <line key={i} x1={P[0] - 0.09} y1={P[1] + 0.09} x2={P[0] + 0.09} y2={P[1] - 0.09} strokeWidth={0.03} />
        ))}
        <text x={m[0]} y={m[1]} fontSize={0.24} stroke="none" textAnchor="middle" dy={-0.07} transform={vertical ? `rotate(-90 ${m[0]} ${m[1]})` : undefined}>
          {label}
        </text>
      </g>
    );
  };
  const chain = (axes: { at: number }[], at: (v: number, off: number) => Point, vertical: boolean, k: string) => [
    ...axes.slice(0, -1).map((a, i) => dim(at(a.at, 1.2), at(axes[i + 1].at, 1.2), (axes[i + 1].at - a.at).toFixed(2), vertical, `${k}${i}`)),
    axes.length > 1 ? dim(at(axes[0].at, 1.9), at(axes[axes.length - 1].at, 1.9), (axes[axes.length - 1].at - axes[0].at).toFixed(2), vertical, `${k}t`) : null,
  ];
  const cols = columns(plan, levelIndex, g);
  return (
    <g data-testid="grid-overlay">
      {g.x.map((a) => line([a.at, b.minY - ext + R], [a.at, b.maxY + ext - R], `gx${a.label}`, 0.018, "0.7 0.12 0.1 0.12"))}
      {g.y.map((a) => line([b.minX - ext + R, a.at], [b.maxX + ext - R, a.at], `gy${a.label}`, 0.018, "0.7 0.12 0.1 0.12"))}
      {chain(g.x, (v, off) => [v, b.minY - off], false, "dx")}
      {chain(g.x, (v, off) => [v, b.maxY + off], false, "dX")}
      {chain(g.y, (v, off) => [b.minX - off, v], true, "dy")}
      {chain(g.y, (v, off) => [b.maxX + off, v], true, "dY")}
      {g.x.flatMap((a) => [bubble([a.at, b.minY - ext], a.label, `bx${a.label}`), bubble([a.at, b.maxY + ext], a.label, `bX${a.label}`)])}
      {g.y.flatMap((a) => [bubble([b.minX - ext, a.at], a.label, `by${a.label}`), bubble([b.maxX + ext, a.at], a.label, `bY${a.label}`)])}
      {cols.map((c, i) => {
        const P = M(c);
        return <rect key={`c${i}`} x={P[0] - 0.1} y={P[1] - 0.1} width={0.2} height={0.2} fill="var(--ink)" />;
      })}
    </g>
  );
}

/** Room tags (finish codes, floor level, ceiling) and door / window marks for one level. */
export function PlanTags({ plan, levelIndex, marks }: { plan: Plan; levelIndex: number; marks: OpeningMarks }) {
  const M = mapper(plan);
  const level = plan.levels[levelIndex];
  const h = 0.3;
  return (
    <g data-testid="plan-tags">
      {level.rooms
        .filter((r) => r.type !== "pool" && r.type !== "stair")
        .map((r) => {
          const t = roomTag(plan, level, r);
          const cells = [t.floorCode, fmtLevel(t.floorLevel), ...(t.ceilingCode ? [t.ceilingCode, `+${t.ceilingHeight!.toFixed(2)}`] : [])];
          const widths = cells.map((c) => (c.length <= 2 ? 0.42 : 0.72));
          const total = widths.reduce((a, b) => a + b, 0);
          const c = M(centroid(r.polygon));
          let x = c[0] - total / 2;
          const y = c[1] + 0.12;
          return (
            <g key={r.id}>
              <text x={c[0]} y={y + h + 0.28} fontSize={0.2} textAnchor="middle" fill="var(--muted)">
                {area(r.polygon).toFixed(1)} ตร.ม.
              </text>
              {cells.map((cell, i) => {
                const w = widths[i];
                const el = (
                  <g key={i}>
                    <rect x={x} y={y} width={w} height={h} fill="var(--paper)" stroke="var(--ink)" strokeWidth={0.015} />
                    <text x={x + w / 2} y={y + h / 2} fontSize={0.17} textAnchor="middle" dominantBaseline="central" fill="var(--ink)">
                      {cell}
                    </text>
                  </g>
                );
                x += w;
                return el;
              })}
            </g>
          );
        })}
      {level.rooms
        .filter((r) => r.type === "stair" && levelIndex < plan.levels.length - 1)
        .map((r) => {
          // "ขึ้น" (up) arrow along the longer side of the stair
          const xs = r.polygon.map((p) => p[0]);
          const ys = r.polygon.map((p) => p[1]);
          const along = Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
          const half = (along ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys)) * 0.35;
          const a = M(along ? [cx - half, cy] : [cx, cy - half]);
          const e = M(along ? [cx + half, cy] : [cx, cy + half]);
          const dx = e[0] - a[0];
          const dy = e[1] - a[1];
          const L = Math.hypot(dx, dy) || 1;
          const ux = dx / L;
          const uy = dy / L;
          return (
            <g key={r.id} stroke="var(--ink)" strokeWidth={0.025} fill="none">
              <circle cx={a[0]} cy={a[1]} r={0.08} fill="var(--ink)" />
              <line x1={a[0]} y1={a[1]} x2={e[0]} y2={e[1]} />
              <polyline points={`${e[0] - ux * 0.25 - uy * 0.12},${e[1] - uy * 0.25 + ux * 0.12} ${e[0]},${e[1]} ${e[0] - ux * 0.25 + uy * 0.12},${e[1] - uy * 0.25 - ux * 0.12}`} />
              <text x={a[0] - uy * 0.3} y={a[1] + ux * 0.3} fontSize={0.24} textAnchor="middle" stroke="none" fill="var(--ink)">
                ขึ้น
              </text>
            </g>
          );
        })}
      {level.openings.map((o) => {
        const code = marks.codes[o.id];
        const p = code && openingMarkPosition(level, o);
        if (!p) return null;
        const P = M(p);
        const door = code.startsWith("D");
        return (
          <g key={o.id}>
            {door ? (
              <circle cx={P[0]} cy={P[1]} r={0.2} fill="var(--paper)" stroke="var(--door)" strokeWidth={0.02} />
            ) : (
              <polygon
                points={[0, 60, 120, 180, 240, 300].map((d) => `${P[0] + 0.22 * Math.cos((d * Math.PI) / 180)},${P[1] + 0.2 * Math.sin((d * Math.PI) / 180)}`).join(" ")}
                fill="var(--paper)"
                stroke="var(--window)"
                strokeWidth={0.02}
              />
            )}
            <text x={P[0]} y={P[1]} fontSize={0.16} textAnchor="middle" dominantBaseline="central" fill="var(--ink)" fontWeight={600}>
              {code}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function RoofPlanOverlay({ plan }: { plan: Plan }) {
  const M = mapper(plan);
  const rp = roofPlan(plan);
  const style = {
    eave: { s: "var(--ink)", w: 0.07 },
    ridge: { s: "var(--ink)", w: 0.07 },
    hip: { s: "var(--ink)", w: 0.04 },
    wall: { s: "var(--muted)", w: 0.04, d: "0.25 0.15" },
    arrow: { s: "var(--accent)", w: 0.04 },
  } as const;
  return (
    <g>
      {rp.lines.map((l, i) => {
        const a = M(l.a);
        const b = M(l.b);
        const st = style[l.kind];
        return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={st.s} strokeWidth={st.w} strokeDasharray={"d" in st ? st.d : undefined} strokeLinecap="round" />;
      })}
      {rp.labels.map((t, i) => {
        const p = M(t.at);
        return (
          <text key={i} x={p[0]} y={p[1]} fontSize={0.35} textAnchor="middle" dominantBaseline="middle" fill="var(--accent)">
            {t.text}
          </text>
        );
      })}
    </g>
  );
}

/** Section cut lines with A / B tags at both ends. */
export function SectionMarks({ plan }: { plan: Plan }) {
  const M = mapper(plan);
  return (
    <g>
      {(["A", "B"] as const).map((n) => {
        const c = sectionCut(plan, n);
        const a: Point = c.axis === "y" ? [c.from, c.at] : [c.at, c.from];
        const b: Point = c.axis === "y" ? [c.to, c.at] : [c.at, c.to];
        const A = M(a);
        const B = M(b);
        return (
          <g key={n}>
            <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="var(--setback)" strokeWidth={0.04} strokeDasharray="0.6 0.15 0.1 0.15" />
            {[A, B].map((P, i) => (
              <g key={i}>
                <circle cx={P[0]} cy={P[1]} r={0.38} fill="var(--paper)" stroke="var(--setback)" strokeWidth={0.05} />
                <text x={P[0]} y={P[1]} fontSize={0.42} textAnchor="middle" dominantBaseline="central" fill="var(--setback)" fontWeight={700}>
                  {n}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** One electrical / sanitary symbol at the origin (metres). */
export function MepSymbol({ kind }: { kind: MepKind }) {
  const e = "#b45309"; // electrical
  const w = "#0369a1"; // water / sanitary
  const t = (txt: string, c: string, size = 0.16) => (
    <text fontSize={size} textAnchor="middle" dominantBaseline="central" fill={c} fontWeight={700}>
      {txt}
    </text>
  );
  switch (kind) {
    case "light":
      return (
        <g stroke={e} strokeWidth={0.03} fill="none">
          <circle r={0.17} />
          <line x1={-0.12} y1={-0.12} x2={0.12} y2={0.12} />
          <line x1={-0.12} y1={0.12} x2={0.12} y2={-0.12} />
        </g>
      );
    case "switch":
      return (
        <g>
          <circle r={0.09} fill={e} />
          <line x1={0.06} y1={-0.06} x2={0.2} y2={-0.2} stroke={e} strokeWidth={0.03} />
        </g>
      );
    case "socket":
      return (
        <g stroke={e} strokeWidth={0.03} fill="var(--paper)">
          <circle r={0.11} />
          <line x1={-0.05} y1={-0.03} x2={-0.05} y2={0.04} />
          <line x1={0.05} y1={-0.03} x2={0.05} y2={0.04} />
        </g>
      );
    case "ac":
      return (
        <g>
          <rect x={-0.4} y={-0.13} width={0.8} height={0.26} fill="var(--paper)" stroke={e} strokeWidth={0.03} />
          {t("AC", e, 0.15)}
        </g>
      );
    case "heater":
      return (
        <g>
          <circle r={0.16} fill="var(--paper)" stroke={e} strokeWidth={0.03} />
          {t("WH", e, 0.12)}
        </g>
      );
    case "db":
      return (
        <g>
          <rect x={-0.28} y={-0.14} width={0.56} height={0.28} fill={e} />
          {t("DB", "#fff", 0.14)}
        </g>
      );
    case "meter":
      return (
        <g>
          <circle r={0.2} fill="var(--paper)" stroke={e} strokeWidth={0.04} />
          {t("kWh", e, 0.11)}
        </g>
      );
    case "wc":
      return (
        <g stroke={w} strokeWidth={0.03} fill="var(--paper)">
          <rect x={-0.2} y={-0.32} width={0.4} height={0.16} />
          <ellipse cx={0} cy={0.06} rx={0.19} ry={0.24} />
        </g>
      );
    case "basin":
      return (
        <g stroke={w} strokeWidth={0.03} fill="var(--paper)">
          <rect x={-0.25} y={-0.2} width={0.5} height={0.4} rx={0.08} />
          <circle r={0.05} />
        </g>
      );
    case "shower":
      return (
        <g stroke={w} strokeWidth={0.03} fill="none">
          <rect x={-0.4} y={-0.4} width={0.8} height={0.8} />
          <line x1={-0.4} y1={-0.4} x2={0.4} y2={0.4} />
          <line x1={-0.4} y1={0.4} x2={0.4} y2={-0.4} />
        </g>
      );
    case "sink":
      return (
        <g stroke={w} strokeWidth={0.03} fill="var(--paper)">
          <rect x={-0.4} y={-0.25} width={0.8} height={0.5} />
          <rect x={-0.3} y={-0.17} width={0.32} height={0.34} />
          <circle cx={0.2} r={0.05} />
        </g>
      );
    case "washer":
      return (
        <g stroke={w} strokeWidth={0.03} fill="var(--paper)">
          <rect x={-0.3} y={-0.3} width={0.6} height={0.6} />
          <circle r={0.18} />
        </g>
      );
    case "floor_drain":
      return (
        <g>
          <circle r={0.09} fill="var(--paper)" stroke={w} strokeWidth={0.03} />
          <circle r={0.03} fill={w} />
        </g>
      );
    case "riser":
      return <circle r={0.1} fill={w} />;
    case "septic":
      return (
        <g>
          <circle r={0.65} fill="var(--paper)" stroke={w} strokeWidth={0.05} />
          {t("ST", w, 0.3)}
        </g>
      );
    case "grease":
      return (
        <g>
          <rect x={-0.3} y={-0.3} width={0.6} height={0.6} fill="var(--paper)" stroke={w} strokeWidth={0.04} />
          {t("GT", w, 0.2)}
        </g>
      );
    case "water_meter":
      return (
        <g>
          <circle r={0.2} fill="var(--paper)" stroke={w} strokeWidth={0.04} />
          {t("WM", w, 0.12)}
        </g>
      );
    case "tank_pump":
      return (
        <g>
          <circle r={0.5} fill="var(--paper)" stroke={w} strokeWidth={0.04} />
          {t("WT+P", w, 0.15)}
        </g>
      );
  }
}

export function MepOverlay({ plan, layout, levelId, kinds, showRuns }: { plan: Plan; layout: MepLayout; levelId: string; kinds: MepKind[]; showRuns: boolean }) {
  const M = mapper(plan);
  return (
    <g>
      {showRuns &&
        layout.runs
          .filter((r) => r.levelId === levelId)
          .map((r, i) => (
            <polyline
              key={`r${i}`}
              points={r.points.map((p) => M(p).join(",")).join(" ")}
              fill="none"
              stroke={r.kind === "drain" ? "#7c4a1e" : "#0284c7"}
              strokeWidth={r.kind === "drain" ? 0.06 : 0.04}
              strokeDasharray={r.kind === "water" ? "0.25 0.12" : undefined}
              strokeLinejoin="round"
            />
          ))}
      {layout.items
        .filter((it) => it.levelId === levelId && kinds.includes(it.kind))
        .map((it, i) => {
          const p = M(it.at);
          return (
            <g key={i} transform={`translate(${p[0]} ${p[1]})`}>
              <MepSymbol kind={it.kind} />
            </g>
          );
        })}
    </g>
  );
}
