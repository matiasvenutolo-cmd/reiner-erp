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
export async function PestanasStock({ actual }: { actual: string }) {
  const [c] = await db.execute<{ mp: number; cons: number; insumos: number; terminados: number; proceso: number; maquinas: number }>(sql`
    select
      (select count(*) from articulo_stock where tipo = 'materia_prima')::int mp,
      (select count(*) from articulo_stock where tipo = 'consumible')::int cons,
      (select count(*) from stock_pieza s join pieza p on p.id = s.pieza_id where s.cantidad_disponible > 0 and (p.tipo = 'comprada' or p.clase <> 'fabricada'))::int insumos,
      (select count(*) from stock_pieza s join pieza p on p.id = s.pieza_id where s.cantidad_disponible > 0 and p.tipo = 'fabricada' and p.clase = 'fabricada')::int terminados,
      (select count(*) from ot_pieza where fecha_inicio is not null and fecha_fin is null)::int proceso,
      (select count(*) from ot_maquina where destino = 'maquina' and estado_proyecto in ('en_montaje','terminado','entregado'))::int maquinas`);
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/stock", label: "Resumen" },
        { href: "/stock/materia-prima", label: "Materia prima", contador: c.mp },
        { href: "/stock/finalizado?tipo=comprada", label: "Insumos comprados", contador: c.insumos },
        { href: "/stock/consumibles", label: "Consumibles", contador: c.cons },
        { href: "/stock/en-proceso", label: "En fabricación", contador: c.proceso },
        { href: "/stock/finalizado?tipo=fabricada", label: "Terminados", contador: c.terminados },
        { href: "/stock/maquinas", label: "Máquinas", contador: c.maquinas },
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

export function PestanasLlegamos({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/llegamos", label: "¿Llegamos?" },
        { href: "/avance", label: "Avance por piezas" },
      ]}
    />
  );
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
