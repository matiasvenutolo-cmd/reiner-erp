import { plantillaExcel } from "@/lib/data/importar";
import { getUsuarioActual } from "@/lib/session";

/** Plantilla del importador (reorganización 30/10 §6.2): dos hojas con un ejemplo cargado. */
export async function GET() {
  await getUsuarioActual();
  return new Response(new Uint8Array(plantillaExcel()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="REINER - plantilla piezas y hojas de ruta.xlsx"',
    },
  });
}
