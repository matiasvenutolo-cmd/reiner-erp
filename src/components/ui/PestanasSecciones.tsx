import { Pestanas } from "./Pestanas";

/** Vistas de cada sección del menú (Fase 3.2): una sola entrada por área y las vistas relacionadas como pestañas. */

export function PestanasOt({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/ot", label: "Órdenes" },
        { href: "/ot/piezas", label: "Todas las piezas" },
        { href: "/avance", label: "Avance de máquinas" },
      ]}
    />
  );
}

export function PestanasPlanificacion({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/planificacion", label: "Plan por día" },
        { href: "/centros-trabajo", label: "Colas por centro" },
      ]}
    />
  );
}

export function PestanasStock({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/stock", label: "Resumen" },
        { href: "/stock/finalizado", label: "Almacén" },
        { href: "/stock/en-proceso", label: "En fabricación" },
        { href: "/stock/compras", label: "Compras de producción" },
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
