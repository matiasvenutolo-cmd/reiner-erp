import { getCierreOrden } from "@/lib/data/armado";
import { registrarControlArmadoAction } from "@/app/actions/armado";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";

const fecha = (d: Date) => d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });

/**
 * Fallas 26/11 — Cierre de la orden (checkout). Cuando todas las piezas están terminadas, el jefe de planta registra
 * el control final: armado y funcionamiento de cada conjunto o, en una orden de una pieza, el control de calidad
 * final. Con OK el conjunto entra a Productos terminados (y sus piezas salen del stock); con todo OK la orden queda
 * terminada. Queda quién lo hizo y cuándo.
 */
export async function CierreOrden({ otMaquinaId, puedeRegistrar }: { otMaquinaId: string; puedeRegistrar: boolean }) {
  const c = await getCierreOrden(otMaquinaId);
  if (!c.listo && !c.conjuntos.some((x) => x.controles.length)) return null;
  const titulo = c.esPieza ? "Control de calidad final" : "Armado y funcionamiento";
  return (
    <section className={`tarjeta p-5 space-y-4 ${c.completo ? "" : "border-accent"}`}>
      <div>
        <h2 className="text-lg font-semibold">Cierre de la orden</h2>
        <p className="text-sm text-foreground-muted">
          {c.completo
            ? "Orden cerrada: el control final está registrado."
            : c.esPieza
              ? "Todas las piezas están terminadas. Falta el control de calidad final para cerrar la orden."
              : "Todas las piezas están terminadas. Falta el control final de armado y funcionamiento: con OK, el conjunto entra a Productos terminados y la orden se cierra."}
        </p>
      </div>
      <ul className="space-y-3">
        {c.conjuntos.map((x) => (
          <li key={x.otConjuntoId} className="border border-border rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {c.esPieza ? titulo : `${x.codigo} ${x.nombre} · ${titulo}`}
              </span>
              {x.ok ? <span className="badge-estado bg-verde text-white">Funciona OK</span> : !x.terminado && <span className="badge-estado bg-gris-bg text-gris-fg">Faltan piezas</span>}
            </div>
            {x.controles.length > 0 && (
              <ul className="text-sm space-y-0.5">
                {x.controles.map((k) => (
                  <li key={k.id} className={k.resultado === "ok" ? "text-verde-fg" : "text-rojo-fg"}>
                    {k.resultado === "ok" ? "OK" : "NO OK"} · {k.revisadoPorNombre} · {fecha(k.fecha)}
                    {k.observacion ? ` — ${k.observacion}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {!x.ok && x.terminado && (puedeRegistrar ? (
              <form action={registrarControlArmadoAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="otMaquinaId" value={otMaquinaId} />
                <input type="hidden" name="otConjuntoId" value={x.otConjuntoId} />
                <label className="text-sm">
                  Resultado
                  <select name="resultado" required defaultValue="" className="input block mt-0.5">
                    <option value="" disabled>
                      Elegí…
                    </option>
                    <option value="ok">{c.esPieza ? "OK" : "Funciona OK"}</option>
                    <option value="no_ok">NO OK</option>
                  </select>
                </label>
                <label className="text-sm flex-1 min-w-48">
                  Observación
                  <input name="observacion" placeholder="Qué se controló, qué se encontró" className="input block mt-0.5 w-full" />
                </label>
                <ConfirmarBoton mensaje="¿Registrar el control final? Con OK el conjunto entra a Productos terminados y, si es el último, la orden se cierra.">Registrar control</ConfirmarBoton>
              </form>
            ) : (
              <p className="text-sm text-foreground-muted">El control final lo registra el jefe de planta.</p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
