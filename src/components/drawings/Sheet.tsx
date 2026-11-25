import type { ReactNode } from "react";

export interface TitleInfo {
  company: { name: string; nameEn: string; address: string | null; phone: string | null; logo: string | null };
  project: { code: string; title: string; customer: string; location: string };
  version: string;
  date: string;
  architect: { name: string; license: string } | null;
  engineer: { name: string; license: string } | null;
  certified: boolean;
}

/** Fit a drawing of w × h metres into a box (mm) at the largest standard scale that fits. */
export function fitScale(wM: number, hM: number, boxW: number, boxH: number) {
  const scales = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
  const s = scales.find((sc) => (wM * 1000) / sc <= boxW && (hM * 1000) / sc <= boxH) ?? 1000;
  return { scale: s, width: (wM * 1000) / s, height: (hM * 1000) / s };
}

/** Drawing area (mm) inside a sheet: left of the title block, inside the frame. */
export const AREA = { x: 18, y: 10, w: 312, h: 277 };

function SignBox({ role, who }: { role: string; who: { name: string; license: string } | null }) {
  return (
    <div style={{ borderTop: "0.3mm solid #111", padding: "1.5mm 2mm", height: "21mm" }}>
      <div style={{ fontWeight: 600 }}>{role}</div>
      <div style={{ marginTop: "6mm", borderBottom: "0.2mm dotted #777" }} />
      <div style={{ fontSize: "2.3mm", marginTop: "1mm" }}>
        {who ? `${who.name} · ใบอนุญาต ${who.license}` : "ชื่อ .............................. ใบอนุญาตเลขที่ ................"}
      </div>
    </div>
  );
}

export function Sheet({ number, titleTh, titleEn, info, children }: { number: string; titleTh: string; titleEn: string; info: TitleInfo; children: ReactNode }) {
  return (
    <section className="sheet" data-testid="sheet" data-sheet={number}>
      {/* frame */}
      <div style={{ position: "absolute", left: "15mm", top: "7mm", right: "7mm", bottom: "7mm", border: "0.5mm solid #111" }} />
      {/* drawing area */}
      <div style={{ position: "absolute", left: `${AREA.x}mm`, top: `${AREA.y}mm`, width: `${AREA.w}mm`, height: `${AREA.h}mm` }}>{children}</div>
      {!info.certified && (
        <div style={{ position: "absolute", left: "15mm", top: "7mm", width: "323mm", bottom: "7mm", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ transform: "rotate(-20deg)", fontSize: "26mm", fontWeight: 800, color: "rgb(220 38 38 / 0.12)", whiteSpace: "nowrap" }}>ร่าง — ยังไม่ผ่านการรับรอง</span>
        </div>
      )}
      {/* title block */}
      <aside style={{ position: "absolute", top: "7mm", right: "7mm", bottom: "7mm", width: "75mm", borderLeft: "0.5mm solid #111", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "2mm", display: "flex", gap: "2mm", alignItems: "flex-start" }}>
          {info.company.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={info.company.logo} alt="" style={{ height: "12mm", width: "auto", maxWidth: "22mm", objectFit: "contain" }} />
          )}
          <div>
            <div style={{ fontWeight: 700 }}>{info.company.name}</div>
            <div style={{ fontSize: "2.2mm" }}>{info.company.nameEn}</div>
            {info.company.address && <div style={{ fontSize: "2.2mm" }}>{info.company.address}</div>}
            {info.company.phone && <div style={{ fontSize: "2.2mm" }}>โทร {info.company.phone}</div>}
          </div>
        </div>
        <div style={{ borderTop: "0.3mm solid #111", padding: "1.5mm 2mm" }}>
          <div style={{ fontSize: "2.2mm", color: "#555" }}>โครงการ / PROJECT</div>
          <div style={{ fontWeight: 600 }}>{info.project.title}</div>
          <div>
            {info.project.code} · {info.project.customer}
          </div>
          <div>{info.project.location}</div>
        </div>
        <SignBox role="สถาปนิกผู้ออกแบบ / ARCHITECT" who={info.architect} />
        <SignBox role="วิศวกรโยธา (ผู้คำนวณ) / CIVIL ENGINEER" who={info.engineer} />
        <SignBox role="วิศวกรไฟฟ้า / ELECTRICAL ENGINEER" who={null} />
        <SignBox role="วิศวกรสุขาภิบาล / SANITARY ENGINEER" who={null} />
        <SignBox role="เจ้าของอาคาร / OWNER" who={null} />
        <div style={{ borderTop: "0.3mm solid #111", padding: "1.5mm 2mm", fontSize: "2.2mm", color: info.certified ? "#15803d" : "#b91c1c" }}>
          {info.certified
            ? "สถาปนิกและวิศวกรอนุมัติแบบเวอร์ชันนี้แล้ว (ตามบันทึกในระบบ) — ต้องลงนามจริงก่อนยื่น"
            : "แบบร่างเพื่อการขาย ยังไม่ผ่านการตรวจรับรองโดยผู้มีใบอนุญาต — ห้ามใช้ยื่นขออนุญาตหรือก่อสร้าง"}
        </div>
        <div style={{ marginTop: "auto", borderTop: "0.5mm solid #111", padding: "2mm" }}>
          <div style={{ fontWeight: 700, fontSize: "3.4mm" }}>{titleTh}</div>
          <div style={{ fontSize: "2.4mm" }}>{titleEn}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "2mm" }}>
            <div style={{ fontSize: "2.2mm" }}>
              <div>แบบเวอร์ชัน {info.version}</div>
              <div>วันที่ {info.date}</div>
            </div>
            <div style={{ fontSize: "7mm", fontWeight: 800 }}>{number}</div>
          </div>
        </div>
      </aside>
    </section>
  );
}

/** A drawing placed in the sheet's drawing area with a caption and its scale. */
export function Drawing({ x, y, title, scale, children }: { x: number; y: number; title: string; scale: number; children: ReactNode }) {
  return (
    <figure style={{ position: "absolute", left: `${x}mm`, top: `${y}mm`, margin: 0 }}>
      {children}
      <figcaption style={{ marginTop: "1.5mm", fontWeight: 600, fontSize: "3mm", borderBottom: "0.4mm solid #111", display: "inline-block", paddingRight: "4mm" }}>
        {title} <span style={{ fontWeight: 400, fontSize: "2.4mm" }}>มาตราส่วน 1:{scale}</span>
      </figcaption>
    </figure>
  );
}
