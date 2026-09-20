import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getRemito } from "@/lib/data/remitos";
import { ImprimirButton } from "@/components/ImprimirButton";

export default async function RemitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const remito = await getRemito(id);
  if (!remito) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/remitos" className="text-sm text-accent hover:underline">
          ← Remitos
        </Link>
        <ImprimirButton />
      </div>

      <div className="bg-surface border border-border rounded-lg p-8 print:border-0 print:p-0 space-y-8">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <Image src="/reiner-logo.png" alt="REINER" width={140} height={30} priority />
            <p className="text-xs text-foreground-muted mt-1">REINER S.A. — San Martín, Bs. As.</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold">REMITO</div>
            <div className="font-mono text-xl">N° {String(remito.numero).padStart(4, "0")}</div>
            <div className="text-sm text-foreground-muted mt-1">
              {new Date(remito.fecha).toLocaleDateString("es-AR", { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-foreground-muted uppercase">Destino</div>
            <div className="font-medium">{remito.destino}</div>
          </div>
          <div>
            <div className="text-xs text-foreground-muted uppercase">Generado por</div>
            <div className="font-medium">{remito.usuarioNombre}</div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs uppercase text-foreground-muted">
            <tr>
              <th className="text-left py-2 font-medium">Código</th>
              <th className="text-left py-2 font-medium">Pieza</th>
              <th className="text-right py-2 font-medium">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="py-3 font-mono text-xs">{remito.piezaCodigo}</td>
              <td className="py-3">{remito.piezaNombre}</td>
              <td className="py-3 text-right tabular-nums">{remito.cantidad}</td>
            </tr>
          </tbody>
        </table>

        {remito.observacion && (
          <div className="text-sm">
            <div className="text-xs text-foreground-muted uppercase">Observaciones</div>
            <p>{remito.observacion}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 pt-12 text-sm text-center">
          <div className="border-t border-foreground-muted pt-2">Firma — entrega</div>
          <div className="border-t border-foreground-muted pt-2">Firma — recibe</div>
        </div>
      </div>
    </div>
  );
}
