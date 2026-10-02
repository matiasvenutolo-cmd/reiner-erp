import Link from "next/link";
import { getConfiguraciones, getModelos, getConjuntos, getPiezasPorConfiguracion } from "@/lib/data/maestros";
import { getUsuarioActual } from "@/lib/session";
import { getClientes } from "@/lib/data/clientes";
import { crearOtMaquinaAction } from "@/app/actions/ot";
import { FormTabs } from "@/components/ot/FormTabs";
import { OrdenSueltaForm } from "@/components/ot/OrdenSueltaForm";

export default async function NuevaOtPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
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
      />
    </div>
  );

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/ot" className="text-sm text-accent hover:underline">
          ← Órdenes de trabajo
        </Link>
        <h1 className="text-xl font-semibold mt-1">Generar orden de trabajo</h1>
      </div>

      {error && <div className="badge-estado badge-alerta text-sm px-3 py-2 block">{error}</div>}

      <FormTabs maquina={formaMaquina} suelta={formaSuelta} />
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
