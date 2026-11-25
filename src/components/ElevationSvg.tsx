import type { Elevation, LineKind } from "@/lib/plan-core";

const STYLE: Record<LineKind, { stroke: string; width: number; dash?: string }> = {
  wall: { stroke: "var(--ink)", width: 0.06 },
  opening: { stroke: "var(--ink)", width: 0.035 },
  glass: { stroke: "var(--window)", width: 0.025 },
  roof: { stroke: "var(--ink)", width: 0.05 },
  railing: { stroke: "var(--muted)", width: 0.03 },
  ground: { stroke: "var(--ink)", width: 0.1 },
  level: { stroke: "var(--muted)", width: 0.025 },
  dim: { stroke: "var(--muted)", width: 0.025 },
};

/** Line drawing of one elevation (z up). Server-renderable; used on the project page and quotations. */
export function ElevationSvg({ e, title, className }: { e: Elevation; title?: string; className?: string }) {
  const { minU, maxU, minZ, maxZ } = e.bounds;
  const top = maxZ + (title ? 0.9 : 0);
  const W = maxU - minU;
  const H = top - minZ;
  const X = (u: number) => u - minU;
  const Y = (z: number) => top - z;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={title} style={{ background: "var(--paper)" }}>
      {title && (
        <text x={W / 2} y={0.6} fontSize={0.45} textAnchor="middle" fill="var(--ink)" fontWeight={600}>
          {title}
        </text>
      )}
      {e.lines.map((l, i) => {
        const s = STYLE[l.kind];
        return <line key={i} x1={X(l.a[0])} y1={Y(l.a[1])} x2={X(l.b[0])} y2={Y(l.b[1])} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" />;
      })}
      {e.texts.map((t, i) => (
        <text
          key={i}
          x={X(t.at[0])}
          y={Y(t.at[1])}
          fontSize={t.size}
          textAnchor={t.anchor}
          fill="var(--muted)"
          transform={t.rotate ? `rotate(${t.rotate} ${X(t.at[0])} ${Y(t.at[1])})` : undefined}
        >
          {t.text}
        </text>
      ))}
    </svg>
  );
}
