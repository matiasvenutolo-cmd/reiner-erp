import { revalidatePath as revalidarRuta, revalidateTag } from "next/cache";

/**
 * Igual que `revalidatePath` de Next, pero además invalida el plan guardado y
 * los números del menú (REINER v2 · simplificación §4.6). El plan ya no se
 * recalcula en cada carga de página: se calcula al cambiar algo. Como toda
 * acción que guarda datos llama a `revalidatePath`, pasar por acá garantiza
 * que ningún cambio deje el plan desactualizado.
 */
export function revalidatePath(ruta: string, tipo?: "layout" | "page") {
  revalidarRuta(ruta, tipo);
  invalidarPlan();
}

export function invalidarPlan() {
  revalidateTag("plan", { expire: 0 });
  revalidateTag("contadores", { expire: 0 });
}

export { revalidateTag };
