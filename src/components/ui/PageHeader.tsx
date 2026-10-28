import Link from "next/link";
import { Ayuda } from "./Ayuda";

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
      {/* Encabezado fijo al hacer scroll (§4.8): el título y la acción principal quedan a la vista. */}
      <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-8 md:px-8 py-2 bg-background/95 backdrop-blur flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {descripcion ? <Ayuda titulo={titulo}>{descripcion}</Ayuda> : <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      {children}
    </header>
  );
}
