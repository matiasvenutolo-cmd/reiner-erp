import { getUsuarioDePlanta } from "@/lib/session";
import { getGrillaTiempos } from "@/lib/data/grilla-tiempos";

/** Exporta la grilla de tiempos en CSV (separado por ;) para completarla en Excel y volver a importarla. */
export async function GET(req: Request) {
  await getUsuarioDePlanta();
  const url = new URL(req.url);
  const config = url.searchParams.get("config") ?? "";
  const filas = await getGrillaTiempos(config, url.searchParams.get("conjunto"));
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
  const lineas = ["id_paso;pieza;nombre;paso;setup_min;min_por_unidad"];
  for (const p of filas) for (const s of p.pasos) if (s.tipo === "interno") lineas.push([esc(s.id), esc(p.codigo), esc(p.nombre), esc(`${s.secuencia}. ${s.proceso}`), num(s.setupMin), num(s.minPorUnidad)].join(";"));
  return new Response("﻿" + lineas.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tiempos-${config}.csv"` },
  });
}
