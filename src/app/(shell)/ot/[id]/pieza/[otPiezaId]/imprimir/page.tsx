import Link from "next/link";
import { notFound } from "next/navigation";
import { getOtPieza } from "@/lib/data/ot";
import { ImprimirButton } from "@/components/ImprimirButton";
import { HojaOtPieza } from "@/components/ot/HojaOtPieza";

export default async function ImprimirOtPiezaPage({ params }: { params: Promise<{ id: string; otPiezaId: string }> }) {
  const { id, otPiezaId } = await params;
  const otPieza = await getOtPieza(otPiezaId);
  if (!otPieza) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/ot/${id}/pieza/${otPiezaId}`} className="text-sm text-accent hover:underline">
          ← {otPieza.codigo}
        </Link>
        <ImprimirButton />
      </div>
      <HojaOtPieza otPieza={otPieza} />
    </div>
  );
}
