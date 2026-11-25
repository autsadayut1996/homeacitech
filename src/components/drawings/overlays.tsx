/** Overlays drawn inside SitePlanSvg for the drawing set (server-safe, no hooks). */
import {
  type MepKind,
  type MepLayout,
  type Plan,
  type Point,
  roofPlan,
  sectionCut,
  toSite,
} from "@/lib/plan-core";
import { siteSvgFrame } from "@/components/SitePlanSvg";
import { chainDimensions } from "@/lib/editor/ops";

function mapper(plan: Plan) {
  const f = siteSvgFrame(plan.site);
  return (p: Point) => f.toSvg(toSite(plan, p));
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

/** Chain dimensions below and to the left of a floor. */
export function ChainDims({ plan, levelIndex }: { plan: Plan; levelIndex: number }) {
  const M = mapper(plan);
  const { xs, ys } = chainDimensions(plan, levelIndex);
  if (xs.length < 2 || ys.length < 2) return null;
  const dim = (a: Point, b: Point, label: string, vertical: boolean, key: string) => {
    const A = M(a);
    const B = M(b);
    const m: Point = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    return (
      <g key={key} stroke="var(--muted)" fill="var(--muted)">
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} strokeWidth={0.02} />
        {[A, B].map((P, i) => (
          <line key={i} x1={P[0] - 0.08} y1={P[1] + 0.08} x2={P[0] + 0.08} y2={P[1] - 0.08} strokeWidth={0.03} />
        ))}
        <text x={m[0]} y={m[1]} fontSize={0.22} stroke="none" textAnchor="middle" dy={vertical ? 0 : -0.06} transform={vertical ? `rotate(-90 ${m[0]} ${m[1]})` : undefined}>
          {label}
        </text>
      </g>
    );
  };
  const y0 = ys[0];
  const x0 = xs[0];
  return (
    <g>
      {xs.slice(0, -1).map((x, i) => dim([x, y0 - 0.7], [xs[i + 1], y0 - 0.7], (xs[i + 1] - x).toFixed(2), false, `x${i}`))}
      {dim([xs[0], y0 - 1.2], [xs[xs.length - 1], y0 - 1.2], (xs[xs.length - 1] - xs[0]).toFixed(2), false, "xt")}
      {ys.slice(0, -1).map((y, i) => dim([x0 - 0.7, y], [x0 - 0.7, ys[i + 1]], (ys[i + 1] - y).toFixed(2), true, `y${i}`))}
      {dim([x0 - 1.2, ys[0]], [x0 - 1.2, ys[ys.length - 1]], (ys[ys.length - 1] - ys[0]).toFixed(2), true, "yt")}
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
