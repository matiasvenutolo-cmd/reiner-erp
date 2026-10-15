import type { Proveedor } from "@/lib/db/schema";

/** Todos los datos del proveedor, en el mismo orden en el alta y en la ficha. */
export function ProveedorCampos({ p }: { p?: Proveedor }) {
  const campo = (name: keyof Proveedor, label: string, placeholder?: string, ancho = "") => (
    <label className={`block ${ancho}`}>
      <span className="etiqueta">{label}</span>
      <input name={name} defaultValue={(p?.[name] as string | null) ?? ""} placeholder={placeholder} className="input" />
    </label>
  );
  return (
    <div className="grid sm:grid-cols-2 gap-3 [&>*]:min-w-0">
      <label className="block sm:col-span-2">
        <span className="etiqueta">Razón social *</span>
        <input name="razonSocial" required defaultValue={p?.razonSocial ?? ""} className="input" />
      </label>
      {campo("rubro", "Rubro", "ej. Cromado, Materia prima, Herramientas")}
      {campo("cuit", "CUIT", "ej. 30-12345678-9")}
      {campo("contacto", "Contacto", "Nombre, teléfono, email")}
      {campo("condicion", "Condición")}
      {campo("condicionPago", "Condición de pago", "ej. 30 días, contado")}
      {campo("horario", "Horario de atención", "ej. lun a vie 8 a 17")}
      {campo("direccion", "Dirección", undefined, "sm:col-span-2")}
      <label className="block sm:col-span-2">
        <span className="etiqueta">Observaciones</span>
        <textarea name="observaciones" rows={2} defaultValue={p?.observaciones ?? ""} className="input resize-none" />
      </label>
    </div>
  );
}
