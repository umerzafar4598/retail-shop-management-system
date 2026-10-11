"use client";

export default function PrintReceiptButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-muted print:hidden">
      Print receipt
    </button>
  );
}
