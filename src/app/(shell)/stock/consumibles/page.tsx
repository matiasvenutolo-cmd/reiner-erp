import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import { Aviso } from "@/components/ui/Aviso";
import { TablaArticulos } from "@/components/v2/TablaArticulos";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  return (
    <div className="space-y-5">
      <PageHeader titulo="Stock" descripcion="Insertos, mechas, discos, lubricantes y elementos de protección. Se registra cada retiro.">
        <PestanasStock actual="/stock/consumibles" />
      </PageHeader>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <TablaArticulos tipo="consumible" />
    </div>
  );
}
