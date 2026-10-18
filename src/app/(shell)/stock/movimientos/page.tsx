import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import { listarMovimientos } from "@/lib/data/logistica";
import { MovimientosTabla } from "@/components/MovimientosTabla";

export const dynamic = "force-dynamic";

/** Todos los movimientos de stock, del más nuevo al más viejo. No se borran: un error se corrige con un ajuste. */
export default async function MovimientosPage() {
  const movimientos = await listarMovimientos(undefined, 200);
  return (
    <div className="space-y-5">
      <PageHeader titulo="Stock" descripcion="Cada ingreso, egreso, retiro y ajuste, con quién lo hizo y cuándo. Los movimientos no se borran: un error se corrige con un ajuste.">
        <PestanasStock actual="/stock/movimientos" />
      </PageHeader>
      <MovimientosTabla movimientos={movimientos} />
    </div>
  );
}
