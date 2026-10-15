import Link from "next/link";
import { crearCompraGeneralAction } from "@/app/actions/gestion-compras";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";

/** Compra general: algo que no sale de una orden de trabajo (insumos, herramientas…). Sigue el mismo circuito. */
export default async function NuevaCompraPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="max-w-2xl">
      <PageHeader
        migas={[{ href: "/compras", label: "Compras" }, { label: "Nueva compra general" }]}
        titulo="Nueva compra general"
        descripcion="Para lo que no sale de una orden de trabajo, como insumos o herramientas. Lo que necesita producción aparece solo en Compras."
      />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <form action={crearCompraGeneralAction} className="tarjeta p-5 space-y-4">
        <label className="block">
          <span className="etiqueta">Qué hay que comprar *</span>
          <input name="descripcion" required autoFocus placeholder="ej. Insertos de torneado CNMG 120408" className="input" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="etiqueta">Cantidad *</span>
            <input name="cantidad" type="number" step="any" min="0" required className="input" />
          </label>
          <label className="block">
            <span className="etiqueta">Unidad</span>
            <input name="unidad" placeholder="u., kg, m, cajas…" className="input" />
          </label>
        </div>
        <label className="block">
          <span className="etiqueta">¿Para cuándo se necesita?</span>
          <input name="fechaNecesidad" type="date" className="input w-48" />
        </label>
        <label className="block">
          <span className="etiqueta">Observaciones</span>
          <textarea name="observacion" rows={2} className="input resize-none" placeholder="Para qué es, quién lo pidió…" />
        </label>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className="btn">
            Crear compra
          </button>
          <Link href="/compras" className="text-sm text-foreground-muted hover:underline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
