import Link from "next/link";

export type Miga = { href?: string; label: string };

/**
 * Encabezado único de todas las pantallas (Fase 3.2): dónde estoy (migas, que
 * también sirven para volver sin perder el contexto), qué es esta pantalla,
 * para qué sirve en una línea, y la acción principal a la derecha.
 */
export function PageHeader({
  titulo,
  descripcion,
  migas,
  acciones,
  children,
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  migas?: Miga[];
  acciones?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 print:hidden">
      {migas && migas.length > 0 && (
        <nav aria-label="Ubicación" className="flex flex-wrap items-center gap-1 text-xs text-foreground-muted mb-1.5">
          {migas.map((m, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>›</span>}
              {m.href ? (
                <Link href={m.href} className="hover:text-accent hover:underline">
                  {m.label}
                </Link>
              ) : (
                <span>{m.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descripcion && <p className="text-sm text-foreground-muted mt-1 max-w-3xl">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      {children}
    </header>
  );
}
