import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { getOperacionesAbiertas } from "@/lib/data/ejecucion";
import { getTareasDelOperario, type FilaGestion } from "@/lib/data/gestion";

export const dynamic = "force-dynamic";

export default async function TallerPage() {
  const usuario = await getUsuarioActual();
  const abiertas = await getOperacionesAbiertas(usuario.id);
  const enCurso = abiertas.find((a) => !a.pausada);
  if (enCurso) redirect(`/taller/${enCurso.otPiezaId}`);
  const pausadas = abiertas.filter((a) => a.pausada);
  const otPiezaIdsPausadas = new Set(pausadas.map((p) => p.otPiezaId));

  // Fallas 26/11: la misma lista que la tablet (la cola de Gestión de sus centros, en ese orden). Así no aparecen
  // piezas dadas de baja (scrap) ni pasos de otros centros o tercerizados.
  const pendientes = (await getTareasDelOperario(usuario.id)).filter((f) => !otPiezaIdsPausadas.has(f.otPiezaId));
  const ESTADO: Partial<Record<FilaGestion["estado"], { texto: string; clase: string }>> = {
    asignada: { texto: "Lista para producir", clase: "bg-accent text-accent-foreground" },
    sin_asignar: { texto: "Lista · sin asignar", clase: "bg-accent-soft text-accent-hover" },
    en_curso: { texto: "Produciendo", clase: "bg-verde text-white" },
    espera: { texto: "Espera paso anterior", clase: "bg-gris-bg text-gris-fg" },
    trabada: { texto: "Trabada", clase: "bg-rojo text-white" },
  };
  const sePuede = (f: FilaGestion) => f.estado === "asignada" || f.estado === "sin_asignar" || f.estado === "en_curso";

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <Link href="/taller" className="text-sm text-accent hover:underline">
          ← Mi próxima tarea
        </Link>
        <h1 className="text-xl font-semibold mt-1">Piezas de mis centros</h1>
        <p className="text-sm text-foreground-muted mt-1">La cola de tus centros, en el orden de Gestión: lo tuyo y lo que todavía no tiene operario.</p>
      </div>

      {pausadas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">En pausa ({pausadas.length})</h2>
          {pausadas.map((p) => (
            <Link
              key={p.id}
              href={`/taller/${p.otPiezaId}`}
              className="block bg-surface border border-naranja-borde rounded-xl p-4 hover:border-accent active:scale-[0.99] transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-foreground-muted">{p.otPiezaCodigo}</span>
                <span className="badge-estado badge-pendiente">En pausa · {p.tipo === "setup" ? "setup" : "fabricación"}</span>
              </div>
              <div className="font-semibold mt-1">{p.piezaNombre}</div>
              <div className="text-sm text-foreground-muted">Tocá para retomarla</div>
            </Link>
          ))}
        </div>
      )}

      {pendientes.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          No hay piezas pendientes de fabricar en este momento.
        </div>
      ) : (
        <div className="space-y-2">
          {pausadas.length > 0 && <h2 className="text-sm font-semibold pt-2">Para empezar</h2>}
          {pendientes.map((f) => {
            const e = ESTADO[f.estado] ?? { texto: f.estado, clase: "bg-gris-bg text-gris-fg" };
            const cuerpo = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-foreground-muted">{f.codigo}</span>
                  <span className={`badge-estado ${e.clase}`}>{e.texto}</span>
                </div>
                <div className="font-semibold mt-1">
                  {f.pieza.charAt(0).toUpperCase() + f.pieza.slice(1)} × {f.cantidad}
                </div>
                <div className="text-sm text-foreground-muted">
                  {f.paso} · paso {f.posicion} de {f.totalPasos}
                </div>
                {f.estado === "trabada" && f.motivo && <div className="text-xs text-rojo-fg mt-0.5">{f.motivo}</div>}
                <div className="text-xs text-foreground-muted">{f.orden}</div>
              </>
            );
            return sePuede(f) ? (
              <Link key={f.clave} href={`/taller/${f.otPiezaId}`} className="block bg-surface border border-border rounded-xl p-4 hover:border-accent active:scale-[0.99] transition">
                {cuerpo}
              </Link>
            ) : (
              <div key={f.clave} className="bg-surface-muted border border-border rounded-xl p-4 text-foreground-muted">
                {cuerpo}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
