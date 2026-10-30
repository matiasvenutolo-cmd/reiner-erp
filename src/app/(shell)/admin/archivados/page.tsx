import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { listarParaArchivo, ESTADO_ARCHIVADO } from "@/lib/data/archivo";
import { archivoAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = { borrador: "sin activar", activo: "activa", en_montaje: "en montaje", terminado: "terminada", entregado: "entregada", pausado: "pausada" };

function BotonArchivo({ que, id, archivar, mensaje }: { que: "configuracion" | "orden"; id: string; archivar: boolean; mensaje: string }) {
  return (
    <form action={archivoAction}>
      <input type="hidden" name="que" value={que} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archivar" value={archivar ? "1" : "0"} />
      <ConfirmarBoton mensaje={mensaje} className={archivar ? "btn-secundario btn-sm" : "btn btn-sm"}>
        {archivar ? "Archivar" : "Desarchivar"}
      </ConfirmarBoton>
    </form>
  );
}

/**
 * Datos archivados (reorganización 30/10 §6.1): las máquinas y órdenes que no se usan quedan archivadas. No
 * aparecen en ninguna pantalla ni en los cálculos, pero no se borran: desde acá se ven y se desarchivan.
 */
export default async function ArchivadosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { configs, ordenes } = await listarParaArchivo();
  const cfgArch = configs.filter((c) => c.archivada);
  const cfgActivas = configs.filter((c) => !c.archivada);
  const ordArch = ordenes.filter((o) => o.m.estadoProyecto === ESTADO_ARCHIVADO);
  const ordActivas = ordenes.filter((o) => o.m.estadoProyecto !== ESTADO_ARCHIVADO);
  const nombreOrden = (o: (typeof ordenes)[number]) => [o.m.codigo, o.config, o.cliente ?? (o.m.destino === "stock" ? "para stock" : null)].filter(Boolean).join(" · ");

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader titulo="Datos archivados" descripcion="Lo archivado no se ve en ninguna pantalla ni se usa en los cálculos, pero no se borra. Desarchivado, vuelve igual que estaba." />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Máquinas (configuraciones)</h2>
        <ul className="tarjeta divide-y divide-border">
          {[...cfgActivas, ...cfgArch].map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className={c.archivada ? "text-foreground-muted" : ""}>
                <span className="font-medium">{c.nombre}</span> {c.archivada ? "· archivada" : "· en uso"}
              </span>
              <BotonArchivo
                que="configuracion"
                id={c.id}
                archivar={!c.archivada}
                mensaje={c.archivada ? `¿Desarchivar ${c.nombre}? Vuelve a ofrecerse para cargar órdenes.` : `¿Archivar ${c.nombre}? Deja de ofrecerse para cargar órdenes; sus datos no se borran.`}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Órdenes archivadas ({ordArch.length})</h2>
        {ordArch.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay órdenes archivadas.</p>
        ) : (
          <ul className="tarjeta divide-y divide-border">
            {ordArch.map((o) => (
              <li key={o.m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-foreground-muted">
                  {nombreOrden(o)}
                  {o.m.esDemo ? " · demo" : ""} · estaba {ESTADO[o.m.estadoAntesDeArchivar ?? ""] ?? o.m.estadoAntesDeArchivar ?? "sin activar"}
                </span>
                <BotonArchivo que="orden" id={o.m.id} archivar={false} mensaje={`¿Desarchivar ${o.m.codigo}? Vuelve a verse y a calcularse igual que estaba.`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Órdenes en uso ({ordActivas.length})</h2>
        <ul className="tarjeta divide-y divide-border">
          {ordActivas.map((o) => (
            <li key={o.m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <Link href={`/proyectos/${o.m.id}`} className="hover:text-accent hover:underline">
                {nombreOrden(o)} · {ESTADO[o.m.estadoProyecto] ?? o.m.estadoProyecto}
              </Link>
              <BotonArchivo que="orden" id={o.m.id} archivar mensaje={`¿Archivar ${o.m.codigo}? Sale del plan, de Órdenes y de Compras, y su stock reservado deja de contar. No se borra nada.`} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
