import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import { Aviso } from "@/components/ui/Aviso";
import { TablaArticulos } from "@/components/v2/TablaArticulos";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  return (
    <div className="space-y-5">
      <PageHeader titulo="Stock" descripcion="Barras, chapas, tubos y fundiciones en bruto. Entran por la recepción de Compras; lo asignado ya tiene orden.">
        <PestanasStock actual="/stock/materia-prima" />
      </PageHeader>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <TablaArticulos tipo="materia_prima" />
    </div>
  );
}
