/**
 * Building specification (รายการวัสดุประกอบอาคาร) printed with quotations.
 * Categories and items are company content, editable in Settings → Company & documents.
 * An item may be linked to a material slot: its description then comes from the material the
 * customer chose (packages / Materials & price), so the quotation always matches the price.
 */
import { z } from "zod";
import { SLOTS, type Slot } from "@/lib/pricing/materials";

export const SpecItemSchema = z.object({
  th: z.string(),
  en: z.string().default(""),
  specTh: z.string().default(""),
  specEn: z.string().default(""),
  slot: z.enum(SLOTS).optional(),
});
export const SpecSectionSchema = z.object({ titleTh: z.string().min(1), titleEn: z.string().default(""), items: z.array(SpecItemSchema) });
export const SpecTemplateSchema = z.array(SpecSectionSchema);
export type SpecItem = z.infer<typeof SpecItemSchema>;
export type SpecSection = z.infer<typeof SpecSectionSchema>;

const i = (th: string, en: string, specTh: string, specEn: string, slot?: Slot): SpecItem => ({ th, en, specTh, specEn, ...(slot ? { slot } : {}) });

/** Starting template (structure of a typical Thai home-builder specification; values are samples). */
export const DEFAULT_SPEC: SpecSection[] = [
  {
    titleTh: "1. โครงสร้าง",
    titleEn: "1. Structure",
    items: [
      i("เสาเข็ม", "Piles", "เสาเข็มคอนกรีตอัดแรง ขนาดและความยาวตามวิศวกรออกแบบ ตามผลสำรวจดิน", "Precast prestressed concrete piles, size and length by the structural engineer per soil investigation"),
      i("ฐานราก เสา และคาน", "Footings, columns and beams", "คอนกรีตเสริมเหล็กหล่อในที่ ขนาดตามวิศวกรออกแบบ", "Cast-in-place reinforced concrete, sizes by the structural engineer"),
      i("พื้นชั้นล่าง / พื้นชั้นบน", "Ground and upper floors", "พื้นสำเร็จรูปคอนกรีตอัดแรงท้องเรียบ พร้อมเททับหน้า", "Precast prestressed plank slabs with cast-in-place topping"),
      i("พื้นห้องน้ำ / ระเบียง", "Bathroom and balcony floors", "คอนกรีตเสริมเหล็กหล่อในที่ ผสมน้ำยากันซึม", "Cast-in-place reinforced concrete with waterproofing admixture"),
      i("คอนกรีตโครงสร้าง", "Structural concrete", "ปูนซีเมนต์ปอร์ตแลนด์ประเภท 1 กำลังอัด 240 ksc (cube) มาตรฐาน มอก.", "Portland cement type 1, 240 ksc (cube), TIS standard"),
      i("เหล็กเสริม", "Reinforcement", "เหล็กข้ออ้อย SD40 และเหล็กเส้นกลม SR24 มาตรฐาน มอก.", "Deformed bars SD40 and round bars SR24, TIS standard"),
    ],
  },
  {
    titleTh: "2. หลังคา",
    titleEn: "2. Roof",
    items: [
      i("โครงหลังคา", "Roof structure", "โครงหลังคาเหล็กชุบกันสนิม ขนาดตามวิศวกรออกแบบ", "Galvanised steel roof structure sized by the engineer"),
      i("วัสดุมุงหลังคา", "Roof covering", "", "", "roof"),
      i("ฉนวนกันความร้อน", "Heat insulation", "แผ่นสะท้อนความร้อนอลูมิเนียมฟอยล์ใต้หลังคา (เฉพาะตัวบ้าน)", "Aluminium-foil heat reflective sheet under the main roof"),
      i("เชิงชาย", "Fascia", "ไม้ไฟเบอร์ซีเมนต์ ขนาด 1\" x 8\" ทาสี", "Fibre-cement board 1\" x 8\", painted"),
    ],
  },
  {
    titleTh: "3. วัสดุปูพื้น",
    titleEn: "3. Flooring",
    items: [
      i("ห้องรับแขก ห้องนั่งเล่น ห้องนอน ห้องทำงาน", "Living, bedrooms, study", "", "", "floor"),
      i("ห้องน้ำ ระเบียง ครัว", "Bathrooms, balconies, kitchen", "กระเบื้องเซรามิก ผิวกันลื่น ราคาวัสดุไม่เกิน 300 บาท/ตร.ม.", "Anti-slip ceramic tiles, material up to 300 THB/m²"),
      i("ซักล้าง ที่จอดรถ (บนดิน)", "Laundry yard, carport (on ground)", "คอนกรีตขัดหยาบ", "Broom-finish concrete"),
      i("บัวผนัง", "Skirting", "บัวไม้ลามิเนต / PVC ขนาด 1\" x 4\"", "Laminate / PVC skirting 1\" x 4\""),
    ],
  },
  {
    titleTh: "4. ผนัง",
    titleEn: "4. Walls",
    items: [
      i("ผนังภายนอกและภายใน", "External and internal walls", "ก่ออิฐมวลเบา หนา 7.5 ซม. ฉาบเรียบ พร้อมตาข่ายกันร้าว", "7.5 cm lightweight concrete blocks, smooth plaster with anti-crack mesh"),
      i("ผนังห้องน้ำ", "Bathroom walls", "กระเบื้องเซรามิกเกรด A ปูสูงจรดฝ้า ราคาวัสดุไม่เกิน 300 บาท/ตร.ม.", "Grade A ceramic wall tiles to ceiling, material up to 300 THB/m²"),
    ],
  },
  {
    titleTh: "5. ฝ้าเพดาน",
    titleEn: "5. Ceilings",
    items: [
      i("ภายใน", "Interior", "", "", "ceiling"),
      i("ห้องน้ำ", "Bathrooms", "ยิปซัมบอร์ดชนิดกันชื้น หนา 9 มม. โครงเคร่าชุบสังกะสี ทาสีขาว", "9 mm moisture-resistant gypsum board on galvanised frame, painted white"),
      i("ภายนอก (ชายคา ใต้ระเบียง ที่จอดรถ)", "Exterior (eaves, under balconies, carport)", "แผ่นไฟเบอร์ซีเมนต์ / ฝ้าระแนง พร้อมตาข่ายกันแมลง", "Fibre-cement board / slatted ceiling with insect mesh"),
    ],
  },
  {
    titleTh: "6. บันได",
    titleEn: "6. Stairs",
    items: [
      i("โครงสร้างบันได", "Stair structure", "คอนกรีตเสริมเหล็กหล่อในที่", "Cast-in-place reinforced concrete"),
      i("ลูกนอน ลูกตั้ง ชานพัก", "Treads, risers, landing", "ไม้ลามิเนต / กระเบื้อง ตามแบบ", "Laminate timber / tiles as drawn"),
      i("ราวบันได", "Balustrade", "ลูกกรงสแตนเลส ลวดลายมาตรฐาน", "Stainless steel balustrade, standard pattern"),
    ],
  },
  {
    titleTh: "7. วงกบ",
    titleEn: "7. Frames",
    items: [
      i("วงกบประตูและหน้าต่างภายนอก", "External door and window frames", "อลูมิเนียมอบสี หนา 1.2 มม.", "Powder-coated aluminium, 1.2 mm"),
      i("วงกบประตูภายใน", "Internal door frames", "ไม้เนื้อแข็ง ขนาด 2\" x 4\" ทาสี", "Hardwood 2\" x 4\", painted"),
      i("วงกบประตูห้องน้ำ", "Bathroom door frames", "UPVC / ไม้เนื้อแข็ง ขนาด 2\" x 5\"", "UPVC / hardwood 2\" x 5\""),
    ],
  },
  {
    titleTh: "8. บานประตูและหน้าต่าง",
    titleEn: "8. Doors and windows",
    items: [
      i("ประตูภายใน (ห้องนอน ห้องทำงาน)", "Internal doors (bedrooms, study)", "", "", "door"),
      i("ประตูห้องน้ำ", "Bathroom doors", "บานประตู UPVC มาตรฐาน ขนาด 0.70 x 2.00 ม.", "Standard UPVC door 0.70 x 2.00 m"),
      i("หน้าต่างและประตูกระจก", "Windows and glazed doors", "", "", "window"),
    ],
  },
  {
    titleTh: "9. อุปกรณ์ประตูและหน้าต่าง",
    titleEn: "9. Ironmongery",
    items: [
      i("ลูกบิดประตูทั่วไป / ห้องน้ำ", "Door knobs (general / bathroom)", "ลูกบิดสแตนเลส ราคาไม่เกิน 310 บาท/ชุด", "Stainless steel knob sets, up to 310 THB/set"),
      i("บานพับ กลอน กันชน", "Hinges, bolts, door stops", "สแตนเลส มาตรฐาน", "Standard stainless steel"),
    ],
  },
  {
    titleTh: "10. สุขภัณฑ์",
    titleEn: "10. Sanitary ware",
    items: [
      i("ชุดสุขภัณฑ์ห้องน้ำ (ชักโครก อ่างล้างหน้า ฝักบัว สายฉีด อุปกรณ์)", "Bathroom set (WC, basin, shower, spray, accessories)", "", "", "sanitary"),
      i("กระจกเงา", "Mirror", "กระจกเงาเปลือย สูง 0.80 ม. ยาวตามเคาน์เตอร์", "Frameless mirror 0.80 m high, counter length"),
      i("ตะแกรงกันกลิ่น", "Floor drains", "ตะแกรงดักกลิ่นสแตนเลส", "Stainless steel anti-odour floor drains"),
    ],
  },
  {
    titleTh: "11. ระบบไฟฟ้า",
    titleEn: "11. Electrical",
    items: [
      i("มิเตอร์ไฟฟ้า", "Electricity meter", "ขนาด 30(100)A 1 เฟส หรือตามการไฟฟ้า", "30(100)A single-phase or as required by the utility"),
      i("ตู้ควบคุมไฟฟ้า", "Consumer unit", "ตู้ควบคุมพร้อมเบรกเกอร์กันดูด (RCBO)", "Consumer unit with RCBO"),
      i("การเดินสายไฟ", "Wiring", "สาย THW / VAF มาตรฐาน มอก. เดินในท่อร้อยสาย", "THW / VAF cables (TIS) in conduit"),
      i("สวิตช์ ปลั๊ก", "Switches and sockets", "ชนิดมีกราวด์ ตามแบบ", "Earthed type, as drawn"),
      i("ดวงโคม", "Light fittings", "ดวงโคม LED ดาวน์ไลต์ภายใน ภายนอกตามแบบ", "LED downlights inside, exterior fittings as drawn"),
      i("สายแอร์ น้ำอุ่น ปั๊มน้ำ", "Circuits for AC, water heaters, pump", "เดินสายพร้อมเบรกเกอร์แยกวงจร", "Dedicated circuits with breakers"),
    ],
  },
  {
    titleTh: "12. ระบบประปาและสุขาภิบาล",
    titleEn: "12. Plumbing",
    items: [
      i("ท่อน้ำดี", "Water supply pipes", "ท่อ PVC ชั้น 13.5", "PVC class 13.5"),
      i("ท่อน้ำทิ้ง ท่อส้วม ท่ออากาศ", "Waste, soil and vent pipes", "ท่อ PVC ชั้น 8.5", "PVC class 8.5"),
    ],
  },
  {
    titleTh: "13. ระบบบำบัดน้ำเสีย",
    titleEn: "13. Waste water treatment",
    items: [
      i("ถังบำบัดน้ำเสีย", "Septic tank", "ถังบำบัดสำเร็จรูป ขนาดตามจำนวนผู้อยู่อาศัย", "Prefabricated septic tank sized for the occupants"),
      i("บ่อพัก บ่อดักไขมัน", "Inspection chambers, grease trap", "บ่อพักคอนกรีต / ถังดักไขมันสำเร็จรูป", "Concrete inspection chambers / prefabricated grease trap"),
    ],
  },
  {
    titleTh: "14. ราวกันตก",
    titleEn: "14. Railings",
    items: [i("ราวระเบียง ราวกันตก", "Balcony and safety railings", "สแตนเลส / เหล็กทาสี ตามแบบ", "Stainless steel / painted steel as drawn")],
  },
  {
    titleTh: "15. ระบบป้องกันปลวก",
    titleEn: "15. Termite protection",
    items: [i("ป้องกันปลวก", "Termite control", "ระบบอัดน้ำยาใต้พื้น พร้อมรับประกัน 3 ปี", "Under-floor injection system with 3-year warranty")],
  },
  {
    titleTh: "16. งานสี",
    titleEn: "16. Painting",
    items: [
      i("สีภายนอก", "Exterior paint", "", "", "exterior_wall"),
      i("สีภายใน", "Interior paint", "", "", "interior_wall"),
    ],
  },
  {
    titleTh: "17. ความสูง",
    titleEn: "17. Heights",
    items: [
      i("ระดับพื้นชั้น 1", "Ground floor level", "+0.50 ม. จากระดับถนน/ดินเดิม (ตามแบบ)", "+0.50 m above road / existing ground (as drawn)"),
      i("ความสูงฝ้าภายใน", "Interior ceiling height", "2.80 ม. (ห้องน้ำ 2.40 ม.)", "2.80 m (bathrooms 2.40 m)"),
    ],
  },
  {
    titleTh: "18. ชุดครัว",
    titleEn: "18. Kitchen",
    items: [i("ชุดครัวบิวท์อิน", "Built-in kitchen", "", "", "kitchen")],
  },
];

export interface ResolvedSpecItem {
  th: string;
  en: string;
  specTh: string;
  specEn: string;
}

/** Fill linked items with the chosen materials. */
export function resolveSpec(template: SpecSection[], chosen: Partial<Record<Slot, { nameTh: string; nameEn: string }>>) {
  return template.map((sec) => ({
    titleTh: sec.titleTh,
    titleEn: sec.titleEn,
    items: sec.items.map<ResolvedSpecItem>((it) => {
      const m = it.slot ? chosen[it.slot] : undefined;
      const join = (a: string | undefined, b: string) => [a, b].filter((x) => x && x.trim()).join(" — ");
      return { th: it.th, en: it.en, specTh: m ? join(m.nameTh, it.specTh) : it.specTh, specEn: m ? join(m.nameEn, it.specEn) : it.specEn };
    }),
  }));
}
