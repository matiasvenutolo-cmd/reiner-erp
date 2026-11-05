import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { Pestanas } from "./Pestanas";

/** Vistas de cada sección del menú (Fase 3.2): una sola entrada por área y las vistas relacionadas como pestañas. */

export function PestanasOt({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/proyectos", label: "Por fecha de entrega" },
        { href: "/ot", label: "Órdenes por tipo" },
        { href: "/ot/piezas", label: "Todas las piezas" },
      ]}
    />
  );
}

export function PestanasPlanificacion({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/planificacion", label: "Plan de la semana" },
        { href: "/centros-trabajo", label: "Colas por centro" },
        { href: "/planificacion/manual", label: "Asignar a mano" },
      ]}
    />
  );
}

/** Pestañas de Stock con el número de ítems de cada una (§2.6). */
/**
 * Stock (tanda 2, 05/11): materia prima (lo comprado para fabricar), insumos (piezas comerciales y consumibles,
 * una sola lista) y productos terminados (piezas, conjuntos y máquinas). Lo que está en fabricación no es stock:
 * se ve en Gestión.
 */
export async function PestanasStock({ actual }: { actual: string }) {
  const [c] = await db.execute<{ mp: number; insumos: number; terminados: number }>(sql`
    select
      (select count(*) from articulo_stock where tipo = 'materia_prima' and cantidad > 0)::int mp,
      (select count(*) from articulo_stock where tipo = 'consumible')::int
        + (select count(*) from stock_pieza s join pieza p on p.id = s.pieza_id where s.cantidad_disponible > 0 and (p.tipo = 'comprada' or p.clase <> 'fabricada'))::int insumos,
      (select count(*) from stock_pieza s join pieza p on p.id = s.pieza_id where s.cantidad_disponible > 0 and p.tipo = 'fabricada' and p.clase = 'fabricada')::int
        + (select count(*) from stock_conjunto where cantidad > 0)::int terminados`);
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/stock/materia-prima", label: "Materia prima", contador: c.mp },
        { href: "/stock/insumos", label: "Insumos", contador: c.insumos },
        { href: "/stock/finalizado?tipo=fabricada", label: "Productos terminados", contador: c.terminados },
        { href: "/stock/movimientos", label: "Movimientos" },
      ]}
    />
  );
}

export function PestanasTercerizados({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/tercerizados", label: "Envíos y vueltas" },
        { href: "/remitos", label: "Remitos" },
      ]}
    />
  );
}

/** Indicadores (reorganización 30/10 §4): todo lo que es mirar, en pestañas. Nada se modifica desde acá. */
export function PestanasIndicadores({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/indicadores/resumen", label: "Resumen" },
        { href: "/indicadores/tiempos", label: "Tiempos" },
        { href: "/indicadores/paradas", label: "Paradas y rechazos" },
      ]}
    />
  );
}

/** ¿Llegamos? ahora es una pestaña de Indicadores: mismas pestañas. */
export function PestanasLlegamos({ actual }: { actual: string }) {
  return <PestanasIndicadores actual={actual} />;
}

export function PestanasMaestros({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/maestros", label: "Piezas y hojas de ruta" },
        { href: "/maestros/tiempos", label: "Grilla de tiempos" },
      ]}
    />
  );
}
