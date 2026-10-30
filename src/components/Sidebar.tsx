"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GRUPO_LABEL, itemDelMenu, type SeccionNav, type ItemNav } from "@/lib/nav";
import { Icono, ICONO_RUTA } from "@/components/ui/Icono";

function ItemLink({ item, activo, onClick }: { item: ItemNav; activo: boolean; onClick: () => void }) {
  return (
    <Link
      href={item.url ?? item.href}
      onClick={onClick}
      title={item.ayuda}
      aria-current={activo ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        activo ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface-muted"
      }`}
    >
      <Icono nombre={ICONO_RUTA[item.href] ?? "flecha"} className={`w-[18px] h-[18px] shrink-0 ${activo ? "" : "text-foreground-muted"}`} />
      <span className="flex-1 min-w-0 truncate">{item.label}</span>
      {/* Número sólo cuando hay algo que hacer (§1.1): nada de badges en cero. */}
      {item.contador ? (
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${activo ? "bg-white/25 text-white" : "bg-accent-soft text-accent-hover"}`}>{item.contador}</span>
      ) : null}
    </Link>
  );
}

/**
 * Menú lateral agrupado por área de trabajo (Fase 3.2): Producción,
 * Materiales, Seguimiento y Administración, con el ítem actual bien marcado
 * — incluso dentro de una pestaña o de una ficha (`itemDelMenu`), para que
 * siempre se sepa en qué sección se está.
 */
export function Sidebar({
  usuario,
  secciones,
  cerrarSesionAction,
}: {
  usuario: { nombre: string; rolLabel: string };
  secciones: SeccionNav[];
  cerrarSesionAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const activo = itemDelMenu(pathname);
  const cerrar = () => setAbierto(false);
  // Las áreas que no son del perfil arrancan colapsadas (§1.1); la del ítem actual siempre abierta.
  const [desplegadas, setDesplegadas] = useState<Record<string, boolean>>({});
  const estaAbierta = (s: SeccionNav) => desplegadas[s.grupo ?? ""] ?? (s.abierta || s.items.some((i) => i.href === activo));

  const contenido = (
    <>
      <div className="px-4 py-4 border-b border-border">
        <Image src="/reiner-logo.png" alt="REINER" width={104} height={22} priority />
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {secciones.map((s) => {
          const abiertaSec = estaAbierta(s);
          const pendientes = s.items.reduce((n, i) => n + (i.contador ?? 0), 0);
          return (
            <div key={s.grupo ?? "inicio"} className="space-y-0.5">
              {s.grupo && (
                <button
                  type="button"
                  onClick={() => setDesplegadas((d) => ({ ...d, [s.grupo!]: !abiertaSec }))}
                  aria-expanded={abiertaSec}
                  className="w-full flex items-center gap-1 px-3 pb-1 text-[12px] font-semibold text-foreground-muted hover:text-foreground"
                >
                  <Icono nombre={abiertaSec ? "abajo" : "derecha"} className="w-3.5 h-3.5" />
                  <span className="flex-1 text-left">{GRUPO_LABEL[s.grupo]}</span>
                  {!abiertaSec && pendientes > 0 && <span className="rounded-full bg-accent-soft text-accent-hover px-1.5 text-[11px] tabular-nums">{pendientes}</span>}
                </button>
              )}
              {abiertaSec && s.items.map((item) => <ItemLink key={item.href} item={item} activo={activo === item.href} onClick={cerrar} />)}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 space-y-2">
        <div className="px-1 leading-tight">
          <div className="text-sm font-medium">{usuario.nombre}</div>
          <div className="text-xs text-foreground-muted">{usuario.rolLabel}</div>
        </div>
        <form action={cerrarSesionAction}>
          <button type="submit" className="btn-secundario btn-sm w-full">
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      <div className="md:hidden flex items-center justify-between border-b border-border bg-surface px-4 py-3 print:hidden">
        <button type="button" onClick={() => setAbierto(true)} aria-label="Abrir menú" className="p-1.5 -ml-1.5 rounded-md hover:bg-surface-muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Image src="/reiner-logo.png" alt="REINER" width={88} height={19} />
        <div className="w-[22px]" />
      </div>

      {abierto && (
        <div className="md:hidden fixed inset-0 z-50 flex print:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={cerrar} />
          <div className="relative w-64 max-w-[80vw] bg-surface border-r border-border flex flex-col h-full">{contenido}</div>
        </div>
      )}

      <aside className="hidden md:flex md:w-60 md:flex-shrink-0 md:flex-col md:border-r md:border-border md:bg-surface md:sticky md:top-0 md:h-screen print:hidden">
        {contenido}
      </aside>
    </>
  );
}
