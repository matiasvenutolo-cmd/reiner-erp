import { Etiqueta } from "@/components/ui/Etiqueta";
import { ESTADO_VISIBLE, type EstadoVisible } from "@/lib/estado-pieza";

/** Un estado por pieza, de cinco (simplificación §4.2). */
export function EstadoPiezaChip({ estado }: { estado: EstadoVisible }) {
  const e = ESTADO_VISIBLE[estado];
  return (
    <Etiqueta tono={e.tono} icono={e.icono}>
      {e.label}
    </Etiqueta>
  );
}
