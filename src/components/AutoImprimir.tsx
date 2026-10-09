"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Abre el diálogo de impresión al llegar (ej. recién confirmado un remito) y
 * limpia el parámetro, para que recargar la página no vuelva a imprimir. */
export function AutoImprimir() {
  const router = useRouter();
  const pathname = usePathname();
  // Una sola vez aunque React ejecute el efecto dos veces (modo estricto en desarrollo).
  const yaImprimio = useRef(false);
  useEffect(() => {
    if (yaImprimio.current) return;
    yaImprimio.current = true;
    router.replace(pathname, { scroll: false });
    window.print();
  }, [router, pathname]);
  return null;
}
