"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icono } from "./Icono";

/**
 * Aviso breve abajo después de una acción (§4.7): "Compra marcada como pedida",
 * que desaparece solo a los 5 segundos. Al cerrarse limpia el ?ok= de la URL
 * para que no vuelva a aparecer al recargar. Con `deshacer`, ofrece la vuelta atrás.
 */
export function AvisoFlotante({ children, deshacer }: { children: React.ReactNode; deshacer?: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      if (params.has("ok")) {
        const p = new URLSearchParams(params.toString());
        p.delete("ok");
        router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
      }
    }, deshacer ? 10000 : 5000);
    return () => clearTimeout(t);
  }, [params, pathname, router, deshacer]);
  if (!visible) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg bg-foreground px-4 py-3 text-sm text-surface shadow-lg print:hidden">
      <Icono nombre="okCirculo" className="w-4 h-4 shrink-0 text-verde-medio" />
      <span className="min-w-0">{children}</span>
      {deshacer}
      <button type="button" onClick={() => setVisible(false)} aria-label="Cerrar aviso" className="text-surface/70 hover:text-surface">
        <Icono nombre="cerrar" className="w-4 h-4" />
      </button>
    </div>
  );
}
