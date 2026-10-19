import { getUsuarioActual } from "@/lib/session";
import { PantallaOperario } from "@/components/operario/PantallaOperario";

export const dynamic = "force-dynamic";

/** Una pieza elegida a mano (desde "todas las piezas de mis centros" o desde una pausa): el mismo flujo de un botón por paso. */
export default async function TareaDePiezaPage({ params, searchParams }: { params: Promise<{ otPiezaId: string }>; searchParams: Promise<{ error?: string; ok?: string; listo?: string }> }) {
  const [{ otPiezaId }, { error, ok, listo }, usuario] = await Promise.all([params, searchParams, getUsuarioActual()]);
  // Después de terminar, vuelve a la pantalla principal para que aparezca sola la siguiente.
  return <PantallaOperario usuarioId={usuario.id} nombre={usuario.nombre} volver={listo ? "/taller" : `/taller/${otPiezaId}`} otPiezaId={listo ? undefined : otPiezaId} listo={listo} error={error} ok={ok} />;
}
