import Image from "next/image";
import { getUsuarioActual } from "@/lib/session";
import { getMenu, ROL_LABEL } from "@/lib/nav";
import { getVisibilidadSecciones } from "@/lib/data/secciones";
import { cerrarSesionAction } from "@/app/actions/sesion";
import { Sidebar } from "@/components/Sidebar";
import { getContadoresMenu } from "@/lib/data/contadores";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();

  // El operario entra desde el celular a una sola pantalla (validado con el
  // cliente, ver docs/06-backlog-release-3.md §8: "la interfaz del operario
  // debería estar orientada específicamente a la acción... no mostrarle toda
  // la complejidad del sistema") — no tiene sentido un sidebar para un único
  // ítem de menú, se mantiene el header simple de siempre.
  if (usuario.rol === "operario") {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-border bg-surface print:hidden">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
            <Image src="/reiner-logo.png" alt="REINER" width={112} height={24} priority />
            <div className="flex items-center gap-2">
              <span className="badge-estado bg-surface-muted text-foreground-muted hidden sm:inline-flex">
                {ROL_LABEL[usuario.rol]}
              </span>
              <span className="text-sm font-medium hidden sm:inline">{usuario.nombre}</span>
              <form action={cerrarSesionAction}>
                <button
                  type="submit"
                  className="text-sm text-foreground-muted hover:text-foreground border border-border rounded-md px-2.5 py-1.5"
                >
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Sidebar
        usuario={{ nombre: usuario.nombre, rolLabel: ROL_LABEL[usuario.rol] }}
        secciones={getMenu(usuario.rol, ...(await Promise.all([getContadoresMenu().catch(() => ({})), getVisibilidadSecciones().catch(() => ({}))])))}
        cerrarSesionAction={cerrarSesionAction}
      />
      <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
