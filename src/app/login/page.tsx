import Image from "next/image";
import { getUsuariosPorRol } from "@/lib/data/usuarios";
import { iniciarSesionStaffAction, iniciarSesionOperarioAction } from "@/app/actions/sesion";

const ERRORES: Record<string, string> = {
  credenciales: "Email o contraseña incorrectos.",
  pin: "PIN incorrecto.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const operarios = (await getUsuariosPorRol("operario")).filter((u) => u.activo);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Image src="/reiner-logo.png" alt="REINER" width={140} height={30} priority />
          <p className="text-sm text-foreground-muted">ERP de producción</p>
        </div>

        {error && (
          <div className="badge-estado badge-alerta w-full justify-center py-2">
            {ERRORES[error] ?? "No se pudo iniciar sesión."}
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold">Ingeniería, dirección y taller</h2>
          <form action={iniciarSesionStaffAction} className="space-y-3">
            <input
              name="email"
              type="email"
              required
              placeholder="email@reiner.com.ar"
              className="input"
              autoComplete="username"
            />
            <input
              name="password"
              type="password"
              required
              placeholder="Contraseña"
              className="input"
              autoComplete="current-password"
            />
            <button
              type="submit"
              className="w-full bg-accent text-accent-foreground font-medium text-sm py-2.5 rounded-md hover:opacity-90"
            >
              Entrar
            </button>
          </form>
        </div>

        <div className="flex items-center gap-3 text-xs text-foreground-muted">
          <div className="flex-1 border-t border-border" />
          o
          <div className="flex-1 border-t border-border" />
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold">Operario — taller</h2>
          <form action={iniciarSesionOperarioAction} className="space-y-3">
            <select name="usuarioId" required className="input" defaultValue="">
              <option value="" disabled>
                Elegí tu nombre…
              </option>
              {operarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              required
              placeholder="PIN"
              className="input text-center tracking-[0.3em] text-lg"
              autoComplete="off"
            />
            <button
              type="submit"
              className="w-full bg-brand-teal text-accent-foreground font-medium text-sm py-2.5 rounded-md hover:opacity-90"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
