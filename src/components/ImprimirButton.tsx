"use client";

export function ImprimirButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden bg-accent text-accent-foreground font-medium text-sm px-4 py-2 rounded-md hover:opacity-90"
    >
      Imprimir
    </button>
  );
}
