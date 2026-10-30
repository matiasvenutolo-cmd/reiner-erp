import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { GRUPO_LABEL, seccionesConfigurables, seccionVisible } from "@/lib/nav";
import { getVisibilidadSecciones } from "@/lib/data/secciones";
import { getParametros } from "@/lib/planning/datos";
import { guardarSeccionesAction } from "@/app/actions/admin";
import { guardarParametroAction } from "@/app/actions/v2";

export const dynamic = "force-dynamic";

/**
 * Mostrar u ocultar secciones (reorganización 30/10 §1): un interruptor por sección del menú, para volver a
 * mostrar cualquiera sin tocar código. Ocultar una sección la saca del menú; la pantalla sigue existiendo.
 * Abajo, las opciones del sistema que antes estaban en "Datos de demo".
 */
export default async function SeccionesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [visibilidad, params] = await Promise.all([getVisibilidadSecciones(), getParametros()]);
  const secciones = seccionesConfigurables();
  const grupos = [...new Set(secciones.map((s) => s.grupo))];
  const valor = (k: string) => params.filas.find((f) => f.clave === k)?.valor;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader titulo="Mostrar u ocultar secciones" descripcion="Qué se ve en el menú. Lo oculto no se borra: la pantalla sigue andando y se vuelve a mostrar tildándola acá." />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <form action={guardarSeccionesAction} className="tarjeta p-5 space-y-5">
        {grupos.map((g) => (
          <fieldset key={g ?? "general"}>
            <legend className="text-sm font-semibold mb-2">{g ? GRUPO_LABEL[g] : "General"}</legend>
            <ul className="space-y-1.5">
              {secciones
                .filter((s) => s.grupo === g)
                .map((s) => (
                  <li key={s.href}>
                    <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                      <input type="checkbox" name="visible" value={s.href} defaultChecked={seccionVisible(s.href, visibilidad)} className="mt-1" />
                      <span>
                        <span className="font-medium">{s.label}</span>
                        {s.ocultaPorDefecto && <span className="text-xs text-foreground-muted"> · oculta por defecto</span>}
                        {s.ayuda && <span className="block text-xs text-foreground-muted">{s.ayuda}</span>}
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
          </fieldset>
        ))}
        <button className="btn">Guardar el menú</button>
      </form>

      <section className="tarjeta p-5 space-y-4">
        <h2 className="font-semibold">Opciones del sistema</h2>
        <form action={guardarParametroAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="clave" value="entrada_plan" />
          <input type="hidden" name="volver" value="/admin/secciones" />
          <label className="flex-1 min-w-60">
            Cómo entran las piezas al plan
            <select name="valor" defaultValue={params.entradaAutomatica ? "automatica" : "manual"} className="input block w-full mt-0.5">
              <option value="automatica">Solas: al confirmar la orden</option>
              <option value="manual">A mano, por tandas desde Entrada al plan</option>
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
      </section>
    </div>
  );
}
