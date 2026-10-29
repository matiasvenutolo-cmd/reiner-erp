import { db } from "@/lib/db/client";
import { parametro } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { demoAction, guardarParametroAction } from "@/app/actions/v2";

export const dynamic = "force-dynamic";

const ETIQUETA: Record<string, string> = {
  horizonte_liberacion: "Con entrada a mano: cuántos días hábiles antes de empezar se propone pasar una pieza al plan",
  exigir_plano: "Exigir plano para que una pieza entre al plan (si / no)",
};

/** Datos de demo y parámetros: carga un escenario para mostrar el sistema funcionando y lo borra sin tocar los datos reales. */
export default async function DemoPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const parametros = await db.select().from(parametro).orderBy(parametro.clave);
  const entradaPlan = parametros.find((p) => p.clave === "entrada_plan")?.valor === "manual" ? "manual" : "automatica";
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader titulo="Datos de demo y parámetros" descripcion="Un escenario de prueba para ver el plan funcionando con conflictos reales, y los parámetros generales del sistema." />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <section className="tarjeta p-5 space-y-3">
        <h2 className="font-semibold">Escenario de demo</h2>
        <ul className="text-sm list-disc pl-5 space-y-1 text-foreground-muted">
          <li>OTM006 activa con entrega a 4 meses de su emisión.</li>
          <li>Una segunda máquina PS-120i para un cliente de prueba, con prioridad alta y entrega ajustada: compite por los mismos centros.</li>
          <li>Una orden para stock de 150 piezas.</li>
          <li>Vacaciones de un operario, precios de servicios de tercerizados y materias primas en stock.</li>
        </ul>
        <p className="text-sm">Todo lo que carga queda marcado como <span className="badge-estado bg-demo-bg text-demo-fg">demo</span> y se borra con un botón, sin tocar los datos reales.</p>
        <div className="flex flex-wrap gap-2">
          <form action={demoAction}>
            <input type="hidden" name="que" value="cargar" />
            <button className="btn">Cargar escenario de demo</button>
          </form>
          <form action={demoAction}>
            <input type="hidden" name="que" value="borrar" />
            <ConfirmarBoton mensaje="¿Borrar todos los datos de demo? Los datos reales no se tocan." className="btn-secundario">
              Borrar datos de demo
            </ConfirmarBoton>
          </form>
          <form action={demoAction}>
            <input type="hidden" name="que" value="estimaciones" />
            <ConfirmarBoton mensaje="¿Volver a sembrar los tiempos y secuencias estimados? No toca lo que REINER ya definió." className="btn-secundario">
              Volver a sembrar datos estimados
            </ConfirmarBoton>
          </form>
        </div>
      </section>

      <section className="tarjeta p-5 space-y-3">
        <h2 className="font-semibold">Parámetros</h2>
        {/* Simplificación §4.3: la entrada al plan es automática; este interruptor vuelve a la liberación manual por tandas. */}
        <form action={guardarParametroAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="clave" value="entrada_plan" />
          <label className="flex-1 min-w-60">
            Cómo entran las piezas al plan
            <select name="valor" defaultValue={entradaPlan} className="input block w-full mt-0.5">
              <option value="automatica">Solas: al confirmar la orden, con material (y plano, si se exige)</option>
              <option value="manual">A mano, por tandas desde Entrada al plan</option>
            </select>
          </label>
          <button className="btn-secundario">Guardar</button>
        </form>
        {parametros.filter((p) => p.clave !== "entrada_plan").map((p) => (
          <form key={p.clave} action={guardarParametroAction} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="clave" value={p.clave} />
            <label className="flex-1 min-w-60">
              {ETIQUETA[p.clave] ?? p.clave}
              <input name="valor" defaultValue={p.valor} className="input block w-full mt-0.5" />
              {p.nota && <span className="block text-xs text-foreground-muted mt-0.5">{p.nota}</span>}
            </label>
            <button className="btn-secundario">Guardar</button>
          </form>
        ))}
      </section>
    </div>
  );
}
