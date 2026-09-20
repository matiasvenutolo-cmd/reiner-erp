"use server";

import { redirect } from "next/navigation";
import { crearSesion, destruirSesion } from "@/lib/session";
import { getUsuario, getUsuarioPorEmail } from "@/lib/data/usuarios";
import { verifySecret } from "@/lib/auth/hash";
import { HOME_POR_ROL } from "@/lib/nav";

/** Ingeniería, dirección y taller entran con email + contraseña. */
export async function iniciarSesionStaffAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const usuario = email ? await getUsuarioPorEmail(email) : undefined;
  const ok = usuario?.activo && usuario.rol !== "operario" && (await verifySecret(password, usuario.passwordHash));
  if (!ok || !usuario) {
    redirect("/login?error=credenciales");
  }

  await crearSesion(usuario);
  redirect(HOME_POR_ROL[usuario.rol]);
}

/** Operario entra eligiendo su nombre de una lista + PIN — sin email, pensado para el celular del taller. */
export async function iniciarSesionOperarioAction(formData: FormData) {
  const usuarioId = String(formData.get("usuarioId") ?? "");
  const pin = String(formData.get("pin") ?? "");

  const usuario = usuarioId ? await getUsuario(usuarioId) : undefined;
  const ok = usuario?.activo && usuario.rol === "operario" && (await verifySecret(pin, usuario.pinHash));
  if (!ok || !usuario) {
    redirect("/login?error=pin");
  }

  await crearSesion(usuario);
  redirect(HOME_POR_ROL[usuario.rol]);
}

export async function cerrarSesionAction() {
  await destruirSesion();
  redirect("/login");
}
