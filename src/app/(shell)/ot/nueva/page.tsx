import { Aviso } from "@/components/ui/Aviso";
import { PageHeader } from "@/components/ui/PageHeader";
import { getConfiguraciones, getModelos, getConjuntos, getPiezasPorConfiguracion } from "@/lib/data/maestros";
import { getUsuarioActual } from "@/lib/session";
import { getClientes } from "@/lib/data/clientes";
import { crearOtMaquinaAction } from "@/app/actions/ot";
import { FormTabs } from "@/components/ot/FormTabs";
import { OrdenSueltaForm } from "@/components/ot/OrdenSueltaForm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getCalendario } from "@/lib/planning/datos";
import { sumarHabiles } from "@/lib/planning/calendario";
import { hoyISO } from "@/lib/fecha";

export const dynamic = "force-dynamic";

export default async function NuevaOtPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tipo?: string; destino?: string; pieza?: string; cantidad?: string; motivo?: string }>;
}) {
  const { error, tipo, destino, pieza: piezaInicial, cantidad, motivo } = await searchParams;
  const [configuraciones, modelos, usuario, clientes, conjuntosTodos] = await Promise.all([
    getConfiguraciones(),
    getModelos(),
    getUsuarioActual(),
    getClientes(),
    getConjuntos(),
  ]);
  const nombreConjunto = new Map(conjuntosTodos.map((c) => [c.id, c.nombre]));

  const piezasPorConfiguracionEntries = await Promise.all(
    configuraciones.map(async (c) => [c.id, await getPiezasPorConfiguracion(c.id)] as const),
  );
  const piezasPorConfiguracion: Record<string, { id: string; codigo: string; nombre: string; conjuntoId: string }[]> = {};
  const conjuntosPorConfiguracion: Record<string, { id: string; nombre: string }[]> = {};
  for (const [configuracionId, piezas] of piezasPorConfiguracionEntries) {
    piezasPorConfiguracion[configuracionId] = piezas.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      conjuntoId: p.conjuntoId,
    }));
    const conjuntoIds = [...new Set(piezas.map((p) => p.conjuntoId))];
    conjuntosPorConfiguracion[configuracionId] = conjuntoIds
      .map((id) => ({ id, nombre: nombreConjunto.get(id) ?? id }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  // v2 — precarga desde la ficha de Stock ("Fabricar") o la alerta de mínimo de Hoy.
  const configInicial = piezaInicial ? Object.entries(piezasPorConfiguracion).find(([, ps]) => ps.some((p) => p.id === piezaInicial))?.[0] : undefined;
  const libres = await db.execute<{ pieza_id: string; libre: number }>(sql`
    select s.pieza_id, (s.cantidad_disponible - coalesce((select sum(r.cantidad) from reserva_stock r where r.pieza_id = s.pieza_id), 0))::int libre
    from stock_pieza s where s.cantidad_disponible > 0`);
  const stockLibre = Object.fromEntries(libres.filter((l) => l.libre > 0).map((l) => [l.pieza_id, l.libre]));
  const fechaObjetivo = sumarHabiles(hoyISO(), 20, await getCalendario());

  const formaMaquina = (
    <div>
      <p className="text-sm text-foreground-muted mb-4">
        Se explota automáticamente a OT de conjunto y OT de pieza, cruzando contra el stock
        disponible. La cantidad a fabricar propuesta queda editable en el detalle.
      </p>
      <form action={crearOtMaquinaAction} className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <Field label="Configuración de máquina">
          <select name="configuracionId" required className="input">
            <option value="">Seleccionar…</option>
            {modelos.map((m) => (
              <optgroup key={m.id} label={m.nombre}>
                {configuraciones
                  .filter((c) => c.modeloId === m.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label="Número de serie">
          <input name="numeroSerie" required placeholder="ej. 6" className="input" />
        </Field>

        <Field label="Cliente">
          <select name="clienteId" required className="input">
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razonSocial}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Orden de compra">
            <input name="ordenCompra" placeholder="ej. 008" className="input" />
          </Field>
          <Field label="Plazo de entrega">
            <input name="plazoEntrega" placeholder="ej. 4 meses" className="input" />
          </Field>
        </div>

        <Field label="Emitido por">
          <input name="emitidoPor" required defaultValue={usuario.nombre} className="input" />
        </Field>

        <button
          type="submit"
          className="w-full bg-accent text-accent-foreground font-medium text-sm py-2.5 rounded-md hover:opacity-90"
        >
          Generar OT
        </button>
      </form>
    </div>
  );

  const formaSuelta = (
    <div>
      <p className="text-sm text-foreground-muted mb-4">
        Para cuando un cliente compra un repuesto o pide un conjunto para mantenimiento, sin
        que se trate de fabricar una máquina entera. No lleva número de serie real.
      </p>
      <OrdenSueltaForm
        configuraciones={configuraciones.map((c) => ({ id: c.id, nombre: c.nombre }))}
        clientes={clientes.map((c) => ({ id: c.id, razonSocial: c.razonSocial }))}
        usuarioNombre={usuario.nombre}
        conjuntosPorConfiguracion={conjuntosPorConfiguracion}
        piezasPorConfiguracion={piezasPorConfiguracion}
        inicial={{ destino: destino === "stock" ? "stock" : destino === "repuesto" ? "repuesto" : undefined, configuracionId: configInicial, piezaId: configInicial ? piezaInicial : undefined, cantidad: cantidad ? Number(cantidad) : undefined, motivo }}
        fechaObjetivo={fechaObjetivo}
        stockLibre={stockLibre}
      />
    </div>
  );

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        migas={[{ href: "/proyectos", label: "Proyectos y órdenes" }, { label: "Generar orden" }]}
        titulo="Generar orden de trabajo"
        descripcion="De una máquina completa, o sólo de un conjunto o una pieza (repuestos, mantenimiento). El sistema cruza con el stock y reserva lo que ya hay."
      />

      {error && <Aviso tipo="error">{error}</Aviso>}

      <FormTabs maquina={formaMaquina} suelta={formaSuelta} inicial={tipo === "suelta" ? "suelta" : "maquina"} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
