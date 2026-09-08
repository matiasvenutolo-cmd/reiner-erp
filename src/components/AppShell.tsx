import Link from "next/link";
import Image from "next/image";
import { getUsuarioActual } from "@/lib/session";
import { getUsuarios } from "@/lib/data/usuarios";
import { NAV_POR_ROL } from "@/lib/nav";
import { cambiarUsuarioAction } from "@/app/actions/sesion";
import { UsuarioSwitcher } from "@/components/UsuarioSwitcher";

const ROL_LABEL: Record<string, string> = {
  operario: "Operario",
  taller: "Taller",
  ingenieria: "Ingeniería",
  direccion: "Dirección",
};

export async function AppShell({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();
  const usuarios = await getUsuarios();
  const nav = NAV_POR_ROL[usuario.rol];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/reiner-logo.png" alt="REINER" width={112} height={24} priority />
            <div className="leading-tight border-l border-border pl-3 hidden sm:block">
              <div className="font-semibold text-sm">Producción</div>
              <div className="text-xs text-foreground-muted">mockup navegable — Fase 1</div>
            </div>
          </div>

          <form action={cambiarUsuarioAction} className="flex items-center gap-2">
            <span className="badge-estado bg-surface-muted text-foreground-muted hidden sm:inline-flex">
              {ROL_LABEL[usuario.rol]}
            </span>
            <UsuarioSwitcher usuarios={usuarios} usuarioId={usuario.id} />
          </form>
        </div>
        {nav.length > 1 && (
          <nav className="mx-auto max-w-6xl px-4 flex gap-1 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 text-sm font-medium text-foreground-muted hover:text-foreground hover:bg-surface-muted rounded-t-md whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
