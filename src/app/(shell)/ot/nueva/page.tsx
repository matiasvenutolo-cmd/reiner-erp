import Link from "next/link";
import { getConfiguraciones, getModelos } from "@/lib/data/maestros";
import { getUsuarioActual } from "@/lib/session";
import { getClientes } from "@/lib/data/clientes";
import { crearOtMaquinaAction } from "@/app/actions/ot";

export default async function NuevaOtPage() {
  const [configuraciones, modelos, usuario, clientes] = await Promise.all([
    getConfiguraciones(),
    getModelos(),
    getUsuarioActual(),
    getClientes(),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/ot" className="text-sm text-accent hover:underline">
          ← Órdenes de trabajo
        </Link>
        <h1 className="text-xl font-semibold mt-1">Generar OT de máquina</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Se explota automáticamente a OT de conjunto y OT de pieza, cruzando contra el stock disponible
          (RF-02, RF-04). La cantidad a fabricar propuesta queda editable en el detalle.
        </p>
      </div>

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
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
