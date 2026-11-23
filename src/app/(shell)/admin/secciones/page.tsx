import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { getParametros } from "@/lib/planning/datos";
import { guardarParametroAction, guardarJornadaAction } from "@/app/actions/v2";

export const dynamic = "force-dynamic";

/** Admin → Configuración (mejoras 22/11): el horario del taller y las opciones del sistema. */
export default async function SeccionesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const params = await getParametros();
  const valor = (k: string) => params.filas.find((f) => f.clave === k)?.valor;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader titulo="Configuración" descripcion="El horario del taller y las opciones generales del sistema." />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <section className="tarjeta p-5 space-y-4">
        <h2 className="font-semibold">Opciones del sistema</h2>
        <form action={guardarParametroAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="clave" value="controlar_materia_prima" />
          <input type="hidden" name="volver" value="/admin/secciones" />
          <label className="flex-1 min-w-60">
            Controlar materia prima
            <select name="valor" defaultValue={valor("controlar_materia_prima") === "si" ? "si" : "no"} className="input block w-full mt-0.5">
              <option value="no">No: el paso &ldquo;Compras&rdquo; es informativo y no frena las tareas</option>
              <option value="si">Sí: una pieza sin materia prima queda &ldquo;Falta material&rdquo; hasta que llegue</option>
            </select>
            <span className="block text-xs text-foreground-muted mt-0.5">Con &ldquo;No&rdquo;, Stock muestra sólo Piezas terminadas y &ldquo;Qué hace falta&rdquo; no separa tengo / falta material.</span>
          </label>
          <button className="btn-secundario">Guardar</button>
        </form>
        <form action={guardarParametroAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="clave" value="entrada_plan" />
          <input type="hidden" name="volver" value="/admin/secciones" />
          <label className="flex-1 min-w-60">
            Cómo entran las piezas al plan
            <select name="valor" defaultValue={params.entradaAutomatica ? "automatica" : "manual"} className="input block w-full mt-0.5">
              <option value="automatica">Solas: al confirmar la orden</option>
              <option value="manual">A mano: el jefe de planta las manda a producción desde Gestión</option>
            </select>
          </label>
          <button className="btn-secundario">Guardar</button>
        </form>
        <form action={guardarParametroAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="clave" value="exigir_plano" />
          <input type="hidden" name="volver" value="/admin/secciones" />
          <label className="flex-1 min-w-60">
            Exigir plano para que una pieza entre al plan
            <select name="valor" defaultValue={valor("exigir_plano") === "si" ? "si" : "no"} className="input block w-full mt-0.5">
              <option value="no">No</option>
              <option value="si">Sí: sin plano y revisión, la pieza queda trabada esperando a ingeniería</option>
            </select>
          </label>
          <button className="btn-secundario">Guardar</button>
        </form>
        {/* Tanda 2 (05/11): la carga de Gestión arranca desde la hora actual; fuera de horario, al día hábil siguiente. */}
        <form action={guardarJornadaAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="volver" value="/admin/secciones" />
          <label>
            Horario del taller: desde
            <input type="time" name="desde" defaultValue={valor("jornada_desde") ?? "07:00"} required className="input block mt-0.5" />
          </label>
          <label>
            hasta
            <input type="time" name="hasta" defaultValue={valor("jornada_hasta") ?? "16:00"} required className="input block mt-0.5" />
          </label>
          <span className="flex-1 min-w-60 text-xs text-foreground-muted">La carga de Gestión cuenta las horas que quedan del día: lo que se asigna después del cierre arranca al día hábil siguiente.</span>
          <button className="btn-secundario">Guardar</button>
        </form>
      </section>
    </div>
  );
}
