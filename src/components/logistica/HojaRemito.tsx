import Image from "next/image";

export type ItemHojaRemito = { clave: string; codigo: string; nombre: string; tratamiento: string | null; cantidad: number };

/**
 * La hoja del remito, igual para la vista previa (todavía sin guardar, sin
 * número) y para el remito ya registrado en `/remitos/[id]` — así lo que se
 * revisa antes de confirmar es exactamente lo que se imprime.
 */
export function HojaRemito({
  numero,
  fecha,
  destino,
  usuarioNombre,
  tecnico,
  observacion,
  items,
}: {
  /** null = vista previa: el número se asigna recién al confirmar. */
  numero: number | null;
  fecha: Date;
  destino: string;
  usuarioNombre: string;
  tecnico: string | null;
  observacion: string | null;
  items: ItemHojaRemito[];
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-8 print:border-0 print:p-0 space-y-8">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <Image src="/reiner-logo.png" alt="REINER" width={140} height={30} priority />
          <p className="text-xs text-foreground-muted mt-1">REINER S.A. — San Martín, Bs. As.</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">REMITO</div>
          <div className="font-mono text-xl">{numero === null ? "N° —" : `N° ${String(numero).padStart(4, "0")}`}</div>
          <div className="text-sm text-foreground-muted mt-1">
            {fecha.toLocaleDateString("es-AR", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-foreground-muted uppercase">Destino</div>
          <div className="font-medium">{destino}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-muted uppercase">Generado por</div>
          <div className="font-medium">{usuarioNombre}</div>
        </div>
        {tecnico && (
          <div>
            <div className="text-xs text-foreground-muted uppercase">Técnico</div>
            <div className="font-medium">{tecnico}</div>
          </div>
        )}
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-border text-xs uppercase text-foreground-muted">
          <tr>
            <th className="text-left py-2 font-medium">Código</th>
            <th className="text-left py-2 font-medium">Pieza</th>
            <th className="text-left py-2 font-medium">Tratamiento</th>
            <th className="text-right py-2 font-medium">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.clave} className="border-b border-border">
              <td className="py-3 font-mono text-xs">{item.codigo}</td>
              <td className="py-3">{item.nombre}</td>
              <td className="py-3 text-foreground-muted">{item.tratamiento || "—"}</td>
              <td className="py-3 text-right tabular-nums">{item.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {observacion && (
        <div className="text-sm">
          <div className="text-xs text-foreground-muted uppercase">Observaciones</div>
          <p>{observacion}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-8 pt-12 text-sm text-center">
        <div className="border-t border-foreground-muted pt-2">Firma — entrega</div>
        <div className="border-t border-foreground-muted pt-2">Firma — recibe</div>
      </div>
    </div>
  );
}
