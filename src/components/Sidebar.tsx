"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ItemNav } from "@/lib/nav";

const ROL_LABEL: Record<string, string> = {
  operario: "Operario",
  taller: "Taller",
  ingenieria: "Ingeniería",
  direccion: "Dirección",
};

function ItemLink({ item, activo, onClick }: { item: ItemNav; activo: boolean; onClick: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        activo ? "bg-accent-soft text-accent" : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function Sidebar({
  usuario,
  principal,
  admin,
  cerrarSesionAction,
}: {
  usuario: { nombre: string; rol: string };
  principal: ItemNav[];
  admin: ItemNav[];
  cerrarSesionAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  const esActivo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const cerrar = () => setAbierto(false);

  const contenido = (
    <>
      <div className="px-4 py-4 border-b border-border">
        <Image src="/reiner-logo.png" alt="REINER" width={104} height={22} priority />
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <div className="space-y-0.5">
          {principal.map((item) => (
            <ItemLink key={item.href} item={item} activo={esActivo(item.href)} onClick={cerrar} />
          ))}
        </div>
        {admin.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted/70">
              Administración
            </div>
            {admin.map((item) => (
              <ItemLink key={item.href} item={item} activo={esActivo(item.href)} onClick={cerrar} />
            ))}
          </div>
        )}
      </nav>
      <div className="border-t border-border p-3 space-y-2">
        <div className="px-1 leading-tight">
          <div className="text-sm font-medium">{usuario.nombre}</div>
          <div className="text-xs text-foreground-muted">{ROL_LABEL[usuario.rol]}</div>
        </div>
        <form action={cerrarSesionAction}>
          <button
            type="submit"
            className="w-full text-sm text-foreground-muted hover:text-foreground border border-border rounded-md px-2.5 py-1.5"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      <div className="md:hidden flex items-center justify-between border-b border-border bg-surface px-4 py-3 print:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="p-1.5 -ml-1.5 rounded-md hover:bg-surface-muted"
        >
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
          <div className="relative w-64 max-w-[80vw] bg-surface border-r border-border flex flex-col h-full">
            {contenido}
          </div>
        </div>
      )}

      <aside className="hidden md:flex md:w-56 md:flex-shrink-0 md:flex-col md:border-r md:border-border md:bg-surface print:hidden">
        {contenido}
      </aside>
    </>
  );
}
