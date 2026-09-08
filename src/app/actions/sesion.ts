"use server";

import { redirect } from "next/navigation";
import { setUsuarioActualCookie } from "@/lib/session";
import { getUsuario } from "@/lib/data/usuarios";
import { HOME_POR_ROL } from "@/lib/nav";

export async function cambiarUsuarioAction(formData: FormData) {
  const id = String(formData.get("usuarioId") ?? "");
  await setUsuarioActualCookie(id);
  const usuario = await getUsuario(id);
  redirect(HOME_POR_ROL[usuario?.rol ?? "direccion"]);
}
