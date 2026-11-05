import { redirect } from "next/navigation";

/**
 * Indicadores abre en Resumen. La carga de trabajo se mira en Gestión (tanda 2, 05/11: "se ve mejor ahí, no
 * tiene sentido que esté en Indicadores").
 */
export default function IndicadoresPage() {
  redirect("/indicadores/resumen");
}
