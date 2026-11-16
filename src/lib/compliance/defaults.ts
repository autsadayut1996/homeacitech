import type { RuleData } from "./rules";

const VERIFY_TH = "ค่าเริ่มต้นเพื่อการตรวจเบื้องต้น — ต้องให้สถาปนิกผู้มีใบอนุญาตยืนยันก่อนใช้งานจริง";

/**
 * Default rules. Values are starting points taken from the Ministerial Regulations under the
 * Building Control Act B.E. 2522 as commonly applied; every rule ships UNVERIFIED and the
 * article numbers / values must be confirmed by a licensed architect before production use.
 */
export const NATIONAL_RULES: RuleData[] = [
  {
    code: "OPENING_BOUNDARY",
    type: "opening_to_boundary",
    titleTh: "ระยะช่องเปิด/ระเบียงห่างแนวเขตที่ดิน",
    titleEn: "Openings & balconies distance from plot boundary",
    params: { heightThresholdM: 9, minUnderM: 2, minOverM: 3, blankWallMinM: 0.5, roadSide: "warn" },
    sourceRef: `กฎกระทรวงฉบับที่ 55 (พ.ศ. 2543) ออกตามความใน พ.ร.บ.ควบคุมอาคาร พ.ศ. 2522 — ข้อ 50 (ช่องเปิดห่างแนวเขต 2 ม. สำหรับอาคารสูงไม่เกิน 9 ม., 3 ม. สำหรับอาคารสูงเกิน 9 ม.; ผนังทึบห่าง 0.50 ม. หรือชิดแนวเขตเมื่อได้รับความยินยอม). ${VERIFY_TH}`,
    verified: false,
  },
  {
    code: "ROAD_CENTERLINE_LT6",
    type: "setback_road_centerline",
    titleTh: "อาคารติดถนนสาธารณะกว้างน้อยกว่า 6 ม. ต้องร่นจากกึ่งกลางถนน",
    titleEn: "Setback from the centreline of public roads narrower than 6 m",
    params: { roadWidthBelowM: 6, minFromCenterlineM: 3 },
    sourceRef: `กฎกระทรวงฉบับที่ 55 (พ.ศ. 2543) — ข้อ 41. ${VERIFY_TH}`,
    verified: false,
  },
  {
    code: "ROAD_FRACTION",
    type: "setback_road_fraction",
    titleTh: "อาคารบางประเภท ร่นจากแนวเขตถนน 1/10 ของความกว้างถนน",
    titleEn: "Certain building types: setback 1/10 of the road width",
    params: { appliesTo: ["commercial", "home_office"], roadWidthMinM: 6, roadWidthMaxM: 20, fraction: 0.1, overMaxDistanceM: 6 },
    sourceRef: `กฎกระทรวงฉบับที่ 55 (พ.ศ. 2543) — ข้อ 42 (ใช้กับอาคารพาณิชย์และอาคารบางประเภท ไม่ใช่บ้านเดี่ยว). ${VERIFY_TH}`,
    verified: false,
  },
  {
    code: "HEIGHT_ROAD",
    type: "height_vs_road",
    titleTh: "ความสูงอาคารไม่เกิน 2 เท่าของระยะถึงฝั่งตรงข้ามถนน",
    titleEn: "Height ≤ 2× the distance to the far side of the road",
    params: { factor: 2 },
    sourceRef: `กฎกระทรวงฉบับที่ 55 (พ.ศ. 2543) — ข้อ 44. ความสูงวัดถึงยอดผนังชั้นสูงสุด (หลังคาจั่ว/ปั้นหยา). ${VERIFY_TH}`,
    verified: false,
  },
  {
    code: "HIGH_RISE",
    type: "max_height",
    titleTh: "อาคารสูงเกิน 23 ม. เป็นอาคารสูง (มีข้อกำหนดเพิ่ม)",
    titleEn: "Buildings over 23 m are high-rise (extra requirements)",
    params: { maxM: 23, severity: "warn" },
    sourceRef: `พ.ร.บ.ควบคุมอาคาร พ.ศ. 2522 (นิยามอาคารสูง) และกฎกระทรวงฉบับที่ 33 (พ.ศ. 2535). ${VERIFY_TH}`,
    verified: false,
  },
  {
    code: "PARKING_COMMERCIAL",
    type: "parking_min",
    titleTh: "ที่จอดรถขั้นต่ำ (อาคารพาณิชย์/สำนักงาน)",
    titleEn: "Minimum parking (commercial / office)",
    params: { appliesTo: ["commercial", "home_office"], minFloorAreaM2: 300, m2PerSpace: 120 },
    sourceRef: `กฎกระทรวงฉบับที่ 7 (พ.ศ. 2517) ว่าด้วยที่จอดรถ — ค่าตัวอย่าง ต้องตรวจสอบประเภทอาคารและอัตราที่ใช้จริง. ${VERIFY_TH}`,
    verified: false,
  },
];

export const BANGKOK_RULES: RuleData[] = [
  ...NATIONAL_RULES,
  {
    code: "BKK_FAR_OSR",
    type: "far_osr",
    titleTh: "FAR / OSR ตามประเภทที่ดิน (สีผังเมืองรวม กทม.)",
    titleEn: "FAR / OSR by land-use zone (Bangkok comprehensive plan)",
    // Intentionally empty: enter the values of the comprehensive plan currently in force.
    params: { zones: {} },
    sourceRef: `กฎกระทรวงให้ใช้บังคับผังเมืองรวมกรุงเทพมหานคร (ฉบับที่บังคับใช้ปัจจุบัน) — กรอกค่า FAR/OSR ของแต่ละประเภทที่ดินในหน้าตั้งค่า. ${VERIFY_TH}`,
    verified: false,
  },
];
