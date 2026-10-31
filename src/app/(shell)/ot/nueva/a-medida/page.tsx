import { PageHeader } from "@/components/ui/PageHeader";
import { PiezaAMedidaForm } from "@/components/asistente/PiezaAMedidaForm";
import { opcionesPiezaAMedida, MAX_PASOS } from "@/lib/data/pieza-a-medida";
import { hoyISO } from "@/lib/fecha";

export const dynamic = "force-dynamic";

/** "+ Generar orden" → Pieza nueva a medida (reorganización 30/10 §2.4). */
export default async function PiezaAMedidaPage() {
  const { procesos, centros, clientes } = await opcionesPiezaAMedida();
  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        migas={[{ href: "/proyectos", label: "Órdenes" }, { href: "/ot/nueva", label: "Generar orden" }, { label: "Pieza nueva a medida" }]}
        titulo="Pieza nueva a medida"
        descripcion="Una pieza que no es de ninguna máquina de REINER (por ejemplo, un repuesto para una máquina de otro fabricante): se carga con su hoja de ruta y la orden queda confirmada en el mismo momento."
      />
      <PiezaAMedidaForm procesos={procesos} centros={centros} clientes={clientes} maxPasos={MAX_PASOS} hoy={hoyISO()} />
    </div>
  );
}
