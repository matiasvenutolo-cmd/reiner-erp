import { redirect } from "next/navigation";

/**
 * Tanda 2 (05/11): Stock son tres listas (materia prima, insumos y productos terminados). Lo que está en
 * fabricación no es stock (se ve en Gestión) y las máquinas terminadas están en Productos terminados.
 */
export default function Page() {
  redirect("/stock/finalizado?tipo=fabricada");
}
