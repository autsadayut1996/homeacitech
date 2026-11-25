import type { MepKind, MepLayout } from "@/lib/plan-core";
import { mepSchedule } from "@/lib/plan-core";
import { MepSymbol } from "./overlays";

export const MEP_NAMES: Record<MepKind, string> = {
  light: "ดวงโคมไฟเพดาน",
  switch: "สวิตช์ไฟ",
  socket: "เต้ารับไฟฟ้า",
  ac: "เครื่องปรับอากาศ (จุดติดตั้ง)",
  heater: "เครื่องทำน้ำอุ่น",
  db: "ตู้ควบคุมไฟฟ้า (Consumer unit)",
  meter: "มิเตอร์ไฟฟ้า",
  wc: "โถสุขภัณฑ์",
  basin: "อ่างล้างหน้า",
  shower: "พื้นที่อาบน้ำ",
  sink: "อ่างล้างจาน",
  washer: "เครื่องซักผ้า",
  floor_drain: "ท่อระบายน้ำพื้น (FD)",
  riser: "ท่อแนวดิ่ง",
  septic: "ถังบำบัดน้ำเสียสำเร็จรูป",
  grease: "บ่อดักไขมัน",
  water_meter: "มาตรวัดน้ำ",
  tank_pump: "ถังเก็บน้ำ + ปั๊มน้ำ",
};

export function MepLegend({ layout, levelId, kinds, pipes }: { layout: MepLayout; levelId: string; kinds: MepKind[]; pipes: boolean }) {
  const onLevel = { items: layout.items.filter((i) => i.levelId === levelId), runs: [] };
  const rows = mepSchedule(onLevel, kinds);
  return (
    <div style={{ width: "62mm", fontSize: "2.4mm" }}>
      <div style={{ fontWeight: 700, borderBottom: "0.3mm solid #111", marginBottom: "1mm" }}>สัญลักษณ์ / LEGEND</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.kind}>
              <td style={{ width: "9mm", padding: "0.6mm 0" }}>
                <svg viewBox="-0.7 -0.7 1.4 1.4" style={{ width: "7mm", height: "7mm" }}>
                  <MepSymbol kind={r.kind} />
                </svg>
              </td>
              <td>{MEP_NAMES[r.kind]}</td>
              <td style={{ textAlign: "right" }}>{r.count}</td>
            </tr>
          ))}
          {pipes && (
            <>
              <tr>
                <td>
                  <svg viewBox="0 0 10 2" style={{ width: "7mm", height: "2mm" }}>
                    <line x1="0" y1="1" x2="10" y2="1" stroke="#7c4a1e" strokeWidth="0.6" />
                  </svg>
                </td>
                <td colSpan={2}>ท่อน้ำทิ้ง/โสโครก (แนวโดยประมาณ)</td>
              </tr>
              <tr>
                <td>
                  <svg viewBox="0 0 10 2" style={{ width: "7mm", height: "2mm" }}>
                    <line x1="0" y1="1" x2="10" y2="1" stroke="#0284c7" strokeWidth="0.5" strokeDasharray="2 1" />
                  </svg>
                </td>
                <td colSpan={2}>ท่อน้ำดี (แนวโดยประมาณ)</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <p style={{ marginTop: "2mm", color: "#b91c1c" }}>
        ตำแหน่งและจำนวนเป็นแนวคิดเบื้องต้นจากประเภทห้อง — วิศวกรผู้มีใบอนุญาตต้องออกแบบและคำนวณระบบจริง
      </p>
    </div>
  );
}
