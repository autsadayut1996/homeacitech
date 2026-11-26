/**
 * Plan JSON → DXF (AutoCAD R12 / AC1009, ASCII) — opens in every AutoCAD version and most CAD tools.
 *
 * - Units: millimetres (default) or metres. Each floor is drawn side by side in model space,
 *   with the plot, setbacks and road, so floors can be overlaid by moving them onto each other.
 * - Layers follow common AIA-style names (see LAYERS) so an architect can freeze/recolour them.
 * - Non-ASCII text (Thai) is written as \U+XXXX escapes with a TrueType (Tahoma) text style.
 * - Walls are closed outlines with real gaps at openings; doors get leaf + swing arc,
 *   windows three lines, sliding doors two panels. Dimensions are drawn as lines + text.
 */
import {
  type Level,
  type Plan,
  type Point,
  ROOM_TYPE_INFO,
  area,
  bbox,
  buildableArea,
  centroid,
  deriveWalls,
  edges,
  layoutWall,
  outwardNormal,
  roofParts,
  roomLabel,
  elevations,
  section,
  roofPlan,
  mepLayout,
  type MepKind,
  type MepLayout,
  type Elevation,
  signedArea,
  toSite,
  uniqSorted,
  columns,
  fmtLevel,
  furniture,
  openingMarks,
  openingMarkPosition,
  plinthOf,
  roomTag,
  structuralGrid,
} from "@/lib/plan-core";

export const LAYERS = {
  "A-WALL": { color: 7, ltype: "CONTINUOUS", th: "ผนัง" },
  "A-DOOR": { color: 30, ltype: "CONTINUOUS", th: "ประตู" },
  "A-GLAZ": { color: 4, ltype: "CONTINUOUS", th: "หน้าต่าง/กระจก" },
  "A-STRS": { color: 7, ltype: "CONTINUOUS", th: "บันได" },
  "A-AREA": { color: 9, ltype: "CONTINUOUS", th: "ขอบเขตห้อง" },
  "A-OUTD": { color: 8, ltype: "DASHED", th: "พื้นที่ภายนอก (ที่จอดรถ/ระเบียง)" },
  "A-ROOF": { color: 6, ltype: "DASHED", th: "แนวชายคา/หลังคา" },
  "A-TEXT": { color: 7, ltype: "CONTINUOUS", th: "ข้อความ/ชื่อห้อง" },
  "A-DIMS": { color: 8, ltype: "CONTINUOUS", th: "เส้นบอกขนาด" },
  "A-ANNO": { color: 2, ltype: "CONTINUOUS", th: "หัวกระดาษ/ทิศเหนือ" },
  "A-ELEV": { color: 7, ltype: "CONTINUOUS", th: "รูปด้าน: ผนัง หลังคา ระดับดิน" },
  "A-ELEV-OPNG": { color: 4, ltype: "CONTINUOUS", th: "รูปด้าน: ประตู หน้าต่าง ราวกันตก" },
  "A-ELEV-DIMS": { color: 8, ltype: "CONTINUOUS", th: "รูปด้าน/รูปตัด: ระดับชั้น ความสูง" },
  "A-SECT": { color: 7, ltype: "CONTINUOUS", th: "รูปตัด: ส่วนที่ถูกตัด" },
  "A-ROOF-PLAN": { color: 6, ltype: "CONTINUOUS", th: "ผังหลังคา" },
  "E-LITE": { color: 30, ltype: "CONTINUOUS", th: "ไฟฟ้า: ดวงโคม สวิตช์" },
  "E-POWR": { color: 1, ltype: "CONTINUOUS", th: "ไฟฟ้า: เต้ารับ แอร์ ตู้ไฟ มิเตอร์" },
  "P-FIXT": { color: 5, ltype: "CONTINUOUS", th: "สุขาภิบาล: สุขภัณฑ์ ถังบำบัด" },
  "P-SANR": { color: 34, ltype: "CONTINUOUS", th: "สุขาภิบาล: ท่อน้ำทิ้ง (แนวโดยประมาณ)" },
  "P-DOMW": { color: 4, ltype: "DASHED", th: "สุขาภิบาล: ท่อน้ำดี (แนวโดยประมาณ)" },
  "A-FURN": { color: 8, ltype: "CONTINUOUS", th: "เฟอร์นิเจอร์และสุขภัณฑ์ (แสดงประกอบ)" },
  "S-GRID": { color: 1, ltype: "DASHED", th: "เส้นกริดโครงสร้าง" },
  "S-GRID-IDEN": { color: 1, ltype: "CONTINUOUS", th: "หัวกริด (วงกลม/เลข)" },
  "S-COLS": { color: 7, ltype: "CONTINUOUS", th: "เสา (ตำแหน่ง)" },
  "A-TAGS": { color: 3, ltype: "CONTINUOUS", th: "ป้ายห้อง (F/C/ระดับ) รหัสประตู-หน้าต่าง" },
  "C-PROP": { color: 3, ltype: "CONTINUOUS", th: "แนวเขตที่ดิน" },
  "C-SETB": { color: 1, ltype: "DASHED", th: "เส้นระยะร่น" },
  "C-ROAD": { color: 8, ltype: "CONTINUOUS", th: "ถนน" },
} as const;
type Layer = keyof typeof LAYERS;

export interface DxfOptions {
  units?: "mm" | "m";
  locale?: "th" | "en";
  title?: string;
  subtitle?: string;
}

/**
 * Text for a pre-2007 DXF whose $DWGCODEPAGE is ANSI_874: Thai stays as-is (encoded to cp874
 * bytes by `encodeDxf`), other non-ASCII characters become \U+XXXX escapes.
 */
export function dxfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 32 && c < 127) || CP874.has(c)) out += ch;
    else if (c <= 0xffff && c >= 32) out += `\\U+${c.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

/** Windows-874 (TIS-620 + extras): Unicode code point → byte. */
const CP874 = new Map<number, number>([
  [0x20ac, 0x80],
  [0x2026, 0x85],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x00a0, 0xa0],
]);
// Thai block U+0E01–U+0E3A and U+0E3F–U+0E5B map linearly onto 0xA1–0xFB
for (let c = 0x0e01; c <= 0x0e5b; c++) if (c <= 0x0e3a || c >= 0x0e3f) CP874.set(c, c - 0x0e01 + 0xa1);

/** Encode the DXF text produced by `planToDxf` as cp874 bytes (what ANSI_874 readers expect). */
export function encodeDxf(dxf: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of dxf) {
    const c = ch.codePointAt(0)!;
    if (c < 128) bytes.push(c);
    else bytes.push(CP874.get(c) ?? 0x3f); // "?" — cannot happen for text passed through dxfText
  }
  return Uint8Array.from(bytes);
}

class Writer {
  private out: string[] = [];
  min: Point = [Infinity, Infinity];
  max: Point = [-Infinity, -Infinity];
  count = 0;
  constructor(private k: number) {}

  private pair(code: number, value: string | number) {
    this.out.push(String(code), typeof value === "number" ? fmt(value) : value);
  }
  private grow(x: number, y: number) {
    this.min = [Math.min(this.min[0], x), Math.min(this.min[1], y)];
    this.max = [Math.max(this.max[0], x), Math.max(this.max[1], y)];
  }
  private xy(p: Point, cx = 10) {
    const x = p[0] * this.k;
    const y = p[1] * this.k;
    this.grow(x, y);
    this.pair(cx, x);
    this.pair(cx + 10, y);
    this.pair(cx + 20, 0);
  }

  line(layer: Layer, a: Point, b: Point) {
    this.count++;
    this.pair(0, "LINE");
    this.pair(8, layer);
    this.xy(a, 10);
    this.xy(b, 11);
  }

  poly(layer: Layer, pts: Point[], closed = true) {
    this.count++;
    this.pair(0, "POLYLINE");
    this.pair(8, layer);
    this.pair(66, 1);
    this.pair(10, 0);
    this.pair(20, 0);
    this.pair(30, 0);
    this.pair(70, closed ? 1 : 0);
    for (const p of pts) {
      this.pair(0, "VERTEX");
      this.pair(8, layer);
      this.xy(p);
    }
    this.pair(0, "SEQEND");
    this.pair(8, layer);
  }

  /** Arc counter-clockwise from startDeg to endDeg. */
  arc(layer: Layer, c: Point, r: number, startDeg: number, endDeg: number) {
    this.count++;
    this.pair(0, "ARC");
    this.pair(8, layer);
    this.xy(c);
    this.pair(40, r * this.k);
    this.pair(50, startDeg);
    this.pair(51, endDeg);
  }

  /** Filled quadrilateral (R12 SOLID; vertex order 1-2-4-3 as the format requires). */
  solid(layer: Layer, q: [Point, Point, Point, Point]) {
    this.count++;
    this.pair(0, "SOLID");
    this.pair(8, layer);
    this.xy(q[0], 10);
    this.xy(q[1], 11);
    this.xy(q[3], 12);
    this.xy(q[2], 13);
  }

  circle(layer: Layer, c: Point, r: number) {
    this.count++;
    this.pair(0, "CIRCLE");
    this.pair(8, layer);
    this.xy(c);
    this.pair(40, r * this.k);
  }

  /** Text centred (h=centre, v=middle) at p; height in metres. */
  text(layer: Layer, p: Point, height: number, value: string, rotationDeg = 0, align: "center" | "left" = "center") {
    this.count++;
    this.pair(0, "TEXT");
    this.pair(8, layer);
    this.xy(p);
    this.pair(40, height * this.k);
    this.pair(1, dxfText(value));
    if (rotationDeg) this.pair(50, rotationDeg);
    this.pair(7, "THAI");
    if (align === "center") {
      this.pair(72, 1);
      this.xy(p, 11);
      this.pair(73, 2);
    }
  }

  entities() {
    return this.out;
  }
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return (Math.round(v * 1e6) / 1e6).toString();
}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Point, k: number): Point => [a[0] * k, a[1] * k];
const deg = (v: Point) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

/** Draw one floor at offset `off` (site coordinates + offset). */
function drawLevel(w: Writer, plan: Plan, level: Level, li: number, off: Point, locale: "th" | "en", mep: MepLayout) {
  const S = (p: Point): Point => add(toSite(plan, p), off);
  const site = plan.site;
  const ccw = signedArea(site.boundary) >= 0;

  // plot, setbacks, roads
  w.poly("C-PROP", site.boundary.map((p) => add(p, off)));
  const buildable = buildableArea(site).polygon;
  if (buildable.length > 2) w.poly("C-SETB", buildable.map((p) => add(p, off)));
  for (const r of site.roads) {
    const e = edges(site.boundary)[r.edgeIndex];
    if (!e) continue;
    const n0 = outwardNormal(e);
    const n: Point = ccw ? n0 : [-n0[0], -n0[1]];
    const far: [Point, Point] = [add(e[0], mul(n, r.widthM)), add(e[1], mul(n, r.widthM))];
    w.line("C-ROAD", add(far[0], off), add(far[1], off));
    w.text("C-ROAD", add(mul(add(e[0], far[1]), 0.5), off), 0.35, locale === "th" ? `ถนน กว้าง ${r.widthM} ม.` : `Road ${r.widthM} m wide`);
  }

  // rooms: outlines (thin), outdoor dashed, labels
  for (const r of level.rooms) {
    const info = ROOM_TYPE_INFO[r.type];
    const poly = r.polygon.map(S);
    w.poly(info.outdoor ? "A-OUTD" : "A-AREA", poly);
    const c = centroid(poly);
    const b = bbox(r.polygon);
    // fit text to the room width (≈0.55 × height per character)
    const fit = (s: string, max: number) => Math.min(max, (b.width * 0.9) / (s.length * 0.55));
    const name = roomLabel(r, locale);
    const sizeLine = `${area(r.polygon).toFixed(2)} ${locale === "th" ? "ตร.ม." : "m2"} (${b.width.toFixed(2)}x${b.height.toFixed(2)})`;
    const h = fit(name, 0.3);
    w.text("A-TEXT", c, h, name);
    w.text("A-TEXT", add(c, [0, -Math.max(h, 0.15) * 1.6]), fit(sizeLine, 0.2), sizeLine);
    if (r.type === "stair") {
      // treads every 0.25 m across the longer direction
      const alongX = b.width >= b.height;
      const len = alongX ? b.width : b.height;
      for (let d = 0.25; d < len - 0.01; d += 0.25) {
        const a: Point = alongX ? [b.minX + d, b.minY] : [b.minX, b.minY + d];
        const z: Point = alongX ? [b.minX + d, b.maxY] : [b.maxX, b.minY + d];
        w.line("A-STRS", S(a), S(z));
      }
      const m0: Point = alongX ? [b.minX + 0.2, (b.minY + b.maxY) / 2] : [(b.minX + b.maxX) / 2, b.minY + 0.2];
      const m1: Point = alongX ? [b.maxX - 0.2, (b.minY + b.maxY) / 2] : [(b.minX + b.maxX) / 2, b.maxY - 0.2];
      w.line("A-STRS", S(m0), S(m1));
      w.circle("A-STRS", S(m0), 0.05);
    }
  }

  // walls and openings
  for (const wall of deriveWalls(plan, level)) {
    const lay = layoutWall(level, wall);
    const t = wall.thicknessM / 2;
    const P = (along: number, across: number): Point => (lay.horizontal ? [along, lay.fixed + across] : [lay.fixed + across, along]);
    for (const [a, b] of lay.solids) w.poly("A-WALL", [P(a, -t), P(b, -t), P(b, t), P(a, t)].map(S));
    for (const o of lay.openings) {
      const width = o.b - o.a;
      if (o.kind === "window") {
        w.line("A-GLAZ", S(P(o.a, -t)), S(P(o.b, -t)));
        w.line("A-GLAZ", S(P(o.a, 0)), S(P(o.b, 0)));
        w.line("A-GLAZ", S(P(o.a, t)), S(P(o.b, t)));
        w.line("A-GLAZ", S(P(o.a, -t)), S(P(o.a, t)));
        w.line("A-GLAZ", S(P(o.b, -t)), S(P(o.b, t)));
      } else if (o.kind === "sliding_door") {
        const mid = (o.a + o.b) / 2;
        w.line("A-DOOR", S(P(o.a, -t / 3)), S(P(mid + 0.05, -t / 3)));
        w.line("A-DOOR", S(P(mid - 0.05, t / 3)), S(P(o.b, t / 3)));
      } else if (o.kind === "door") {
        // the door opens into its host room: find which side of the wall that room is on
        const host = level.rooms.find((r) => r.id === o.hostRoomId);
        const hc = host ? centroid(host.polygon) : P(o.a, 1);
        const side = Math.sign((lay.horizontal ? hc[1] : hc[0]) - lay.fixed) || 1;
        const hinge = S(P(o.a, side * t));
        const closed = S(P(o.b, side * t));
        const open = add(hinge, mul(sub(S(P(o.a, side * (t + 1))), hinge), width));
        w.line("A-DOOR", hinge, open);
        let a0 = deg(sub(closed, hinge));
        let a1 = deg(sub(open, hinge));
        // ARC runs counter-clockwise: pick the order that gives the 90° sweep
        if ((((a1 - a0) % 360) + 360) % 360 > 180) [a0, a1] = [a1, a0];
        w.arc("A-DOOR", hinge, width, a0, a1);
      }
    }
  }

  // preliminary electrical / sanitary symbols and pipe routes (own layers, can be frozen)
  for (const r of mep.runs.filter((x) => x.levelId === level.id)) w.poly(r.kind === "drain" ? "P-SANR" : "P-DOMW", r.points.map(S), false);
  for (const it of mep.items.filter((x) => x.levelId === level.id)) mepSymbol(w, it.kind, S(it.at));

  // roof overhang outline on the top floor
  if (li === plan.levels.length - 1) {
    for (const p of roofParts(plan)) {
      if (p.kind === "slab") continue;
      const o = p.overhangM;
      w.poly("A-ROOF", ([[p.x0 - o, p.y0 - o], [p.x1 + o, p.y0 - o], [p.x1 + o, p.y1 + o], [p.x0 - o, p.y1 + o]] as Point[]).map(S));
    }
  }

  // chain dimensions below and left of the floor
  const pts = level.rooms.flatMap((r) => r.polygon);
  if (pts.length) {
    const xs = uniqSorted(pts.map((p) => p[0]));
    const ys = uniqSorted(pts.map((p) => p[1]));
    const y0 = ys[0];
    const x0 = xs[0];
    const dim = (a: Point, b: Point, label: string, vertical: boolean) => {
      const A = S(a);
      const B = S(b);
      w.line("A-DIMS", A, B);
      for (const P of [A, B]) w.line("A-DIMS", add(P, [-0.1, -0.1]), add(P, [0.1, 0.1]));
      const m = mul(add(A, B), 0.5);
      w.text("A-DIMS", add(m, vertical ? [-0.18, 0] : [0, 0.18]), 0.2, label, vertical ? 90 : 0);
    };
    xs.slice(0, -1).forEach((x, i) => dim([x, y0 - 1], [xs[i + 1], y0 - 1], (xs[i + 1] - x).toFixed(2), false));
    dim([xs[0], y0 - 1.8], [xs[xs.length - 1], y0 - 1.8], (xs[xs.length - 1] - xs[0]).toFixed(2), false);
    ys.slice(0, -1).forEach((y, i) => dim([x0 - 1, y], [x0 - 1, ys[i + 1]], (ys[i + 1] - y).toFixed(2), true));
    dim([x0 - 1.8, ys[0]], [x0 - 1.8, ys[ys.length - 1]], (ys[ys.length - 1] - ys[0]).toFixed(2), true);
  }

  // furniture and fittings (illustrative)
  for (const sh of furniture(plan, level)) {
    if (sh.kind === "circle") w.circle("A-FURN", S(sh.c), sh.r);
    else w.poly("A-FURN", sh.pts.map(S), sh.closed);
  }

  // structural grid, columns, room tags, door / window marks
  const grid = structuralGrid(plan);
  const gb = grid.bounds;
  const G = 3.2;
  for (const a of grid.x) {
    w.line("S-GRID", S([a.at, gb.minY - G + 0.4]), S([a.at, gb.maxY + G - 0.4]));
    for (const y of [gb.minY - G, gb.maxY + G]) {
      w.circle("S-GRID-IDEN", S([a.at, y]), 0.4);
      w.text("S-GRID-IDEN", S([a.at, y]), 0.35, a.label);
    }
  }
  for (const a of grid.y) {
    w.line("S-GRID", S([gb.minX - G + 0.4, a.at]), S([gb.maxX + G - 0.4, a.at]));
    for (const x of [gb.minX - G, gb.maxX + G]) {
      w.circle("S-GRID-IDEN", S([x, a.at]), 0.4);
      w.text("S-GRID-IDEN", S([x, a.at]), 0.35, a.label);
    }
  }
  for (const c of columns(plan, li, grid)) {
    const q = ([[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]] as Point[]).map((d) => S(add(c, d)));
    w.solid("S-COLS", [q[0], q[1], q[2], q[3]]);
  }
  for (const r of level.rooms) {
    if (r.type === "pool" || r.type === "stair") continue;
    const t = roomTag(plan, level, r);
    const tag = [t.floorCode, fmtLevel(t.floorLevel), ...(t.ceilingCode ? [t.ceilingCode, `+${t.ceilingHeight!.toFixed(2)}`] : [])].join(" | ");
    const c = add(centroid(r.polygon.map(S)), [0, -0.75]);
    const hw = tag.length * 0.06;
    w.poly("A-TAGS", [add(c, [-hw, -0.16]), add(c, [hw, -0.16]), add(c, [hw, 0.16]), add(c, [-hw, 0.16])]);
    w.text("A-TAGS", c, 0.15, tag);
  }
  const marks = openingMarks(plan);
  for (const o of level.openings) {
    const code = marks.codes[o.id];
    const at = code && openingMarkPosition(level, o);
    if (!at) continue;
    w.circle("A-TAGS", S(at), 0.2);
    w.text("A-TAGS", S(at), 0.14, code);
  }

  // floor title and north arrow
  const sb = bbox(site.boundary);
  w.text("A-ANNO", add([sb.minX, sb.maxY + 1.6], off), 0.5, `${level.name[locale]}  (${locale === "th" ? "ระดับพื้น" : "FFL"} ${fmtLevel(level.elevationM + plinthOf(plan))})`, 0, "left");
  const t = (site.northAngleDeg * Math.PI) / 180;
  const north: Point = [Math.sin(t), Math.cos(t)];
  const nc = add([sb.maxX + 2, sb.maxY], off);
  w.circle("A-ANNO", nc, 0.8);
  w.line("A-ANNO", add(nc, mul(north, -0.7)), add(nc, mul(north, 0.7)));
  w.line("A-ANNO", add(nc, mul(north, 0.7)), add(nc, add(mul(north, 0.35), mul([north[1], -north[0]], 0.25))));
  w.line("A-ANNO", add(nc, mul(north, 0.7)), add(nc, add(mul(north, 0.35), mul([-north[1], north[0]], 0.25))));
  w.text("A-ANNO", add(nc, mul(north, 1.2)), 0.4, "N");
}

export function planToDxf(plan: Plan, opts: DxfOptions = {}): string {
  const k = opts.units === "m" ? 1 : 1000;
  const locale = opts.locale ?? "th";
  const w = new Writer(k);
  const sb = bbox(plan.site.boundary);
  const gap = 12; // metres between floors (room for dimensions and the north arrow)
  const mep = mepLayout(plan);
  plan.levels.forEach((level, li) => drawLevel(w, plan, level, li, [li * (sb.width + gap) - sb.minX, -sb.minY], locale, mep));

  // roof plan to the right of the floor plans
  {
    const off: Point = [plan.levels.length * (sb.width + gap) - sb.minX, -sb.minY];
    const S = (p: Point): Point => add(toSite(plan, p), off);
    w.poly("C-PROP", plan.site.boundary.map((p) => add(p, off)));
    const rp = roofPlan(plan);
    for (const l of rp.lines) w.line(l.kind === "wall" ? "A-ROOF" : "A-ROOF-PLAN", S(l.a), S(l.b));
    for (const t of rp.labels) w.text("A-ROOF-PLAN", S(t.at), 0.3, t.text);
    w.text("A-ANNO", add([sb.minX, sb.maxY + 1.6], off), 0.5, locale === "th" ? "ผังหลังคา" : "Roof plan", 0, "left");
  }

  // elevations in a row below the floor plans
  const ELEV_LAYER = { wall: "A-ELEV", roof: "A-ELEV", ground: "A-ELEV", cut: "A-ELEV", opening: "A-ELEV-OPNG", glass: "A-ELEV-OPNG", railing: "A-ELEV-OPNG", level: "A-ELEV-DIMS", dim: "A-ELEV-DIMS" } as const;
  const SIDE_TH = { front: "รูปด้านหน้า", back: "รูปด้านหลัง", left: "รูปด้านซ้าย", right: "รูปด้านขวา" } as const;
  const SIDE_EN = { front: "Front elevation", back: "Rear elevation", left: "Left elevation", right: "Right elevation" } as const;
  const elevTop = -14;
  let ex = 0;
  const drawings: { e: Elevation; label: string }[] = [
    ...elevations(plan).map((e) => ({ e, label: `${locale === "th" ? SIDE_TH[e.side] : SIDE_EN[e.side]} (${e.facing})` })),
    ...(["A", "B"] as const).map((n) => ({ e: section(plan, n, locale), label: locale === "th" ? `รูปตัด ${n}-${n}` : `Section ${n}-${n}` })),
  ];
  drawings.forEach(({ e, label }) => {
    const off: Point = [ex - e.bounds.minU, elevTop - e.bounds.maxZ];
    const P = (p: [number, number]): Point => [p[0] + off[0], p[1] + off[1]];
    for (const f of e.fills ?? []) if (f.length === 4) w.solid("A-SECT", f.map(P) as [Point, Point, Point, Point]);
    for (const l of e.lines) w.line(l.kind === "cut" ? "A-SECT" : ELEV_LAYER[l.kind], P(l.a), P(l.b));
    for (const t of e.texts) w.text("A-ELEV-DIMS", P(t.at), t.size, t.text, t.rotate ? -t.rotate : 0);
    w.text("A-ANNO", P([(e.bounds.minU + e.bounds.maxU) / 2, e.bounds.maxZ + 0.6]), 0.45, label);
    ex += e.bounds.maxU - e.bounds.minU + 4;
  });

  // title block text under the elevations
  const tb: Point = [0, elevTop - 16];
  const lines = [
    opts.title ?? "",
    opts.subtitle ?? "",
    locale === "th"
      ? "แบบร่างเพื่อการขาย — ไม่ใช่แบบก่อสร้าง ต้องตรวจและลงนามโดยสถาปนิก/วิศวกรผู้มีใบอนุญาต"
      : "SALES DRAFT — NOT FOR CONSTRUCTION. Must be checked and signed by a licensed architect/engineer.",
    locale === "th" ? `หน่วย: ${k === 1000 ? "มิลลิเมตร" : "เมตร"}` : `Units: ${k === 1000 ? "millimetres" : "metres"}`,
  ].filter(Boolean);
  lines.forEach((s, i) => w.text("A-ANNO", [tb[0], tb[1] - i * 0.8], i === 0 ? 0.5 : 0.35, s, 0, "left"));

  const head: string[] = [];
  const p = (c: number, v: string | number) => head.push(String(c), typeof v === "number" ? fmt(v) : v);
  p(0, "SECTION");
  p(2, "HEADER");
  p(9, "$ACADVER");
  p(1, "AC1009");
  p(9, "$DWGCODEPAGE");
  p(3, "ANSI_874");
  p(9, "$INSBASE");
  p(10, 0);
  p(20, 0);
  p(30, 0);
  p(9, "$EXTMIN");
  p(10, Number.isFinite(w.min[0]) ? w.min[0] : 0);
  p(20, Number.isFinite(w.min[1]) ? w.min[1] : 0);
  p(30, 0);
  p(9, "$EXTMAX");
  p(10, Number.isFinite(w.max[0]) ? w.max[0] : 0);
  p(20, Number.isFinite(w.max[1]) ? w.max[1] : 0);
  p(30, 0);
  p(9, "$LTSCALE");
  p(40, k === 1000 ? 100 : 0.1);
  p(0, "ENDSEC");

  p(0, "SECTION");
  p(2, "TABLES");
  // line types
  p(0, "TABLE");
  p(2, "LTYPE");
  p(70, 2);
  p(0, "LTYPE");
  p(2, "CONTINUOUS");
  p(70, 0);
  p(3, "Solid line");
  p(72, 65);
  p(73, 0);
  p(40, 0);
  p(0, "LTYPE");
  p(2, "DASHED");
  p(70, 0);
  p(3, "Dashed __ __ __");
  p(72, 65);
  p(73, 2);
  p(40, 9.525);
  p(49, 6.35);
  p(49, -3.175);
  p(0, "ENDTAB");
  // layers
  const names = Object.keys(LAYERS) as Layer[];
  p(0, "TABLE");
  p(2, "LAYER");
  p(70, names.length + 1);
  p(0, "LAYER");
  p(2, "0");
  p(70, 0);
  p(62, 7);
  p(6, "CONTINUOUS");
  for (const n of names) {
    p(0, "LAYER");
    p(2, n);
    p(70, 0);
    p(62, LAYERS[n].color);
    p(6, LAYERS[n].ltype);
  }
  p(0, "ENDTAB");
  // text style with a TrueType font that has Thai glyphs
  p(0, "TABLE");
  p(2, "STYLE");
  p(70, 2);
  p(0, "STYLE");
  p(2, "STANDARD");
  p(70, 0);
  p(40, 0);
  p(41, 1);
  p(50, 0);
  p(71, 0);
  p(42, 2.5);
  p(3, "txt");
  p(4, "");
  p(0, "STYLE");
  p(2, "THAI");
  p(70, 0);
  p(40, 0);
  p(41, 1);
  p(50, 0);
  p(71, 0);
  p(42, 2.5);
  p(3, "tahoma.ttf");
  p(4, "");
  p(0, "ENDTAB");
  p(0, "ENDSEC");

  p(0, "SECTION");
  p(2, "ENTITIES");
  const tail = ["0", "ENDSEC", "0", "EOF"];
  return [...head, ...w.entities(), ...tail].join("\r\n") + "\r\n";
}

const MEP_TEXT: Record<MepKind, string> = {
  light: "", switch: "S", socket: "P", ac: "AC", heater: "WH", db: "DB", meter: "kWh",
  wc: "WC", basin: "LAV", shower: "SH", sink: "SINK", washer: "W", floor_drain: "FD", riser: "RS",
  septic: "ST", grease: "GT", water_meter: "WMT", tank_pump: "WT+P",
};
const ELECTRIC = new Set<MepKind>(["light", "switch", "socket", "ac", "heater", "db", "meter"]);

/** Simple CAD symbol: circle or box with an abbreviation (lights: circle with a cross). */
function mepSymbol(w: Writer, kind: MepKind, c: Point) {
  const layer: Layer = kind === "light" || kind === "switch" ? "E-LITE" : ELECTRIC.has(kind) ? "E-POWR" : "P-FIXT";
  const r = kind === "septic" ? 0.6 : kind === "tank_pump" ? 0.5 : kind === "light" ? 0.17 : kind === "switch" || kind === "riser" ? 0.09 : 0.15;
  if (kind === "light") {
    w.circle(layer, c, r);
    w.line(layer, add(c, [-0.12, -0.12]), add(c, [0.12, 0.12]));
    w.line(layer, add(c, [-0.12, 0.12]), add(c, [0.12, -0.12]));
    return;
  }
  const box = kind === "ac" || kind === "db" || kind === "sink" || kind === "basin" || kind === "shower" || kind === "washer" || kind === "grease";
  if (box) {
    const hw = kind === "ac" || kind === "sink" ? 0.4 : kind === "shower" ? 0.4 : 0.28;
    const hh = kind === "ac" ? 0.13 : kind === "shower" ? 0.4 : 0.22;
    w.poly(layer, [add(c, [-hw, -hh]), add(c, [hw, -hh]), add(c, [hw, hh]), add(c, [-hw, hh])]);
  } else w.circle(layer, c, r);
  const label = MEP_TEXT[kind];
  if (label) w.text(layer, c, Math.min(0.18, r * 1.1), label);
}
