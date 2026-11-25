"use client";

export function PrintButton() {
  return (
    <button className="btn-primary ml-auto" onClick={() => window.print()}>
      🖨 พิมพ์ / บันทึกเป็น PDF (A3)
    </button>
  );
}
