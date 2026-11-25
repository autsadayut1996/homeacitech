/* Seed data so the app is usable immediately. Re-runnable: wipes and recreates sample rows. */
import { PrismaClient, Prisma } from "@prisma/client";
import { sampleTwoStoreyPlan } from "../src/lib/plan-core/samples";
import { computeMetrics } from "../src/lib/plan-core/metrics";
import { estimate } from "../src/lib/pricing/materials";
import { ensureReferenceData, sampleCatalog } from "./reference";

const db = new PrismaClient();


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

  await ensureReferenceData(db);
  const bkk = await db.jurisdiction.findUniqueOrThrow({ where: { code: "TH-BKK" } });

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
          totalPrice: estimate(plan, sampleCatalog()).total,
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
