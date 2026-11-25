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

export const DEFAULT_QUOTE_TERMS_TH = `งานโครงสร้างที่ไม่ได้ระบุในแบบ ให้ทำตามหลักวิชาช่าง และมาตรฐานวิศวกรรมสถานแห่งประเทศไทย (วสท.)
ราคานี้ใช้เสาเข็มตามการออกแบบของวิศวกร ตามผลสำรวจดิน
รับประกันงานโครงสร้าง 10 ปี
รับประกันหลังคารั่วซึม 5 ปี
รับประกันงานทั่วไป 1 ปี
รับประกันปลวก 3 ปี จากบริษัทกำจัดปลวก
ราคาประเมินจากแบบร่างเพื่อการขาย ราคาสุดท้ายยืนยันหลังสถาปนิก/วิศวกรตรวจแบบและจัดทำแบบก่อสร้าง
ไม่รวมค่าธรรมเนียมขออนุญาต ค่าถมดิน ค่ารื้อถอน ค่าขอมิเตอร์น้ำ-ไฟ และงานนอกเหนือจากที่ระบุ`;

export const DEFAULT_QUOTE_TERMS_EN = `Any structural work not specified in the drawings follows good practice and the standards of the Engineering Institute of Thailand (EIT).
Piles as designed by the engineer according to the soil investigation.
10-year structural warranty.
5-year roof leakage warranty.
1-year general workmanship warranty.
3-year termite warranty from the pest-control company.
Estimated from a sales draft; the final price is confirmed after the architect/engineer review and construction drawings.
Excludes permit fees, land filling, demolition, utility meter applications and work not listed.`;

/** Cover-letter text. {location} is replaced with the project location. */
export const DEFAULT_INTRO_TH = `ตามที่ท่านมีความประสงค์จะปลูกสร้างบ้านพักอาศัย สถานที่ก่อสร้าง {location} บริษัทฯ ใคร่ขอเสนอรายละเอียดการประมาณราคาค่าก่อสร้างตามพื้นที่ก่อสร้างและรายการวัสดุประกอบอาคาร ดังนี้`;
export const DEFAULT_INTRO_EN = `As per your request to build a house at {location}, we hereby submit our estimate of the construction cost based on the building area and the specification, as follows:`;
export const DEFAULT_CLOSING_TH = `จึงเรียนมาเพื่อโปรดพิจารณา หากมีข้อสงสัยประการใด บริษัทฯ ยินดีให้คำชี้แจงเพิ่มเติม`;
export const DEFAULT_CLOSING_EN = `We submit this for your consideration. Should you have any questions, we are pleased to provide further clarification.`;

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
