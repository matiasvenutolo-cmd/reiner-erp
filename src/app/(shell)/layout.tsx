import { AppShell } from "@/components/AppShell";

/**
 * Grupo de rutas autenticadas: todo lo que antes vivía directo en `app/`
 * (avance, maestros, ot, stock, taller, usuarios, home) se movió acá para
 * que `AppShell` — que llama a `getUsuarioActual()` y redirige a /login sin
 * sesión — no envuelva también a /login. Antes ambos compartían el layout
 * raíz y eso producía un loop de redirects /login → /login (detectado al
 * verificar en el navegador, ver docs/05-backlog-release-2.md §9).
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
