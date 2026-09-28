import Link from "next/link";
import Image from "next/image";

type Item = { texto: string; hecho: boolean };
type Fase = { titulo: string; estado: "terminada" | "en_curso" | "pendiente"; items: Item[] };

const FASES: Fase[] = [
  {
    titulo: "Fase 1 — Fundamentos",
    estado: "terminada",
    items: [
      { texto: "Maestros de piezas y máquinas (BOM multinivel)", hecho: true },
      { texto: "Generación de órdenes de trabajo con explosión automática contra stock", hecho: true },
      { texto: "Carga de tiempos desde el celular en el taller", hecho: true },
      { texto: "Stock por pieza", hecho: true },
    ],
  },
  {
    titulo: "Fase 2 — Roles y circuito completo",
    estado: "terminada",
    items: [
      { texto: "Accesos reales por perfil (ingeniería, dirección, taller, operario)", hecho: true },
      { texto: "Centros de trabajo", hecho: true },
      { texto: "Logística: ingresos, egresos y control de calidad", hecho: true },
      { texto: "Remitos", hecho: true },
      { texto: "Control de armado por conjunto", hecho: true },
      { texto: "Indicadores — primera versión", hecho: true },
    ],
  },
  {
    titulo: "Fase 3 — Experiencia de uso",
    estado: "en_curso",
    items: [
      { texto: "Navegación y pantalla de inicio por perfil", hecho: true },
      { texto: "Stock recalculado en vivo, por etapa del proceso", hecho: true },
      { texto: "Avance por sección de cada máquina, no sólo por máquina completa", hecho: true },
      { texto: "Revisión de retrabajo integrada a la orden de trabajo", hecho: true },
      { texto: "Reordenar centros de trabajo arrastrando", hecho: true },
      { texto: "Planificación semanal de trabajo por persona y día", hecho: false },
      { texto: "Un solo proceso para logística, remitos y trabajos tercerizados", hecho: false },
      { texto: "Indicadores — revisión final, una vez resuelto el resto", hecho: false },
    ],
  },
  {
    titulo: "Próximamente",
    estado: "pendiente",
    items: [
      { texto: "Estimación de fecha de entrega y simulador de cotización", hecho: false },
      { texto: "Puesta en marcha real en el taller", hecho: false },
      { texto: "Cierre del proyecto", hecho: false },
    ],
  },
];

const ESTADO_LABEL: Record<Fase["estado"], string> = {
  terminada: "Completa",
  en_curso: "En curso",
  pendiente: "Próximamente",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-xl space-y-8">
        <div className="flex flex-col items-center gap-2">
          <Image src="/reiner-logo.png" alt="REINER" width={160} height={34} priority />
          <p className="text-sm text-foreground-muted">ERP de producción — cómo venimos avanzando</p>
        </div>

        <ol className="space-y-3">
          {FASES.map((fase) => (
            <li key={fase.titulo} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <h2 className="text-sm font-semibold">{fase.titulo}</h2>
                <span className={`badge-estado badge-${fase.estado} shrink-0`}>{ESTADO_LABEL[fase.estado]}</span>
              </div>
              <ul className="space-y-1.5">
                {fase.items.map((item) => (
                  <li key={item.texto} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${item.hecho ? "bg-brand-teal" : "bg-border"}`}
                      aria-hidden
                    />
                    <span className={item.hecho ? "text-foreground" : "text-foreground-muted"}>{item.texto}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <Link
          href="/login"
          className="block w-full text-center bg-accent text-accent-foreground font-medium text-sm py-3 rounded-md hover:opacity-90"
        >
          Entrar al sistema →
        </Link>
      </div>
    </div>
  );
}
