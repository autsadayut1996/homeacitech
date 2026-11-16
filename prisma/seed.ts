/* Seed data so the app is usable immediately. Re-runnable: wipes and recreates sample rows. */
import { PrismaClient, Prisma } from "@prisma/client";
import { sampleTwoStoreyPlan } from "../src/lib/plan-core/samples";
import { computeMetrics } from "../src/lib/plan-core/metrics";
import { estimate, type CatalogMaterial } from "../src/lib/pricing/materials";

const db = new PrismaClient();

const UNVERIFIED = "ค่าเริ่มต้นเพื่อการตรวจเบื้องต้น — ต้องให้สถาปนิกผู้มีใบอนุญาตยืนยันก่อนใช้งานจริง";

async function main() {
  await db.quotation.deleteMany();
  await db.approval.deleteMany();
  await db.reviewComment.deleteMany();
  await db.aiGeneration.deleteMany();
  await db.designVersion.deleteMany();
  await db.brief.deleteMany();
  await db.project.deleteMany();
  await db.customer.deleteMany();
  await db.rule.deleteMany();
  await db.ruleSet.deleteMany();
  await db.jurisdiction.deleteMany();
  await db.priceItem.deleteMany();
  await db.priceListVersion.deleteMany();
  await db.material.deleteMany();

  await db.companySettings.upsert({
    where: { id: "default" },
    create: { nameTh: "บริษัท ตัวอย่าง รับสร้างบ้าน จำกัด", nameEn: "Sample Home Builder Co., Ltd." },
    update: {},
  });

  // ---- Regulations (data — the evaluator comes in M7) ----
  const bkk = await db.jurisdiction.create({ data: { code: "TH-BKK", nameTh: "กรุงเทพมหานคร", nameEn: "Bangkok" } });
  await db.jurisdiction.create({ data: { code: "TH-DEFAULT", nameTh: "ต่างจังหวัด (ค่าเริ่มต้นตามกฎกระทรวง)", nameEn: "Other provinces (ministerial-regulation defaults)" } });
  await db.ruleSet.create({
    data: {
      jurisdiction: { connect: { id: bkk.id } },
      version: 1,
      rules: {
        create: [
          {
            code: "OPENING_BOUNDARY",
            type: "opening_to_boundary",
            titleTh: "ระยะช่องเปิด (หน้าต่าง ประตู ช่องระบายอากาศ ระเบียง) ห่างแนวเขตที่ดิน",
            titleEn: "Openings (windows, doors, vents, balconies) distance from plot boundary",
            params: { underHeightM: 9, minDistanceUnderM: 2, minDistanceOverM: 3, blankWallMinM: 0.5 },
            sourceRef: "กฎกระทรวงฉบับที่ 55 (พ.ศ. 2543) ออกตามความใน พ.ร.บ.ควบคุมอาคาร พ.ศ. 2522 — ข้อ 50. " + UNVERIFIED,
          },
          {
            code: "ROAD_CENTERLINE_LT6",
            type: "setback_road",
            titleTh: "อาคารติดถนนสาธารณะกว้างน้อยกว่า 6 ม. ต้องร่นจากกึ่งกลางถนน",
            titleEn: "Buildings on public roads narrower than 6 m must set back from the road centreline",
            params: { roadWidthLtM: 6, minFromCenterlineM: 3 },
            sourceRef: "กฎกระทรวงฉบับที่ 55 (พ.ศ. 2543) — ข้อ 41. " + UNVERIFIED,
          },
          {
            code: "FAR_OSR_ZONE",
            type: "far_osr",
            titleTh: "FAR / OSR ตามประเภทการใช้ประโยชน์ที่ดิน (สีผังเมือง)",
            titleEn: "FAR / OSR by land-use zone (comprehensive plan colour)",
            params: { byZone: {} },
            sourceRef: "กฎกระทรวงให้ใช้บังคับผังเมืองรวมกรุงเทพมหานคร — ค่าแตกต่างตามประเภทที่ดิน ต้องกรอกค่าตามผังเมืองฉบับที่บังคับใช้ปัจจุบัน. " + UNVERIFIED,
          },
        ],
      },
    },
  });

  // ---- Sample price list (placeholder until the company Excel is imported) ----
  await db.priceListVersion.create({
    data: {
      name: "ตัวอย่าง — ไม่ใช่ราคาจริง",
      effectiveAt: new Date("2026-01-01"),
      isActive: true,
      items: {
        create: [
          { code: "STR-001", nameTh: "งานโครงสร้าง (เหมารวมต่อ ตร.ม.)", unit: "ตร.ม.", materialCost: 4500, laborCost: 1500, category: "โครงสร้าง" },
          { code: "WAL-001", nameTh: "ผนังก่ออิฐมวลเบา ฉาบเรียบ ทาสี", unit: "ตร.ม.", materialCost: 650, laborCost: 350, category: "สถาปัตยกรรม" },
          { code: "FLR-001", nameTh: "กระเบื้องพื้นแกรนิตโต้ 60×60", unit: "ตร.ม.", materialCost: 550, laborCost: 250, category: "สถาปัตยกรรม" },
          { code: "ROF-001", nameTh: "หลังคากระเบื้องคอนกรีต พร้อมโครงเหล็ก", unit: "ตร.ม.", materialCost: 900, laborCost: 400, category: "หลังคา" },
          { code: "DOR-001", nameTh: "ประตูไม้ HDF พร้อมวงกบ", unit: "ชุด", materialCost: 4500, laborCost: 800, category: "ประตู-หน้าต่าง" },
          { code: "WIN-001", nameTh: "หน้าต่างอะลูมิเนียมบานเลื่อน", unit: "ตร.ม.", materialCost: 3200, laborCost: 600, category: "ประตู-หน้าต่าง" },
          { code: "SAN-001", nameTh: "สุขภัณฑ์ชุดมาตรฐาน (ต่อห้องน้ำ)", unit: "ชุด", materialCost: 18000, laborCost: 4000, category: "สุขาภิบาล" },
        ],
      },
    },
  });

  // ---- Material catalog (SAMPLE prices, THB incl. labour — replace with company prices) ----
  type M = [code: string, slot: string, nameTh: string, nameEn: string, unit: string, price: number, color: string, roughness: number, defaultFor: string[]];
  const materials: M[] = [
    ["ROOF-CONC", "roof", "กระเบื้องคอนกรีต สีเทาเข้ม", "Concrete roof tile, charcoal", "m2", 450, "#4b4f54", 0.85, ["standard"]],
    ["ROOF-CONC-BRN", "roof", "กระเบื้องคอนกรีต สีน้ำตาล", "Concrete roof tile, brown", "m2", 450, "#6b4a3a", 0.85, []],
    ["ROOF-METAL", "roof", "เมทัลชีทบุฉนวน", "Insulated metal sheet", "m2", 520, "#7d8790", 0.5, []],
    ["ROOF-CERAMIC", "roof", "กระเบื้องเซรามิก", "Ceramic roof tile", "m2", 750, "#8a3b2c", 0.6, ["premium"]],
    ["ROOF-SLATE", "roof", "กระเบื้องหินชนวน", "Slate roof tile", "m2", 1200, "#2f3237", 0.7, ["luxury"]],
    ["EXT-WHITE", "exterior_wall", "สีภายนอก ขาว", "Exterior paint, white", "m2", 180, "#f4f2ec", 0.9, ["standard"]],
    ["EXT-CREAM", "exterior_wall", "สีภายนอก ครีม", "Exterior paint, cream", "m2", 180, "#ece2cc", 0.9, []],
    ["EXT-GRAY-P", "exterior_wall", "สีภายนอกเกรดพรีเมียม เทาอุ่น", "Premium exterior paint, warm grey", "m2", 260, "#b9b4ab", 0.85, ["premium"]],
    ["EXT-TEXTURE-L", "exterior_wall", "สีพื้นผิวลายหิน เกรดสูง", "Stone-texture coating", "m2", 380, "#d8d0c2", 0.95, ["luxury"]],
    ["EXT-BRICK", "exterior_wall", "อิฐโชว์แนว", "Face brick cladding", "m2", 1100, "#a2573c", 0.95, []],
    ["INT-WHITE", "interior_wall", "สีภายใน ขาว", "Interior paint, white", "m2", 150, "#fafaf7", 0.9, ["standard"]],
    ["INT-BEIGE", "interior_wall", "สีภายใน เบจ", "Interior paint, beige", "m2", 150, "#efe6d6", 0.9, []],
    ["INT-PREM", "interior_wall", "สีภายในเกรดพรีเมียม (เช็ดล้างได้)", "Premium washable paint", "m2", 220, "#f2efe8", 0.85, ["premium"]],
    ["INT-LUX", "interior_wall", "สีภายในเกรดสูง + ผนังตกแต่งบางส่วน", "Luxury paint + feature walls", "m2", 300, "#e9e4db", 0.8, ["luxury"]],
    ["FLR-CERAMIC", "floor", "กระเบื้องเซรามิก 60×60", "Ceramic tile 60×60", "m2", 450, "#d9d4ca", 0.6, ["standard"]],
    ["FLR-GRANITO", "floor", "กระเบื้องแกรนิตโต้ 60×120", "Porcelain tile 60×120", "m2", 900, "#cfcac2", 0.35, ["premium"]],
    ["FLR-SPC", "floor", "พื้น SPC ลายไม้", "SPC wood-look flooring", "m2", 750, "#b08a62", 0.6, []],
    ["FLR-WOOD", "floor", "ไม้เอ็นจิเนียร์", "Engineered wood", "m2", 2200, "#9a6b43", 0.55, ["luxury"]],
    ["FLR-MARBLE", "floor", "หินอ่อน", "Marble", "m2", 3500, "#ece9e3", 0.2, []],
    ["CEIL-GYP", "ceiling", "ฝ้ายิปซัมฉาบเรียบ", "Smooth gypsum ceiling", "m2", 380, "#ffffff", 0.9, ["standard"]],
    ["CEIL-COVE", "ceiling", "ฝ้ายิปซัม + หลืบไฟ", "Gypsum ceiling with cove lighting", "m2", 520, "#ffffff", 0.9, ["premium"]],
    ["CEIL-LUX", "ceiling", "ฝ้าดีไซน์ + ฝ้าไม้บางส่วน", "Designer ceiling with timber accents", "m2", 700, "#f5efe6", 0.85, ["luxury"]],
    ["WIN-ALU-WHT", "window", "อะลูมิเนียมสีขาว กระจกใส", "White aluminium, clear glass", "m2", 3200, "#f2f2f2", 0.4, ["standard"]],
    ["WIN-ALU-BLK", "window", "อะลูมิเนียมสีดำ กระจกเขียวตัดแสง", "Black aluminium, tinted glass", "m2", 4200, "#2b2b2b", 0.4, ["premium"]],
    ["WIN-LOWE", "window", "อะลูมิเนียมดำ กระจก Low-E 2 ชั้น", "Black aluminium, double Low-E glass", "m2", 6500, "#1f1f1f", 0.35, ["luxury"]],
    ["DOOR-HDF", "door", "ประตู HDF พร้อมวงกบ", "HDF door with frame", "unit", 5300, "#e9e1d3", 0.7, ["standard"]],
    ["DOOR-SOLID", "door", "ประตูไม้จริง", "Solid timber door", "unit", 9500, "#8b5a34", 0.6, ["premium"]],
    ["DOOR-LUX", "door", "ประตูไม้จริงดีไซน์ + ลูกบิดดิจิทัล", "Designer timber door + smart lock", "unit", 16000, "#5e3b22", 0.55, ["luxury"]],
    ["SAN-STD", "sanitary", "ชุดสุขภัณฑ์มาตรฐาน", "Standard sanitary set", "set", 22000, "#ffffff", 0.2, ["standard"]],
    ["SAN-PREM", "sanitary", "ชุดสุขภัณฑ์พรีเมียม + เรนชาวเวอร์", "Premium set + rain shower", "set", 45000, "#ffffff", 0.2, ["premium"]],
    ["SAN-LUX", "sanitary", "ชุดสุขภัณฑ์ลักชัวรี + อ่างอาบน้ำ", "Luxury set + bathtub", "set", 90000, "#ffffff", 0.2, ["luxury"]],
    ["KIT-STD", "kitchen", "ชุดครัวบิวท์อินมาตรฐาน", "Standard built-in kitchen", "set", 60000, "#e8e2d8", 0.6, ["standard"]],
    ["KIT-PREM", "kitchen", "ชุดครัว Top หินควอตซ์", "Kitchen with quartz top", "set", 120000, "#d6d0c6", 0.5, ["premium"]],
    ["KIT-LUX", "kitchen", "ชุดครัวดีไซน์ + เครื่องใช้ไฟฟ้า", "Designer kitchen + appliances", "set", 250000, "#3a3a3a", 0.4, ["luxury"]],
  ];
  await db.material.createMany({
    data: materials.map(([code, slot, nameTh, nameEn, unit, unitPrice, color, roughness, defaultFor], i) => ({
      code, slot, nameTh, nameEn, unit, unitPrice, color, roughness, defaultFor, sortOrder: i, isSample: true,
    })),
  });

  // ---- Customers & projects ----
  const plan = sampleTwoStoreyPlan();
  await db.project.create({
    data: {
      code: "P-2026-0001",
      title: "บ้านคุณสมชาย — บางนา",
      status: "DRAFT",
      jurisdiction: { connect: { id: bkk.id } },
      customer: { create: { name: "สมชาย ใจดี", phone: "081-234-5678", email: "somchai@example.com", note: "นัดดูแบบวันเสาร์" } },
      brief: {
        create: {
          land: { shape: "rect", widthM: 16, depthM: 20, areaSqWa: 80, frontFacing: "N", roads: [{ side: "front", widthM: 6 }], province: "กรุงเทพมหานคร", district: "บางนา" },
          requirements: { buildingType: "two_storey", floors: 2, bedrooms: 3, bathrooms: 3, parking: 2, specialRooms: ["kitchen_thai", "office", "elderly_bedroom"], targetAreaM2: 350, style: "modern" },
          budgetMin: 4_500_000,
          budgetMax: 6_000_000,
          freeText: "คุณแม่อายุ 70 อยากได้ห้องนอนชั้นล่างใกล้ห้องน้ำ ชอบบ้านโปร่ง แสงเข้าเยอะ แต่ไม่อยากร้อน มีครัวไทยแยกด้านหลัง",
        },
      },
      versions: {
        create: {
          number: 1,
          label: "แบบตัวอย่าง",
          plan: plan as unknown as Prisma.InputJsonValue,
          derived: computeMetrics(plan) as unknown as Prisma.InputJsonValue,
          totalPrice: estimate(
            plan,
            materials.map(([code, slot, nameTh, nameEn, unit, unitPrice, color, roughness, defaultFor]) => ({
              code, slot, nameTh, nameEn, unit, unitPrice, color, roughness, defaultFor, isSample: true,
            })) as CatalogMaterial[],
          ).total,
        },
      },
    },
  });

  await db.project.create({
    data: {
      code: "P-2026-0002",
      title: "บ้านพักตากอากาศคุณนภา — หัวหิน",
      status: "DRAFT",
      customer: { create: { name: "นภา ศรีสุข", phone: "089-999-0000" } },
      brief: {
        create: {
          land: { shape: "rect", widthM: 24, depthM: 30, frontFacing: "E", roads: [{ side: "front", widthM: 8 }], province: "ประจวบคีรีขันธ์", district: "หัวหิน" },
          requirements: { buildingType: "pool_villa", floors: 1, bedrooms: 3, bathrooms: 4, parking: 2, specialRooms: ["pool", "maid_room"], targetAreaM2: 280, style: "tropical" },
          budgetMin: 8_000_000,
          budgetMax: 10_000_000,
          freeText: "อยากได้สระว่ายน้ำกลางบ้าน ทุกห้องนอนมองเห็นสระ",
        },
      },
    },
  });

  await db.project.create({
    data: {
      code: "P-2026-0003",
      title: "โฮมออฟฟิศคุณวิทยา — นนทบุรี",
      status: "DRAFT",
      customer: { create: { name: "วิทยา พาณิชย์", email: "witthaya@example.com" } },
      brief: {
        create: {
          land: { shape: "irregular", corners: [[0, 0], [12, 0], [14, 25], [0, 25]], frontFacing: "S", roads: [{ side: 0, widthM: 5 }], province: "นนทบุรี", district: "ปากเกร็ด" },
          requirements: { buildingType: "home_office", floors: 3, bedrooms: 2, bathrooms: 3, parking: 3, specialRooms: ["shop", "office", "shrine"], style: "loft" },
          budgetMin: 5_000_000,
          budgetMax: 7_000_000,
        },
      },
    },
  });

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
