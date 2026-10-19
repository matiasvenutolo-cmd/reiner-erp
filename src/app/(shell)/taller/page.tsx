import { getUsuarioActual } from "@/lib/session";
import { PantallaOperario } from "@/components/operario/PantallaOperario";

export const dynamic = "force-dynamic";

/**
 * Mi próxima tarea (operario, tablet o celular): una sola tarea grande con un
 * botón principal por paso, el avance del día y la cola. Sale del plan
 * confirmado por el jefe de planta; si todavía no está confirmado, muestra el
 * propuesto con una franja que lo avisa (mejoras de usabilidad §1.8 y §3).
 */
export default async function MiProximaTareaPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; listo?: string }> }) {
  const { error, ok, listo } = await searchParams;
  const usuario = await getUsuarioActual();
  return <PantallaOperario usuarioId={usuario.id} nombre={usuario.nombre} volver="/taller" listo={listo} error={error} ok={ok} />;
}
