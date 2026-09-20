import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { HOME_POR_ROL } from "@/lib/nav";

export default async function Home() {
  const usuario = await getUsuarioActual();
  redirect(HOME_POR_ROL[usuario.rol]);
}
