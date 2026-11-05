import { redirect } from "next/navigation";

/** Tanda 2 (05/11): los consumibles están en Insumos, junto con las piezas comerciales. */
export default function ConsumiblesPage() {
  redirect("/stock/insumos");
}
