/** Legends and schedules for the drawing set (sizes in mm on an A3 sheet). */
import type { OpeningType } from "@/lib/plan-core";

const KIND_TH: Record<string, string> = { door: "ประตูบานเปิด", sliding_door: "ประตูบานเลื่อน", window: "หน้าต่าง" };

const cell = { border: "0.2mm solid #999", padding: "0.8mm 1.5mm" } as const;

/** Finish codes used in the room tags. */
export function FinishLegend() {
  const rows = [
    ["F1", "พื้นทั่วไป ตามรายการวัสดุ (หมวดวัสดุปูพื้น)"],
    ["F2", "พื้นห้องน้ำ/ซักล้าง กระเบื้องผิวกันลื่น ลดระดับ 0.10"],
    ["F3", "พื้นภายนอก ระเบียง ที่จอดรถ ลดระดับ 0.10"],
    ["C1", "ฝ้ายิปซัมบอร์ด ฉาบเรียบ (ความสูงตามป้ายห้อง)"],
    ["C2", "ฝ้ายิปซัมกันชื้น (ความสูงตามป้ายห้อง)"],
    ["C3", "ฝ้าภายนอก ไฟเบอร์ซีเมนต์/ระแนง"],
  ];
  return (
    <div style={{ width: "62mm", fontSize: "2.3mm" }} data-testid="finish-legend">
      <div style={{ fontWeight: 700, borderBottom: "0.3mm solid #111", marginBottom: "1mm" }}>สัญลักษณ์ห้อง / ROOM TAG</div>
      <svg viewBox="0 0 62 8" style={{ width: "62mm", height: "8mm" }}>
        {["F1", "+0.50", "C1", "+2.80"].map((t, i) => {
          const x = [0, 7, 18, 25][i];
          const w = [7, 11, 7, 11][i];
          return (
            <g key={t}>
              <rect x={x + 1} y={1} width={w} height={5} fill="#fff" stroke="#111" strokeWidth={0.25} />
              <text x={x + 1 + w / 2} y={4.6} fontSize={3} textAnchor="middle">
                {t}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ color: "#555", marginBottom: "1.5mm" }}>วัสดุพื้น · ระดับพื้น · ฝ้า · ความสูงฝ้า</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map(([c, d]) => (
            <tr key={c}>
              <td style={{ ...cell, fontWeight: 700, width: "8mm" }}>{c}</td>
              <td style={cell}>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: "2mm" }}>
        <span style={{ display: "inline-block", width: "3mm", height: "3mm", background: "#111", verticalAlign: "middle" }} /> เสา (ขนาดตามวิศวกรออกแบบ)
      </div>
      <div>○ D = ประตู · ⬡ W = หน้าต่าง (ดู A-40)</div>
    </div>
  );
}

/** Door & window schedule: elevation sketch at 1:50 with size, sill, quantity and floors. */
export function OpeningSchedule({ schedule }: { schedule: OpeningType[] }) {
  const S = 20; // 1:50 → 20 mm per metre
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4mm", padding: "2mm", fontSize: "2.4mm" }} data-testid="opening-schedule">
      {schedule.map((t) => {
        const top = Math.max(2.1, t.sillM + t.heightM);
        const w = t.widthM * S;
        const h = top * S;
        const y0 = (top - t.sillM - t.heightM) * S;
        const glass = t.kind !== "door";
        return (
          <div key={t.code} style={{ border: "0.25mm solid #111", width: `${Math.max(w + 16, 44)}mm` }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "0.25mm solid #111", padding: "0.8mm 1.5mm" }}>
              <b style={{ fontSize: "3.4mm" }}>{t.code}</b>
              <span>× {t.count}</span>
            </div>
            <svg viewBox={`-6 -3 ${w + 12} ${h + 9}`} style={{ display: "block", margin: "1mm auto", width: `${w + 12}mm`, height: `${h + 9}mm` }}>
              <line x1={-4} y1={h} x2={w + 4} y2={h} stroke="#777" strokeWidth={0.25} />
              <rect x={0} y={y0} width={w} height={t.heightM * S} fill={glass ? "#e6f2fb" : "#fff"} stroke="#111" strokeWidth={0.4} />
              {t.kind === "door" && <line x1={w * 0.85} y1={y0 + t.heightM * S * 0.5} x2={w * 0.85} y2={y0 + t.heightM * S * 0.56} stroke="#111" strokeWidth={0.6} />}
              {t.kind !== "door" && <line x1={w / 2} y1={y0} x2={w / 2} y2={y0 + t.heightM * S} stroke="#111" strokeWidth={0.3} />}
              {t.kind === "door" && <polyline points={`${w},${y0} 0,${y0 + (t.heightM * S) / 2} ${w},${y0 + t.heightM * S}`} fill="none" stroke="#999" strokeWidth={0.2} strokeDasharray="1 0.8" />}
              <text x={w / 2} y={h + 5} fontSize={2.6} textAnchor="middle">
                {t.widthM.toFixed(2)}
              </text>
              <text x={-2} y={y0 + (t.heightM * S) / 2} fontSize={2.6} textAnchor="middle" transform={`rotate(-90 -2 ${y0 + (t.heightM * S) / 2})`}>
                {t.heightM.toFixed(2)}
              </text>
            </svg>
            <div style={{ padding: "0.8mm 1.5mm", borderTop: "0.2mm solid #999", lineHeight: 1.35 }}>
              <div>{KIND_TH[t.kind] ?? t.kind}</div>
              <div>
                กว้าง {t.widthM.toFixed(2)} × สูง {t.heightM.toFixed(2)} ม.{t.sillM > 0 ? ` · ขอบล่าง +${t.sillM.toFixed(2)}` : ""}
              </div>
              <div style={{ color: "#555" }}>{t.levels.join(", ")}</div>
            </div>
          </div>
        );
      })}
      <p style={{ width: "100%", color: "#555", margin: 0 }}>มาตราส่วน 1:50 · ขนาดเป็นเมตร (ขนาดช่องเปิด) · วัสดุวงกบและบานตามรายการวัสดุประกอบแบบ · ผู้รับจ้างต้องวัดขนาดจริงหน้างานก่อนสั่งผลิต</p>
    </div>
  );
}
