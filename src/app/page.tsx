import Link from "next/link";
import Image from "next/image";

type Fase = { titulo: string; descripcion: string; estado: "terminada" | "en_curso" | "pendiente" };

const FASES: Fase[] = [
  {
    titulo: "Fase 1 — Fundamentos",
    descripcion: "Maestros de piezas y máquinas, generación de órdenes de trabajo, carga de tiempos desde el taller y stock.",
    estado: "terminada",
  },
  {
    titulo: "Fase 2 — Roles y circuito completo",
    descripcion: "Accesos por perfil, centros de trabajo, logística, remitos e indicadores.",
    estado: "terminada",
  },
  {
    titulo: "Fase 3 — Experiencia de uso",
    descripcion: "Reorganización de la navegación y las pantallas para que sea más simple de usar todos los días.",
    estado: "en_curso",
  },
  {
    titulo: "Puesta en marcha",
    descripcion: "Uso real en el taller y cierre del proyecto.",
    estado: "pendiente",
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
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-2">
          <Image src="/reiner-logo.png" alt="REINER" width={160} height={34} priority />
          <p className="text-sm text-foreground-muted">ERP de producción — cómo venimos avanzando</p>
        </div>

        <ol className="space-y-3">
          {FASES.map((fase) => (
            <li key={fase.titulo} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold">{fase.titulo}</h2>
                <span className={`badge-estado badge-${fase.estado} shrink-0`}>{ESTADO_LABEL[fase.estado]}</span>
              </div>
              <p className="text-sm text-foreground-muted mt-1">{fase.descripcion}</p>
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
