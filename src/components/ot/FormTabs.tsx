"use client";

import { useState } from "react";

/** Alterna entre "Generar OT de máquina" y "Generar orden suelta" en
 * /ot/nueva — los dos formularios llegan ya armados como children (uno
 * server, otro client) y este componente sólo decide cuál se ve. */
export function FormTabs({ maquina, suelta }: { maquina: React.ReactNode; suelta: React.ReactNode }) {
  const [tab, setTab] = useState<"maquina" | "suelta">("maquina");

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 bg-surface-muted rounded-md p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("maquina")}
          className={`text-sm font-medium px-3 py-1.5 rounded ${tab === "maquina" ? "bg-surface shadow-sm" : "text-foreground-muted"}`}
        >
          Máquina completa
        </button>
        <button
          type="button"
          onClick={() => setTab("suelta")}
          className={`text-sm font-medium px-3 py-1.5 rounded ${tab === "suelta" ? "bg-surface shadow-sm" : "text-foreground-muted"}`}
        >
          Conjunto o pieza suelta
        </button>
      </div>
      {tab === "maquina" ? maquina : suelta}
    </div>
  );
}
