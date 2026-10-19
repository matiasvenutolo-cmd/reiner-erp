import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import { BuscadorPiezas } from "@/components/ui/BuscadorPiezas";
import { Vacio } from "@/components/ui/Aviso";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { getResumenWipEnCursoPorProceso, getResumenStockGeneral, getPiezasStockBajo } from "@/lib/data/stock";
import { getPedidosPendientes } from "@/lib/data/compras";
import { getPiezas } from "@/lib/data/maestros";
import { Codigo } from "@/components/ui/Codigo";
import { capitalizar, numero, plural } from "@/lib/formato";

// Datos en vivo (stock/producción cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

/**
 * Stock (mejoras de usabilidad §2.6): resumen con tarjetas que llevan a la
 * lista filtrada, buscador con autocompletado, lo que está en fabricación como
 * barra por etapa, y lo que quedó por debajo del mínimo.
 */
export default async function StockPage() {
  const [wip, resumen, stockBajo, pedidos, todasLasPiezas] = await Promise.all([getResumenWipEnCursoPorProceso(), getResumenStockGeneral(), getPiezasStockBajo(), getPedidosPendientes(), getPiezas()]);
  const enFabricacion = wip.reduce((sum, w) => sum + w.unidades, 0);
  const libre = resumen.unidadesFinalizadas - resumen.unidadesComprometidas;
  const wipOrdenado = [...wip].sort((a, b) => b.unidades - a.unidades);
  const maxEtapa = Math.max(1, ...wipOrdenado.map((w) => w.unidades));

  const tarjetas = [
    { label: "libres para usar", n: libre, href: "/stock/finalizado?estado=libre", tono: "verde" as const },
    { label: "asignadas a una orden", n: resumen.unidadesComprometidas, href: "/stock/finalizado?estado=asignada", tono: "azul" as const },
    { label: "en fabricación", n: enFabricacion, href: "/stock/en-proceso", tono: "naranja" as const },
    { label: "pedidas, por llegar", n: pedidos.length, href: "/pedir?vista=llegar", tono: "gris" as const },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Stock"
        descripcion="Cada unidad está libre (para cualquier orden), asignada a una orden, en fabricación o pedida al proveedor. Las etiquetas tienen el mismo color en todo el sistema."
      >
        <PestanasStock actual="/stock" />
      </PageHeader>

      <BuscadorPiezas piezas={todasLasPiezas.map((p) => ({ codigo: p.codigo, nombre: p.nombre }))} destino="/stock/pieza/" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tarjetas.map((t) => (
          <Link key={t.label} href={t.href} className="tarjeta p-4 hover:border-accent transition-colors">
            <div className="text-[32px] font-bold tabular-nums leading-none">{numero(t.n)}</div>
            <div className="mt-2">
              <Etiqueta tono={t.tono} sinIcono>
                {t.label}
              </Etiqueta>
            </div>
          </Link>
        ))}
      </div>

      <section id="minimo">
        <h2 className="text-lg font-semibold mb-2">Por debajo del mínimo</h2>
        {stockBajo.length === 0 ? (
          <Vacio>Ninguna pieza está por debajo del mínimo.</Vacio>
        ) : (
          <ul className="tarjeta divide-y divide-border">
            {stockBajo.map((p) => (
              <li key={p.piezaId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-48">
                  <Link href={`/stock/pieza/${p.piezaId}`} className="font-medium hover:text-accent hover:underline">
                    {capitalizar(p.piezaNombre)}
                  </Link>
                  <div>
                    <Codigo valor={p.piezaCodigo} />
                  </div>
                </div>
                <span className="text-sm tabular-nums">
                  <span className="text-rojo-fg font-semibold">{numero(p.disponible)}</span> de {numero(p.minimo)} mínimo
                </span>
                <Link href={`/ot/nueva?tipo=suelta&destino=stock&pieza=${encodeURIComponent(p.piezaId)}&cantidad=${Math.max(1, p.minimo - p.disponible)}`} className="btn-secundario btn-sm">
                  Fabricar para stock
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="etapas">
        <h2 className="text-lg font-semibold mb-2">En fabricación, por etapa</h2>
        {wipOrdenado.length === 0 ? (
          <Vacio neutro>No hay piezas en fabricación en este momento.</Vacio>
        ) : (
          <ul className="tarjeta p-4 space-y-2.5">
            {wipOrdenado.map((w) => (
              <li key={w.procesoId}>
                <Link href={`/stock/etapa/${w.procesoId}`} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 text-sm hover:text-accent">
                  <span className="truncate">{w.procesoNombre}</span>
                  <span className="h-3 rounded-full bg-surface-muted overflow-hidden">
                    <span className="block h-full rounded-full bg-naranja" style={{ width: `${(w.unidades / maxEtapa) * 100}%` }} />
                  </span>
                  <span className="tabular-nums text-right w-28">
                    {numero(w.unidades)} u. · {plural(w.piezas, "pieza")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
