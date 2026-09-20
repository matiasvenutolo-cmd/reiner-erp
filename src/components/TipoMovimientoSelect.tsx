"use client";

const TIPO_LABEL: Record<string, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  ajuste: "Ajuste",
  retiro_ot: "Retiro por OT",
};

/** Select de tipo de movimiento con auto-submit — filtro de /logistica. */
export function TipoMovimientoSelect({ valorActual }: { valorActual: string }) {
  return (
    <select
      name="tipo"
      defaultValue={valorActual}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="input text-xs py-1"
    >
      <option value="">Todos los tipos</option>
      {Object.entries(TIPO_LABEL).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
