import { asc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { feriado, ausencia, usuario } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { fechaCorta } from "@/components/v2/Plan";
import { agregarFeriadoAction, quitarFeriadoAction, agregarAusenciaAction, quitarAusenciaAction } from "@/app/actions/v2";
import { hoyISO } from "@/lib/fecha";

export const dynamic = "force-dynamic";

/** Calendario: días no laborables (feriados y cierres de planta) y ausencias de operarios. Todo resta capacidad al plan. */
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const hoy = hoyISO();
  const [dias, ausencias, operarios] = await Promise.all([
    db.select().from(feriado).where(gte(feriado.fecha, hoy)).orderBy(asc(feriado.fecha)),
    db.select({ a: ausencia, nombre: usuario.nombre }).from(ausencia).innerJoin(usuario, eq(usuario.id, ausencia.usuarioId)).where(gte(ausencia.hasta, hoy)).orderBy(asc(ausencia.desde)),
    db.select().from(usuario).where(eq(usuario.rol, "operario")).orderBy(usuario.nombre),
  ]);
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader titulo="Calendario" descripcion="Los días que no se trabaja y quién falta. El plan los saltea solo: un feriado no tiene capacidad y una ausencia le resta horas al centro del operario." />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="grid lg:grid-cols-2 gap-6 items-start [&>*]:min-w-0">
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Feriados y cierres de planta</h2>
          <form action={agregarFeriadoAction} className="tarjeta p-3 flex flex-wrap items-end gap-2 text-sm">
            <label>
              Fecha
              <input type="date" name="fecha" required className="input block mt-0.5" />
            </label>
            <label className="flex-1 min-w-40">
              Motivo
              <input name="nombre" required placeholder="ej. Vacaciones de planta" className="input block w-full mt-0.5" />
            </label>
            <select name="tipo" className="input" aria-label="Tipo">
              <option value="cierre">Cierre de planta</option>
              <option value="nacional">Feriado</option>
            </select>
            <button className="btn">Agregar</button>
          </form>
          <ul className="tarjeta divide-y divide-border text-sm">
            {dias.map((d) => (
              <li key={d.fecha} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <strong className="tabular-nums">{fechaCorta(d.fecha)}</strong> {d.fecha.slice(0, 4)} · {d.nombre}
                  {d.tipo === "cierre" && <span className="badge-estado badge-alerta ml-2">cierre</span>}
                </span>
                <form action={quitarFeriadoAction}>
                  <input type="hidden" name="fecha" value={d.fecha} />
                  <button className="text-xs text-foreground-muted hover:text-rojo-fg">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Ausencias</h2>
          <form action={agregarAusenciaAction} className="tarjeta p-3 grid grid-cols-2 gap-2 text-sm">
            <label className="col-span-2">
              Operario
              <select name="usuarioId" required className="input block w-full mt-0.5">
                {operarios.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <input type="date" name="desde" required className="input block w-full mt-0.5" />
            </label>
            <label>
              Hasta
              <input type="date" name="hasta" className="input block w-full mt-0.5" />
            </label>
            <label className="col-span-2">
              Motivo
              <input name="motivo" placeholder="ej. Vacaciones, licencia, curso" className="input block w-full mt-0.5" />
            </label>
            <button className="btn col-span-2">Cargar ausencia</button>
          </form>
          {ausencias.length === 0 ? (
            <p className="text-sm text-foreground-muted">No hay ausencias cargadas.</p>
          ) : (
            <ul className="tarjeta divide-y divide-border text-sm">
              {ausencias.map(({ a, nombre }) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <strong>{nombre}</strong> · {fechaCorta(a.desde)}
                    {a.hasta !== a.desde ? ` al ${fechaCorta(a.hasta)}` : ""}
                    {a.motivo ? ` · ${a.motivo}` : ""}
                  </span>
                  <form action={quitarAusenciaAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmarBoton mensaje="¿Quitar la ausencia?" className="text-xs text-foreground-muted hover:text-rojo-fg">
                      Quitar
                    </ConfirmarBoton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
