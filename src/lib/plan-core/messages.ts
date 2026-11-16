import type { Issue, IssueCode } from "./validator";

type Locale = "th" | "en";
type Template = (p: Record<string, string | number>) => string;

const T: Record<IssueCode, Record<Locale, Template>> = {
  schema: {
    th: (p) => `โครงสร้างข้อมูลไม่ถูกต้องที่ ${p.path}: ${p.message}`,
    en: (p) => `Invalid plan data at ${p.path}: ${p.message}`,
  },
  duplicate_id: { th: (p) => `รหัสซ้ำ: ${p.id}`, en: (p) => `Duplicate id: ${p.id}` },
  room_not_rectilinear: {
    th: () => "ผนังห้องต้องเป็นแนวตั้ง/แนวนอนเท่านั้น",
    en: () => "Room edges must be horizontal or vertical",
  },
  room_degenerate: { th: () => "ห้องมีพื้นที่เป็นศูนย์", en: () => "Room has (almost) no area" },
  room_overlap: { th: (p) => `ห้องซ้อนทับกัน ${p.area} ตร.ม.`, en: (p) => `Rooms overlap by ${p.area} m²` },
  room_outside_buildable: {
    th: () => "ห้องล้ำเข้าไปในระยะร่น/นอกเขตที่ดิน",
    en: () => "Room extends into the setback or outside the plot",
  },
  room_too_small: {
    th: (p) => `ห้องเล็กเกินไป (${p.area} ตร.ม. ควรไม่น้อยกว่า ${p.min})`,
    en: (p) => `Room too small (${p.area} m², minimum ${p.min})`,
  },
  room_too_narrow: {
    th: (p) => `ห้องแคบเกินไป (${p.width} ม. ควรไม่น้อยกว่า ${p.min})`,
    en: (p) => `Room too narrow (${p.width} m, minimum ${p.min})`,
  },
  opening_bad_host: { th: () => "ประตู/หน้าต่างอ้างอิงห้องหรือผนังที่ไม่มีอยู่", en: () => "Opening refers to a missing room or edge" },
  opening_off_edge: {
    th: (p) => `ประตู/หน้าต่างยาวเกินผนัง (ผนังยาว ${p.edge} ม.)`,
    en: (p) => `Opening runs past the end of its wall (wall is ${p.edge} m)`,
  },
  window_on_interior_wall: { th: () => "หน้าต่างอยู่บนผนังภายใน", en: () => "Window is on an interior wall" },
  room_unreachable: { th: () => "ไม่มีทางเข้าถึงห้องนี้ (ไม่มีประตูเชื่อม)", en: () => "Room cannot be reached (no connecting door)" },
  stair_missing: {
    th: () => "ชั้นนี้ไม่มีบันไดเชื่อมกับชั้นล่าง",
    en: () => "This level has no stair linked to the level below",
  },
  stair_misaligned: { th: () => "ตำแหน่งบันไดไม่ตรงกันระหว่างชั้น", en: () => "Stair position does not match between levels" },
  no_daylight: {
    th: () => "ห้องนี้ไม่มีหน้าต่างหรือช่องเปิดสู่ภายนอก",
    en: () => "Room has no window or opening to the outside",
  },
  bedroom_west: {
    th: () => "ห้องนอนมีผนังรับแดดบ่ายทิศตะวันตก — ควรย้ายหรือเพิ่มชายคา/ระแนงบังแดด",
    en: () => "Bedroom has a west-facing wall (afternoon sun) — move it or add shading",
  },
  wet_not_stacked: {
    th: () => "ห้องน้ำ/ครัวชั้นบนไม่ได้อยู่เหนือห้องน้ำ/ครัวชั้นล่าง — งานท่อจะยาวขึ้น",
    en: () => "Upper wet room is not above a wet room below — longer plumbing runs",
  },
};

export function describeIssue(issue: Issue, locale: Locale): string {
  return T[issue.code][locale](issue.params ?? {});
}

/** Compact English list for feeding validation failures back to the AI. */
export function issuesForPrompt(issues: Issue[]): string {
  return issues
    .map((i) => {
      const where = [i.levelId && `level=${i.levelId}`, i.roomIds?.length && `rooms=${i.roomIds.join(",")}`, i.openingId && `opening=${i.openingId}`]
        .filter(Boolean)
        .join(" ");
      return `- [${i.severity}] ${i.code}${where ? ` (${where})` : ""}: ${describeIssue(i, "en")}`;
    })
    .join("\n");
}
