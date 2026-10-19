import Link from "next/link";
import { notFound } from "next/navigation";
import { and, inArray, isNull, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { registroOperacion, usuario } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { ajustarAHabil } from "@/lib/planning/calendario";
import { hoyISO } from "@/lib/fecha";
import { capitalizar, horas, numero } from "@/lib/formato";
import { PantallaOperario } from "@/components/operario/PantallaOperario";
import { ConexionPlanta, Motivos } from "@/components/operario/Planta";
import { Icono } from "@/components/ui/Icono";

export const dynamic = "force-dynamic";

/**
 * Pantalla fija de un centro (mejoras de usabilidad §3.7): la cola del centro;
 * al tocar Empezar se elige quién la hace. Sirve cuando varias personas usan
 * la misma máquina en distintos turnos. Con ?quien= muestra el flujo de ese operario.
 */
export default async function PantallaCentroPage({ params, searchParams }: { params: Promise<{ centroId: string }>; searchParams: Promise<{ quien?: string; error?: string; ok?: string; listo?: string }> }) {
  const [{ centroId }, sp] = await Promise.all([params, searchParams]);
  const plan = await getPlan();
  const centro = plan.centros.find((c) => c.id === centroId);
  if (!centro) notFound();
  const base = `/taller/centro/${centroId}`;

  if (sp.quien) {
    const [op] = await db.select().from(usuario).where(eq(usuario.id, sp.quien));
    if (!op) notFound();
    return (
      <div className="space-y-3">
        <Link href={base} className="block max-w-xl mx-auto text-[15px] text-accent">
          ← Pantalla de {centro.nombre}
        </Link>
        <PantallaOperario usuarioId={op.id} nombre={op.nombre} como={op.id} volver={`${base}?quien=${op.id}`} listo={sp.listo} error={sp.error} ok={sp.ok} />
      </div>
    );
  }

  const hoy = ajustarAHabil(hoyISO(), plan.entrada.calendario);
  const cola = plan.resultado.tareas
    .filter((t) => t.tipo === "interno" && t.centroId === centroId && t.fechaPlan && t.fechaPlan <= hoy && ["lista", "liberada", "en_curso", "pausada"].includes(t.estado))
    .sort((a, b) => Number(b.estado === "lista") - Number(a.estado === "lista") || a.holgura - b.holgura);
  const abiertos = cola.length
    ? await db
        .select({ r: registroOperacion, nombre: usuario.nombre })
        .from(registroOperacion)
        .innerJoin(usuario, eq(usuario.id, registroOperacion.usuarioId))
        .where(and(isNull(registroOperacion.fin), inArray(registroOperacion.otPiezaId, cola.map((t) => t.otPiezaId))))
    : [];
  const operarios = centro.operarios.map((o) => ({ valor: o.id, label: o.nombre }));

  return (
    <div className="planta max-w-xl mx-auto space-y-4">
      <ConexionPlanta />
      <h1 className="text-2xl font-bold">Pantalla de {centro.nombre}</h1>
      {sp.error && <div role="alert" className="rounded-xl bg-rojo-bg border border-rojo-borde px-4 py-3 text-rojo-fg font-medium">{sp.error}</div>}
      {abiertos.map(({ r, nombre }) => {
        const t = cola.find((x) => x.otPiezaId === r.otPiezaId);
        return (
          <Link key={r.id} href={`${base}?quien=${r.usuarioId}`} className="tarjeta flex items-center justify-between gap-3 px-5 py-4 border-l-4 border-l-naranja">
            <span>
              <span className="block text-[15px] text-foreground-muted">En curso · {nombre}</span>
              <span className="text-lg font-semibold">{capitalizar(t?.piezaNombre ?? "")}</span>
            </span>
            <span className="text-accent font-semibold">Seguir →</span>
          </Link>
        );
      })}
      {cola.filter((t) => !abiertos.some((a) => a.r.otPiezaId === t.otPiezaId)).length === 0 ? (
        <p className="tarjeta p-5 text-center">No hay tareas para este centro hoy. Avisale al jefe de planta.</p>
      ) : (
        <ul className="space-y-3">
          {cola
            .filter((t) => !abiertos.some((a) => a.r.otPiezaId === t.otPiezaId))
            .map((t, i) => (
              <li key={t.clave} className={`tarjeta p-4 space-y-3 ${i === 0 ? "border-2 border-accent" : ""}`}>
                <div>
                  <div className="text-[22px] font-bold leading-tight">
                    {capitalizar(t.piezaNombre)} × {numero(t.cantidad)}
                  </div>
                  <div className="text-[15px] text-foreground-muted">
                    {t.paso} · paso {t.posicion} de {t.totalPasos} · {horas(t.horas)}
                    {t.estado !== "lista" ? " · espera el paso anterior" : ""}
                  </div>
                </div>
                {t.estado === "lista" && operarios.length > 0 && (
                  <Motivos
                    accion="empezar"
                    campos={{ otPiezaId: t.otPiezaId, operacionId: t.operacionId, tipo: "setup", volver: base }}
                    nombre="como"
                    motivos={operarios}
                    titulo="¿Quién la hace?"
                    principal={i === 0}
                    boton={
                      <>
                        <Icono nombre="empezar" className="w-5 h-5" /> Empezar
                      </>
                    }
                  />
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
