import Link from "next/link";

export type Pestana = { href: string; label: string; contador?: number };

/** Vistas de una misma sección (Fase 3.2): en vez de una entrada de menú por
 * cada una, se cambia de vista sin salir de la sección. */
export function Pestanas({ items, actual }: { items: Pestana[]; actual: string }) {
  return (
    <div className="flex gap-1 border-b border-border mt-4 overflow-x-auto print:hidden">
      {items.map((p) => {
        const activa = p.href === actual;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
              activa ? "border-accent text-accent" : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {p.label}
            {p.contador !== undefined && p.contador > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${activa ? "bg-accent-soft" : "bg-surface-muted"}`}>
                {p.contador}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
