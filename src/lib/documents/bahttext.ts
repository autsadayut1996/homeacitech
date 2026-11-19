const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** Read 0 < n < 1,000,000. `hasHigher`: a non-zero digit exists in a higher position (→ "เอ็ด"). */
function readGroup(n: number, hasHigher: boolean): string {
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const place = s.length - 1 - i;
    if (d === 0) continue;
    if (place === 0 && d === 1 && (hasHigher || s.length > 1)) out += "เอ็ด";
    else if (place === 1 && d === 1) out += "สิบ";
    else if (place === 1 && d === 2) out += "ยี่สิบ";
    else out += DIGITS[d] + PLACES[place];
  }
  return out;
}

function readInt(n: number, hasHigher = false): string {
  if (n === 0) return "";
  if (n < 1_000_000) return readGroup(n, hasHigher);
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  return readInt(millions, hasHigher) + "ล้าน" + (rest ? readGroup(rest, true) : "");
}

/** Thai amount in words, e.g. 5,250,000.50 → "ห้าล้านสองแสนห้าหมื่นบาทห้าสิบสตางค์". */
export function bahtText(amount: number): string {
  const neg = amount < 0;
  const satangTotal = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  const prefix = neg ? "ลบ" : "";
  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";
  const b = baht ? readInt(baht) + "บาท" : "";
  return prefix + b + (satang ? readGroup(satang, false) + "สตางค์" : "ถ้วน");
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  return parts.join(" ");
}

/** English amount in words, e.g. "Five million two hundred fifty thousand baht only". */
export function bahtTextEn(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100);
  let n = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  if (n === 0 && satang === 0) return "Zero baht only";
  const scales = ["", "thousand", "million", "billion", "trillion"];
  const parts: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${under1000(chunk)}${scales[i] ? ` ${scales[i]}` : ""}`);
  }
  const words = parts.join(" ") + " baht" + (satang ? ` and ${under1000(satang)} satang` : " only");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
