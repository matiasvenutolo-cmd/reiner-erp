import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { getUsuarios } from "@/lib/data/usuarios";
import { RolSelect } from "@/components/RolSelect";
import {
  crearUsuarioAction,
  actualizarRolAction,
  alternarActivoAction,
  restablecerCredencialAction,
} from "@/app/actions/usuarios";

const ROL_LABEL: Record<string, string> = {
  operario: "Operario",
  taller: "Taller",
  ingenieria: "Ingeniería",
  direccion: "Dirección",
};

export default async function UsuariosPage() {
  const actual = await getUsuarioActual();
  if (actual.rol === "operario") redirect("/taller");

  const usuarios = await getUsuarios();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Usuarios y accesos</h1>
        <p className="text-sm text-foreground-muted mt-1">
          RF-12 — accesos administrados por ingeniería, dirección y taller (pedido de Horacio y Julián
          en la devolución del 2026-09-19, ver docs/05-backlog-release-2.md §5).
        </p>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Rol</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="text-left px-4 py-2 font-medium">Restablecer clave/PIN</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-border align-top">
                <td className="px-4 py-2.5 font-medium">{u.nombre}</td>
                <td className="px-4 py-2.5">
                  <form action={actualizarRolAction} className="flex items-center gap-1">
                    <input type="hidden" name="usuarioId" value={u.id} />
                    <RolSelect rol={u.rol} />
                  </form>
                </td>
                <td className="px-4 py-2.5 text-foreground-muted">{u.email ?? "— (PIN)"}</td>
                <td className="px-4 py-2.5">
                  <form action={alternarActivoAction}>
                    <input type="hidden" name="usuarioId" value={u.id} />
                    <input type="hidden" name="activo" value={String(!u.activo)} />
                    <button
                      type="submit"
                      className={`badge-estado ${u.activo ? "badge-terminada" : "bg-surface-muted text-foreground-muted"}`}
                    >
                      {u.activo ? "Activo" : "Inactivo"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  <form action={restablecerCredencialAction} className="flex items-center gap-1">
                    <input type="hidden" name="usuarioId" value={u.id} />
                    <input
                      name="secreto"
                      type="text"
                      placeholder={u.rol === "operario" ? "Nuevo PIN" : "Nueva contraseña"}
                      required
                      className="input text-xs py-1"
                    />
                    <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                      Guardar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold">Nuevo usuario</h2>
        <form action={crearUsuarioAction} className="grid grid-cols-2 gap-3">
          <input name="nombre" required placeholder="Nombre" className="input col-span-2" />
          <select name="rol" required defaultValue="" className="input">
            <option value="" disabled>
              Rol…
            </option>
            {Object.entries(ROL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input name="secreto" required placeholder="Contraseña o PIN" className="input" />
          <input
            name="email"
            type="email"
            placeholder="Email (no aplica a operario)"
            className="input col-span-2"
          />
          <button
            type="submit"
            className="col-span-2 bg-accent text-accent-foreground font-medium text-sm py-2.5 rounded-md hover:opacity-90"
          >
            Crear usuario
          </button>
        </form>
      </div>
    </div>
  );
}
