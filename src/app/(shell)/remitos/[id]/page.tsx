import Link from "next/link";
import { notFound } from "next/navigation";
import { getRemito } from "@/lib/data/remitos";
import { ImprimirButton } from "@/components/ImprimirButton";
import { AutoImprimir } from "@/components/AutoImprimir";
import { HojaRemito } from "@/components/logistica/HojaRemito";

export default async function RemitoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imprimir?: string }>;
}) {
  const { id } = await params;
  const { imprimir } = await searchParams;
  const remito = await getRemito(id);
  if (!remito) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Recién confirmado desde la vista previa: se guardó y se abre la impresión. */}
      {imprimir === "1" && <AutoImprimir />}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/remitos" className="text-sm text-accent hover:underline">
          ← Remitos
        </Link>
        <ImprimirButton />
      </div>

      <HojaRemito
        numero={remito.numero}
        fecha={new Date(remito.fecha)}
        destino={remito.destino}
        usuarioNombre={remito.usuarioNombre}
        tecnico={remito.tecnico}
        observacion={remito.observacion}
        items={remito.items.map((it) => ({
          clave: it.id,
          codigo: it.piezaCodigo,
          nombre: it.piezaNombre,
          tratamiento: it.tratamiento,
          cantidad: it.cantidad,
        }))}
      />
    </div>
  );
}
