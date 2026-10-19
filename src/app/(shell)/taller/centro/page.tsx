import Link from "next/link";
import { getPlan } from "@/lib/planning/datos";
import { Icono } from "@/components/ui/Icono";

export const dynamic = "force-dynamic";

/** Elegir la pantalla fija de un centro (la tablet que queda en la máquina). Se entra una vez y queda abierta. */
export default async function ElegirCentroPage() {
  const { centros } = await getPlan();
  return (
    <div className="planta max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Pantalla de un centro</h1>
      <p className="text-foreground-muted">Para la tablet que queda fija en la máquina. Elegí el centro y dejala abierta: cada uno elige quién hace la tarea al empezar.</p>
      <div className="grid gap-3">
        {centros.map((c) => (
          <Link key={c.id} href={`/taller/centro/${c.id}`} className="tarjeta flex items-center justify-between px-5 min-h-14 text-lg font-semibold">
            {c.nombre}
            <Icono nombre="derecha" className="w-5 h-5 text-foreground-muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}
