import {
  type Point,
  type Plan,
  type Site,
  area,
  bbox,
  buildableArea,
  centroid,
  deriveWalls,
  edges,
  outwardNormal,
  pointAlong,
  polygonToSite,
  roomLabel,
  ROOM_TYPE_INFO,
  signedArea,
  toSite,
} from "@/lib/plan-core";

interface Props {
  site: Site;
  plan?: Plan;
  levelIndex?: number;
  locale: "th" | "en";
  /** Room ids to highlight (e.g. those with validation errors). */
  highlight?: string[];
  /** Regulation problems to draw (site coordinates). */
  marks?: { a: Point; b: Point; status: "pass" | "warn" | "fail"; levelId?: string }[];
  className?: string;
}

const PAD = 1.5;

export function SitePlanSvg({ site, plan, levelIndex = 0, locale, highlight = [], marks = [], className }: Props) {
  const ccw = signedArea(site.boundary) >= 0;
  const roadPolys = site.roads.map((r) => {
    const e = edges(site.boundary)[r.edgeIndex];
    if (!e) return null;
    const n0 = outwardNormal(e);
    const n: Point = ccw ? n0 : [-n0[0], -n0[1]];
    const w = Math.min(r.widthM, 8);
    return { poly: [e[0], e[1], [e[1][0] + n[0] * w, e[1][1] + n[1] * w], [e[0][0] + n[0] * w, e[0][1] + n[1] * w]] as Point[], road: r };
  });
  const all = [...site.boundary, ...roadPolys.flatMap((r) => r?.poly ?? [])];
  const bb = bbox(all);
  const W = bb.width + PAD * 2;
  const H = bb.height + PAD * 2;
  const P = (p: Point) => `${(p[0] - bb.minX + PAD).toFixed(3)},${(bb.maxY - p[1] + PAD).toFixed(3)}`;
  const X = (p: Point) => p[0] - bb.minX + PAD;
  const Y = (p: Point) => bb.maxY - p[1] + PAD;
  const pts = (poly: Point[]) => poly.map(P).join(" ");

  const buildable = buildableArea(site);
  const level = plan?.levels[levelIndex];
  const fs = Math.max(0.4, Math.min(W, H) / (plan ? 40 : 28));

  // north arrow: north = +y rotated clockwise by northAngle
  const t = (site.northAngleDeg * Math.PI) / 180;
  const north: Point = [Math.sin(t), Math.cos(t)];
  const arrowC: Point = [W - PAD * 0.9, PAD * 0.9];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" style={{ background: "var(--paper)" }}>
      {roadPolys.map(
        (r, i) =>
          r && (
            <g key={i}>
              <polygon points={pts(r.poly)} fill="var(--road)" />
              <text x={X(centroid(r.poly))} y={Y(centroid(r.poly))} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill="var(--muted)">
                {locale === "th" ? `ถนน ${r.road.widthM} ม.` : `Road ${r.road.widthM} m`}
              </text>
            </g>
          ),
      )}
      <polygon points={pts(site.boundary)} fill="var(--land)" stroke="var(--ink)" strokeWidth={0.08} />
      {buildable.polygon.length > 2 && (
        <polygon points={pts(buildable.polygon)} fill="none" stroke="var(--setback)" strokeWidth={0.06} strokeDasharray="0.4 0.25" />
      )}

      {plan && level && (
        <g>
          {level.rooms.map((room) => {
            const poly = polygonToSite(plan, room.polygon);
            const c = centroid(poly);
            const info = ROOM_TYPE_INFO[room.type];
            const bad = highlight.includes(room.id);
            const label = roomLabel(room, locale);
            // shrink labels to fit narrow rooms (≈0.6 em per glyph)
            const rw = bbox(room.polygon).width;
            const lfs = Math.min(fs * 0.85, (rw * 0.9) / (label.length * 0.6));
            return (
              <g key={room.id}>
                <polygon
                  points={pts(poly)}
                  fill={bad ? "var(--bad-bg)" : info.outdoor ? "var(--outdoor)" : info.wet ? "var(--wet)" : "var(--room)"}
                  stroke={info.outdoor ? "var(--muted)" : "none"}
                  strokeWidth={0.03}
                  strokeDasharray={info.outdoor ? "0.2 0.15" : undefined}
                />
                <text x={X(c)} y={Y(c) - fs * 0.3} fontSize={lfs} textAnchor="middle" fill="var(--ink)">
                  {label}
                </text>
                <text x={X(c)} y={Y(c) + fs * 0.8} fontSize={Math.min(fs * 0.7, lfs)} textAnchor="middle" fill="var(--muted)">
                  {area(room.polygon).toFixed(1)} {locale === "th" ? "ตร.ม." : "m²"}
                </text>
              </g>
            );
          })}
          {deriveWalls(plan, level).map((w) => {
            const a = toSite(plan, w.a);
            const b = toSite(plan, w.b);
            return <line key={w.id} x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} stroke="var(--ink)" strokeWidth={w.thicknessM} strokeLinecap="square" />;
          })}
          {level.openings.map((o) => {
            const room = level.rooms.find((r) => r.id === o.host.roomId);
            const e = room && edges(room.polygon)[o.host.edgeIndex];
            if (!e) return null;
            const a = toSite(plan, pointAlong(e, o.host.offsetM));
            const b = toSite(plan, pointAlong(e, o.host.offsetM + o.widthM));
            const color = o.kind === "window" ? "var(--window)" : o.kind === "opening" ? "var(--paper)" : "var(--door)";
            return (
              <g key={o.id}>
                <line x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} stroke="var(--paper)" strokeWidth={0.22} />
                {o.kind !== "opening" && <line x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} stroke={color} strokeWidth={o.kind === "window" ? 0.08 : 0.12} />}
              </g>
            );
          })}
        </g>
      )}

      {marks
        .filter((m) => !m.levelId || !level || m.levelId === level.id)
        .map((m, i) => (
          <line
            key={`mark-${i}`}
            x1={X(m.a)}
            y1={Y(m.a)}
            x2={X(m.b)}
            y2={Y(m.b)}
            stroke={m.status === "fail" ? "var(--bad)" : "var(--warn)"}
            strokeWidth={0.35}
            strokeOpacity={0.75}
            strokeLinecap="round"
          />
        ))}

      <g transform={`translate(${arrowC[0]} ${arrowC[1]})`}>
        <circle r={0.6} fill="var(--paper)" stroke="var(--muted)" strokeWidth={0.04} />
        <line x1={-north[0] * 0.45} y1={north[1] * 0.45} x2={north[0] * 0.45} y2={-north[1] * 0.45} stroke="var(--ink)" strokeWidth={0.08} />
        <circle cx={north[0] * 0.45} cy={-north[1] * 0.45} r={0.1} fill="var(--setback)" />
        <text x={north[0] * 0.95} y={-north[1] * 0.95} fontSize={0.45} textAnchor="middle" dominantBaseline="middle" fill="var(--ink)" fontWeight={700}>
          N
        </text>
      </g>
    </svg>
  );
}
