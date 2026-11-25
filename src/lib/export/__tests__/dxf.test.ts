import { describe, expect, it } from "vitest";
import { sampleTwoStoreyPlan } from "@/lib/plan-core/samples";
import { LAYERS, dxfText, encodeDxf, planToDxf } from "../dxf";

/** Minimal DXF reader: group-code/value pairs → entities of the ENTITIES section. */
function entities(dxf: string) {
  const lines = dxf.split("\r\n");
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1]]);
  const start = pairs.findIndex(([c, v], i) => c === 2 && v === "ENTITIES" && pairs[i - 1][1] === "SECTION");
  const out: { type: string; codes: [number, string][] }[] = [];
  for (let i = start + 1; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0 && v === "ENDSEC") break;
    if (c === 0) out.push({ type: v, codes: [] });
    else out[out.length - 1].codes.push([c, v]);
  }
  return { pairs, out };
}

describe("DXF export", () => {
  const dxf = planToDxf(sampleTwoStoreyPlan(), { title: "P-2026-0001 บ้านทดสอบ" });
  const { pairs, out } = entities(dxf);
  const layerOf = (e: (typeof out)[number]) => e.codes.find(([c]) => c === 8)?.[1];

  it("is a well-formed R12 file with all layers declared", () => {
    expect(dxf.startsWith("0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009")).toBe(true);
    expect(dxf.trimEnd().endsWith("0\r\nEOF")).toBe(true);
    expect(pairs.every(([c]) => Number.isInteger(c))).toBe(true);
    const declared = pairs.filter(([c], i) => c === 2 && pairs[i - 1][1] === "LAYER").map(([, v]) => v);
    for (const l of Object.keys(LAYERS)) expect(declared).toContain(l);
    // every entity sits on a declared layer
    const used = new Set(out.map(layerOf).filter(Boolean));
    for (const l of used) expect(declared).toContain(l);
  });

  it("draws walls, one swing arc per door, windows and text on their layers", () => {
    const count = (type: string, layer?: string) => out.filter((e) => e.type === type && (!layer || layerOf(e) === layer)).length;
    expect(count("ARC", "A-DOOR")).toBe(15); // 15 hinged doors in the sample
    expect(count("POLYLINE", "A-WALL")).toBeGreaterThan(40);
    expect(count("LINE", "A-GLAZ")).toBe(12 * 5); // 3 parallel lines + 2 jambs per window
    expect(count("POLYLINE", "C-PROP")).toBe(3); // plot outline on each floor drawing + the roof plan
    expect(count("TEXT", "A-TEXT")).toBe(21 * 2); // name + size per room
    // POLYLINEs are terminated
    expect(out.filter((e) => e.type === "POLYLINE").length).toBe(out.filter((e) => e.type === "SEQEND").length);
  });

  it("writes millimetres by default and metres on request", () => {
    const plot = out.find((e) => e.type === "TEXT" && layerOf(e) === "A-ANNO")!;
    expect(plot).toBeTruthy();
    const xs = (s: string) => entities(s).out.flatMap((e) => e.codes.filter(([c]) => c === 10).map(([, v]) => Number(v)));
    const mm = Math.max(...xs(dxf));
    const m = Math.max(...xs(planToDxf(sampleTwoStoreyPlan(), { units: "m" })));
    expect(mm).toBeGreaterThan(30000);
    expect(mm / m).toBeCloseTo(1000, 3);
  });

  it("keeps Thai for cp874 and escapes other non-ASCII text", () => {
    expect(dxfText("ห้องนอน 1")).toBe("ห้องนอน 1");
    expect(dxfText("m² ✓")).toBe("m\\U+00B2 \\U+2713");
    const bytes = encodeDxf("ก ฿ ๛ A");
    expect(Array.from(bytes)).toEqual([0xa1, 0x20, 0xdf, 0x20, 0xfb, 0x20, 0x41]);
    // the whole file encodes without substitutions
    expect(Array.from(encodeDxf(dxf)).includes(0x3f) && !dxf.includes("?")).toBe(false);
  });

  it("adds four elevations on their own layers", () => {
    const elevTitles = out.filter((e) => e.type === "TEXT" && layerOf(e) === "A-ANNO" && /รูปด้าน/.test(e.codes.find(([c]) => c === 1)?.[1] ?? ""));
    expect(elevTitles).toHaveLength(4);
    expect(out.filter((e) => layerOf(e) === "A-ELEV").length).toBeGreaterThan(40);
    expect(out.filter((e) => layerOf(e) === "A-ELEV-OPNG").length).toBeGreaterThan(40);
  });

  it("adds sections, the roof plan and preliminary MEP layers", () => {
    const on = (layer: string, type?: string) => out.filter((e) => layerOf(e) === layer && (!type || e.type === type)).length;
    expect(on("A-SECT", "SOLID")).toBeGreaterThan(6); // cut walls and slabs
    expect(on("A-ROOF-PLAN")).toBeGreaterThan(8);
    expect(on("E-LITE")).toBeGreaterThan(20);
    expect(on("E-POWR")).toBeGreaterThan(20);
    expect(on("P-FIXT")).toBeGreaterThan(10);
    expect(on("P-SANR", "POLYLINE")).toBeGreaterThan(5);
    const titles = out.filter((e) => e.type === "TEXT" && layerOf(e) === "A-ANNO").map((e) => e.codes.find(([c]) => c === 1)?.[1]);
    expect(titles).toContain("รูปตัด A-A");
    expect(titles).toContain("ผังหลังคา");
  });

  it("includes the not-for-construction note", () => {
    expect(dxf).toContain("ไม่ใช่แบบก่อสร้าง");
  });
});
