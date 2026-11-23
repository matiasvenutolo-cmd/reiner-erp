import { redirect } from "next/navigation";

/** Mejoras 22/11: las órdenes se ven en una sola pantalla (Órdenes); la lista vieja por tipo ya no existe. */
export default function Page() {
  redirect("/proyectos");
}
