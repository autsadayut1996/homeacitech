import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LandSchema } from "@/lib/brief";
import { ELECTRICAL, SANITARY, PlanSchema, elevations, mepLayout, openingMarks, section } from "@/lib/plan-core";
import { getCompany } from "@/lib/documents/company";
import { licensedApproval, type ApprovalLike } from "@/lib/workflow";
import { SitePlanSvg, siteSvgFrame } from "@/components/SitePlanSvg";
import { ElevationSvg } from "@/components/ElevationSvg";
import { Drawing, Sheet, AREA, fitScale, type TitleInfo } from "@/components/drawings/Sheet";
import { GridOverlay, MepOverlay, PlanTags, RoofPlanOverlay, SectionMarks, buildingCrop } from "@/components/drawings/overlays";
import { FinishLegend, OpeningSchedule } from "@/components/drawings/Schedules";
import { MepLegend } from "@/components/drawings/MepLegend";
import { PrintButton } from "@/components/drawings/PrintButton";

export const dynamic = "force-dynamic";

const ELEV_TH = { front: "รูปด้านหน้า", back: "รูปด้านหลัง", left: "รูปด้านซ้าย", right: "รูปด้านขวา" } as const;
const FACING_TH: Record<string, string> = { N: "เหนือ", NE: "ตะวันออกเฉียงเหนือ", E: "ตะวันออก", SE: "ตะวันออกเฉียงใต้", S: "ใต้", SW: "ตะวันตกเฉียงใต้", W: "ตะวันตก", NW: "ตะวันตกเฉียงเหนือ" };

/** Permit-submission checklist (sample — confirm with the local district / municipality office). */
const CHECKLIST = [
  "แบบคำขออนุญาตก่อสร้างอาคาร (ข.1 หรือแบบที่ท้องถิ่นกำหนด)",
  "สำเนาโฉนดที่ดิน / น.ส.3 ทุกหน้า ขนาดเท่าต้นฉบับ",
  "หนังสือยินยอมให้ใช้ที่ดินก่อสร้าง (กรณีไม่ใช่เจ้าของที่ดิน)",
  "สำเนาบัตรประชาชนและทะเบียนบ้านของผู้ขออนุญาต",
  "หนังสือรับรองผู้ออกแบบสถาปัตยกรรม พร้อมสำเนาใบอนุญาตประกอบวิชาชีพ",
  "หนังสือรับรองผู้ออกแบบ/คำนวณโครงสร้าง พร้อมสำเนาใบอนุญาตประกอบวิชาชีพ",
  "รายการคำนวณโครงสร้าง (ลงนามวิศวกร)",
  "แบบแปลนอาคาร ลงนามครบ (จำนวนชุดตามที่ท้องถิ่นกำหนด)",
  "หนังสือแต่งตั้งผู้ควบคุมงาน",
  "หนังสือยินยอมของเจ้าของที่ดินข้างเคียง (กรณีก่อสร้างชิดแนวเขต)",
];

export default async function DrawingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const project = await db.project.findUnique({ where: { id }, include: { customer: true, brief: true, approvals: true } });
  if (!project) notFound();
  const version = v
    ? await db.designVersion.findFirst({ where: { id: v, projectId: id } })
    : await db.designVersion.findFirst({ where: { projectId: id, number: { not: null } }, orderBy: { number: "desc" } });
  const parsed = version && PlanSchema.safeParse(version.plan);
  if (!version || !parsed || !parsed.success) notFound();
  const plan = parsed.data;
  const company = await getCompany();
  const land = LandSchema.safeParse(project.brief?.land);

  const approvals: ApprovalLike[] = project.approvals.map((a) => ({ type: a.type, status: a.status, versionId: a.versionId, approver: a.approver, licenseNo: a.licenseNo }));
  const arch = licensedApproval(approvals, "ARCHITECTURE", version.id);
  const eng = licensedApproval(approvals, "ENGINEERING", version.id);
  const info: TitleInfo = {
    company: { name: company.nameTh, nameEn: company.nameEn, address: company.address, phone: company.phone, logo: company.logo },
    project: { code: project.code, title: project.title, customer: project.customer.name, location: land.success ? [land.data.district, land.data.province].filter(Boolean).join(", ") : "-" },
    version: `v${version.number ?? "-"}`,
    date: new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
    architect: arch ? { name: arch.approver!, license: arch.licenseNo! } : null,
    engineer: eng ? { name: eng.approver!, license: eng.licenseNo! } : null,
    certified: !!arch && !!eng,
  };

  // one scale for all plans (leave room for the legend on MEP sheets), one for elevations/sections
  const frame = siteSvgFrame(plan.site);
  const plan$ = fitScale(frame.width, frame.height, AREA.w - 70, AREA.h - 12);
  const elevs = elevations(plan);
  const sects = [section(plan, "A"), section(plan, "B")];
  const tallest = [...elevs, ...sects].reduce(
    (m, e) => {
      const f = fitScale(e.bounds.maxU - e.bounds.minU, e.bounds.maxZ - e.bounds.minZ, AREA.w - 10, (AREA.h - 24) / 2);
      return f.scale > m ? f.scale : m;
    },
    0,
  );
  const elevSize = (e: (typeof elevs)[number]) => ({ width: ((e.bounds.maxU - e.bounds.minU) * 1000) / tallest, height: ((e.bounds.maxZ - e.bounds.minZ) * 1000) / tallest });
  const mep = mepLayout(plan);
  const planStyle = { width: `${plan$.width}mm`, height: `${plan$.height}mm` };
  // floor plans: the building alone, at a construction-drawing scale (1:75 / 1:100 where it fits)
  const crop = buildingCrop(plan);
  const floor$ = fitScale(crop.w, crop.h, AREA.w - 70, AREA.h - 12);
  const floorStyle = { width: `${floor$.width}mm`, height: `${floor$.height}mm` };
  const marks = openingMarks(plan);

  type SheetDef = { number: string; th: string; en: string; body: React.ReactNode };
  const sheets: SheetDef[] = [];
  const planSheet = (number: string, th: string, en: string, svg: React.ReactNode, legend?: React.ReactNode, scale = plan$.scale) =>
    sheets.push({
      number,
      th,
      en,
      body: (
        <>
          <Drawing x={0} y={0} title={th} scale={scale}>
            {svg}
          </Drawing>
          {legend && <div style={{ position: "absolute", right: 0, top: 0 }}>{legend}</div>}
        </>
      ),
    });

  planSheet("A-01", "ผังบริเวณ", "SITE PLAN", <SitePlanSvg site={plan.site} plan={plan} levelIndex={0} locale="th" style={planStyle} drafting furnish={false} />);
  plan.levels.forEach((l, i) =>
    planSheet(
      `A-${String(i + 2).padStart(2, "0")}`,
      `แปลนพื้น${l.name.th}`,
      `${l.name.en.toUpperCase()} PLAN`,
      <SitePlanSvg site={plan.site} plan={plan} levelIndex={i} locale="th" style={floorStyle} crop={crop} roomAreas={false} drafting>
        <GridOverlay plan={plan} levelIndex={i} />
        <PlanTags plan={plan} levelIndex={i} marks={marks} />
        <SectionMarks plan={plan} />
      </SitePlanSvg>,
      <FinishLegend />,
      floor$.scale,
    ),
  );
  for (const [k, pair] of [elevs.filter((e) => e.side === "front" || e.side === "back"), elevs.filter((e) => e.side === "left" || e.side === "right")].entries()) {
    sheets.push({
      number: `A-${10 + k}`,
      th: k === 0 ? "รูปด้านหน้า / รูปด้านหลัง" : "รูปด้านซ้าย / รูปด้านขวา",
      en: k === 0 ? "FRONT / REAR ELEVATIONS" : "LEFT / RIGHT ELEVATIONS",
      body: pair.map((e, j) => (
        <Drawing key={e.side} x={0} y={j * (AREA.h / 2)} title={`${ELEV_TH[e.side]} (ด้านทิศ${FACING_TH[e.facing]})`} scale={tallest}>
          <ElevationSvg e={e} style={{ width: `${elevSize(e).width}mm`, height: `${elevSize(e).height}mm` }} />
        </Drawing>
      )),
    });
  }
  sheets.push({
    number: "A-20",
    th: "รูปตัด A-A / รูปตัด B-B",
    en: "SECTIONS A-A / B-B",
    body: sects.map((s, j) => (
      <Drawing key={j} x={0} y={j * (AREA.h / 2)} title={`รูปตัด ${j === 0 ? "A-A" : "B-B"}`} scale={tallest}>
        <ElevationSvg e={s} style={{ width: `${elevSize(s).width}mm`, height: `${elevSize(s).height}mm` }} />
      </Drawing>
    )),
  });
  planSheet(
    "A-30",
    "ผังหลังคา",
    "ROOF PLAN",
    <SitePlanSvg site={plan.site} plan={plan} levelIndex={plan.levels.length - 1} locale="th" showRooms={false} style={floorStyle} crop={crop} drafting>
      <GridOverlay plan={plan} levelIndex={plan.levels.length - 1} />
      <RoofPlanOverlay plan={plan} />
    </SitePlanSvg>,
    undefined,
    floor$.scale,
  );
  sheets.push({
    number: "A-40",
    th: "ตารางประตู-หน้าต่าง",
    en: "DOOR & WINDOW SCHEDULE",
    body: <OpeningSchedule schedule={marks.schedule} />,
  });
  plan.levels.forEach((l, i) =>
    planSheet(
      `E-${String(i + 1).padStart(2, "0")}`,
      `ผังไฟฟ้า${l.name.th}`,
      `${l.name.en.toUpperCase()} ELECTRICAL PLAN`,
      <SitePlanSvg site={plan.site} plan={plan} levelIndex={i} locale="th" muted style={floorStyle} crop={crop} drafting furnish={false}>
        <GridOverlay plan={plan} levelIndex={i} />
        <MepOverlay plan={plan} layout={mep} levelId={l.id} kinds={ELECTRICAL} showRuns={false} />
      </SitePlanSvg>,
      <MepLegend layout={mep} levelId={l.id} kinds={ELECTRICAL} pipes={false} />,
      floor$.scale,
    ),
  );
  plan.levels.forEach((l, i) =>
    planSheet(
      `S-${String(i + 1).padStart(2, "0")}`,
      `ผังสุขาภิบาล${l.name.th}`,
      `${l.name.en.toUpperCase()} SANITARY PLAN`,
      <SitePlanSvg site={plan.site} plan={plan} levelIndex={i} locale="th" muted style={floorStyle} crop={crop} drafting furnish={false}>
        <GridOverlay plan={plan} levelIndex={i} />
        <MepOverlay plan={plan} layout={mep} levelId={l.id} kinds={SANITARY} showRuns />
      </SitePlanSvg>,
      <MepLegend layout={mep} levelId={l.id} kinds={SANITARY} pipes />,
      floor$.scale,
    ),
  );

  const cover: SheetDef = {
    number: "A-00",
    th: "สารบัญแบบและหมายเหตุ",
    en: "DRAWING INDEX & NOTES",
    body: (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10mm", padding: "4mm" }}>
        <div>
          <div style={{ fontSize: "6mm", fontWeight: 800 }}>{project.title}</div>
          <div style={{ fontSize: "3.2mm", marginBottom: "5mm" }}>
            {project.code} · {project.customer.name} · {info.project.location}
          </div>
          <div style={{ fontWeight: 700, borderBottom: "0.3mm solid #111", marginBottom: "1mm" }}>สารบัญแบบ / DRAWING INDEX</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="sheet-index">
            <tbody>
              {[{ number: "A-00", th: "สารบัญแบบและหมายเหตุ", en: "DRAWING INDEX & NOTES" }, ...sheets].map((s) => (
                <tr key={s.number} style={{ borderBottom: "0.2mm solid #ccc" }}>
                  <td style={{ padding: "0.8mm 0", width: "16mm", fontWeight: 600 }}>{s.number}</td>
                  <td>{s.th}</td>
                  <td style={{ color: "#555" }}>{s.en}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ fontWeight: 700, borderBottom: "0.3mm solid #111", marginBottom: "1mm" }}>หมายเหตุทั่วไป / GENERAL NOTES</div>
          <ol style={{ paddingLeft: "5mm", margin: 0 }}>
            <li>ขนาดในแบบเป็นเมตร วัดถึงแนวศูนย์กลางผนัง/แนวเส้นกริดโครงสร้าง ระดับอ้างอิง ±0.00 = ระดับถนน/ดินเดิม พื้นชั้น 1 = {`+${(plan.building.plinthM ?? 0.5).toFixed(2)}`}</li>
            <li>รหัสห้อง F = วัสดุพื้น, C = ฝ้าเพดาน ตามด้วยระดับพื้นและความสูงฝ้า รายละเอียดวัสดุตามรายการประกอบแบบ · D = ประตู, W = หน้าต่าง ดูตารางประตู-หน้าต่าง (A-40)</li>
            <li>แบบชุดนี้จัดทำจากแบบร่างเพื่อการขาย ผู้ออกแบบต้องตรวจสอบและแก้ไขก่อนลงนาม</li>
            <li>งานโครงสร้าง ไฟฟ้า และสุขาภิบาล ต้องออกแบบและคำนวณโดยวิศวกรผู้มีใบอนุญาต ผังไฟฟ้า/สุขาภิบาลในชุดนี้เป็นแนวคิดเบื้องต้นเท่านั้น</li>
            <li>ระยะร่นและข้อกำหนดตามกฎหมายเป็นการตรวจเบื้องต้นของระบบ ต้องตรวจสอบกับข้อบัญญัติท้องถิ่นที่ใช้บังคับ</li>
          </ol>
          <div style={{ fontWeight: 700, borderBottom: "0.3mm solid #111", margin: "5mm 0 1mm" }}>เอกสารประกอบการยื่นขออนุญาต / SUBMISSION CHECKLIST</div>
          <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
            {CHECKLIST.map((c) => (
              <li key={c} style={{ padding: "0.6mm 0" }}>
                ☐ {c}
              </li>
            ))}
          </ul>
          <p style={{ color: "#b91c1c", fontSize: "2.3mm" }}>รายการตัวอย่าง — ตรวจสอบเอกสารที่ต้องใช้จริงกับสำนักงานเขต/เทศบาลก่อนยื่น</p>
        </div>
      </div>
    ),
  };

  return (
    <div>
      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3">
        <Link href={`/projects/${id}?v=${version.id}`} className="text-sm text-accent hover:underline">
          ← {project.code}
        </Link>
        <h1 className="text-lg font-bold">
          ชุดแบบ A3 — {project.title} <span className="font-normal text-muted">v{version.number}</span>
        </h1>
        <span className="text-sm text-muted">{sheets.length + 1} แผ่น</span>
        <PrintButton />
        <p className="w-full text-xs text-muted">
          กดพิมพ์ แล้วเลือก &quot;บันทึกเป็น PDF&quot; · ขนาด A3 แนวนอน · ขอบกระดาษ: ไม่มี (None) · เปิด &quot;กราฟิกพื้นหลัง&quot; — แบบพิมพ์ตามมาตราส่วนจริงที่ระบุในแต่ละแผ่น
          {!info.certified && " · ยังมีลายน้ำ \"ร่าง\" จนกว่าสถาปนิกและวิศวกรจะอนุมัติแบบเวอร์ชันนี้ในขั้นตรวจแบบ"}
        </p>
      </div>
      <div className="sheet-viewport">
        {[cover, ...sheets].map((s) => (
          <Sheet key={s.number} number={s.number} titleTh={s.th} titleEn={s.en} info={info}>
            {s.body}
          </Sheet>
        ))}
      </div>
    </div>
  );
}
