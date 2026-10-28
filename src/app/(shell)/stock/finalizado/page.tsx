import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import Link from "next/link";
import { Vacio } from "@/components/ui/Aviso";
import { Codigo } from "@/components/ui/Codigo";
import { Etiqueta, ESTADO_STOCK } from "@/components/ui/Etiqueta";
import { capitalizar, numero } from "@/lib/formato";
import { getPiezasFinalizadas } from "@/lib/data/stock";
import { getConjuntos, getConfiguraciones } from "@/lib/data/maestros";
import { FiltrosStock } from "@/components/FiltrosStock";

export const dynamic = "force-dynamic";

export default async function StockFinalizadoPage({
  searchParams,
}: {
  searchParams: Promise<{ conjunto?: string; maquina?: string; tipo?: string; estado?: string }>;
}) {
  const { conjunto, maquina, tipo, estado } = await searchParams;
  const tipoFiltro = tipo === "fabricada" || tipo === "comprada" ? tipo : undefined;

  const [todasPiezas, conjuntos, configuraciones] = await Promise.all([
    getPiezasFinalizadas({ conjuntoId: conjunto, configuracionId: maquina, tipo: tipoFiltro }),
    getConjuntos(),
    getConfiguraciones(),
  ]);
  // Desde las tarjetas del resumen: sólo lo libre o sólo lo asignado (§2.6).
  const piezas = todasPiezas.filter((p) => (estado === "libre" ? p.disponible - p.comprometido > 0 : estado === "asignada" ? p.comprometido > 0 : true));
  const totalUnidades = piezas.reduce((sum, p) => sum + p.disponible, 0);
  const totalComprometido = piezas.reduce((sum, p) => sum + p.comprometido, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Stock"
        descripcion={`Almacén: existencias físicas reales. ${piezas.length} pieza${piezas.length === 1 ? "" : "s"} distinta${piezas.length === 1 ? "" : "s"} · ${totalUnidades} unidades, ${totalComprometido} reservadas para una orden.`}
      >
        <PestanasStock actual={tipoFiltro ? `/stock/finalizado?tipo=${tipoFiltro}` : "/stock/finalizado"} />
      </PageHeader>

      <FiltrosStock
        conjuntos={conjuntos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        configuraciones={configuraciones.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />

      {estado && (
        <p className="text-sm">
          Mostrando sólo lo {estado === "libre" ? "libre" : "reservado para una orden"}.{" "}
          <Link href={`/stock/finalizado${tipoFiltro ? `?tipo=${tipoFiltro}` : ""}`} className="text-accent hover:underline">
            Ver todo
          </Link>
        </p>
      )}
      {piezas.length === 0 ? (
        <Vacio neutro>No hay piezas con stock que coincidan con el filtro.</Vacio>
      ) : (
        <ul className="tarjeta divide-y divide-border">
          {piezas.map((p) => {
            const libre = p.disponible - p.comprometido;
            return (
              <li key={p.piezaId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                <div className="flex-1 min-w-48">
                  <Link href={`/stock/pieza/${p.piezaId}`} className="font-medium hover:text-accent hover:underline">
                    {capitalizar(p.piezaNombre)}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Codigo valor={p.piezaCodigo} />
                    <span className="text-xs text-foreground-muted">{p.conjuntoNombre}</span>
                    {p.tipo === "comprada" && <span className="text-xs text-foreground-muted">· se compra</span>}
                  </div>
                </div>
                <span className="text-sm tabular-nums">{numero(p.disponible)} en almacén</span>
                <span className="flex gap-1.5">
                  {libre > 0 && <Etiqueta tono={ESTADO_STOCK.libre.tono} sinIcono>{numero(libre)} libre{libre === 1 ? "" : "s"}</Etiqueta>}
                  {p.comprometido > 0 && <Etiqueta tono={ESTADO_STOCK.asignada.tono} sinIcono>{numero(p.comprometido)} asignada{p.comprometido === 1 ? "" : "s"}</Etiqueta>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
