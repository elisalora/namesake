"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full bg-pewter px-5 py-2.5 font-semibold text-white transition hover:brightness-110 print:hidden"
    >
      Save as PDF / Print
    </button>
  );
}
