/** Starting content for company documents — every value is editable in Settings → Company & documents. */

export interface PaymentTerm {
  labelTh: string;
  labelEn: string;
  pct: number;
}

export const DEFAULT_PAYMENT_TERMS: PaymentTerm[] = [
  { labelTh: "งวดที่ 1 วันทำสัญญา", labelEn: "1st — on signing the contract", pct: 10 },
  { labelTh: "งวดที่ 2 งานฐานรากแล้วเสร็จ", labelEn: "2nd — foundations complete", pct: 15 },
  { labelTh: "งวดที่ 3 งานโครงสร้างแล้วเสร็จ", labelEn: "3rd — structure complete", pct: 20 },
  { labelTh: "งวดที่ 4 งานหลังคาแล้วเสร็จ", labelEn: "4th — roof complete", pct: 20 },
  { labelTh: "งวดที่ 5 งานผนังและงานระบบแล้วเสร็จ", labelEn: "5th — walls and services complete", pct: 15 },
  { labelTh: "งวดที่ 6 งานสถาปัตยกรรมแล้วเสร็จ", labelEn: "6th — finishes complete", pct: 15 },
  { labelTh: "งวดที่ 7 ส่งมอบงาน", labelEn: "7th — handover", pct: 5 },
];

export const DEFAULT_QUOTE_TERMS_TH = `1. ราคานี้เป็นราคาประเมินจากแบบร่างเพื่อการขาย ราคาสุดท้ายจะยืนยันหลังสถาปนิก/วิศวกรตรวจแบบและจัดทำแบบก่อสร้าง
2. ราคารวมค่าวัสดุและค่าแรงตามรายการวัสดุที่ระบุ ไม่รวมค่าขออนุญาตก่อสร้าง ค่าถมดิน ค่ารื้อถอน และงานนอกเหนือจากที่ระบุ
3. ระยะเวลาก่อสร้างโดยประมาณจะแจ้งในสัญญา
4. ใบเสนอราคานี้มีผลถึงวันที่ระบุไว้ด้านบน`;

export const DEFAULT_QUOTE_TERMS_EN = `1. This price is estimated from a sales draft. The final price is confirmed after the architect/engineer review and construction drawings.
2. Includes materials and labour for the listed specification; excludes permit fees, land filling, demolition and work not listed.
3. The estimated construction period is stated in the contract.
4. This quotation is valid until the date shown above.`;

/** Placeholder contract — the company's legal team must supply the real wording. */
export const DEFAULT_CONTRACT_TH = `สัญญาจ้างก่อสร้างบ้าน

ทำที่ {{company.name}} เมื่อวันที่ {{date}}

สัญญาฉบับนี้ทำขึ้นระหว่าง {{company.name}} ที่อยู่ {{company.address}} เลขประจำตัวผู้เสียภาษี {{company.taxId}} ซึ่งต่อไปเรียกว่า "ผู้รับจ้าง" ฝ่ายหนึ่ง กับ {{customer.name}} โทร {{customer.phone}} ซึ่งต่อไปเรียกว่า "ผู้ว่าจ้าง" อีกฝ่ายหนึ่ง

ข้อ 1 ผู้ว่าจ้างตกลงจ้างและผู้รับจ้างตกลงรับจ้างก่อสร้างบ้านตามแบบเลขที่ {{project.code}} เวอร์ชัน {{version}} บนที่ดิน {{project.location}} ขนาดพื้นที่ใช้สอยประมาณ {{area}} ตารางเมตร

ข้อ 2 ค่าจ้างรวมเป็นเงิน {{price.total}} บาท ({{price.totalText}}) รวมภาษีมูลค่าเพิ่มแล้ว

ข้อ 3 การชำระเงินแบ่งเป็นงวดดังนี้
{{payment.schedule}}

ข้อ 4 รายละเอียดวัสดุเป็นไปตามใบเสนอราคาเลขที่ {{quotation.number}}

[ตัวอย่างโครงสัญญา — ฝ่ายกฎหมายของบริษัทต้องกำหนดเนื้อหาสัญญาจริงในหน้าตั้งค่า]`;

export const DEFAULT_CONTRACT_EN = `HOUSE CONSTRUCTION CONTRACT

Made at {{company.name}} on {{date}}

This contract is made between {{company.name}}, {{company.address}}, tax ID {{company.taxId}} (the "Contractor") and {{customer.name}}, tel. {{customer.phone}} (the "Owner").

1. The Owner engages the Contractor to build a house according to design {{project.code}} version {{version}} on the plot at {{project.location}}, with a usable area of about {{area}} m².

2. The contract price is THB {{price.total}} ({{price.totalText}}) including VAT.

3. Payment is made in instalments:
{{payment.schedule}}

4. The specification is as listed in quotation {{quotation.number}}.

[Sample contract outline — the company's legal team must provide the actual wording in Settings]`;
