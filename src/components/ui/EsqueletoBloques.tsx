/** Lugar de un bloque que todavía se está calculando (carga por bloques, simplificación §4.6). */
export function EsqueletoBloques({ bloques = 3 }: { bloques?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="esqueleto h-28" />
      {Array.from({ length: bloques - 1 }, (_, i) => (
        <div key={i} className="esqueleto h-16" />
      ))}
    </div>
  );
}
