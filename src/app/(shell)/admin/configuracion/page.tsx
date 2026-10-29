import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { avisoPlanta, usuario } from "@/lib/db/schema";
import { getPlan, getProyectosSinPlan } from "@/lib/planning/datos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { Icono } from "@/components/ui/Icono";
import { resolverAvisoAction } from "@/app/actions/operario";
import { capitalizar, numero, plural } from "@/lib/formato";

export const dynamic = "force-dynamic";

type Tema = { id: string; titulo: string; detalle: string; pct?: number; cuenta?: number; href: string; boton: string };

/** Palabras que suelen quedar sin tilde al migrar los Excel (para corregir en el maestro, §4.6). */
const SIN_TILDE = /\b(\w+cion|\w+sion|camara|angulo|piston|electronica|boton|mecanica|hidraulica|neumatica|tecnica|electrico|plastico|valvula|cilindrica|maquina|regulacion|transmision|presion|tension)\b/i;

function Barra({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-verde" : pct >= 50 ? "bg-naranja" : "bg-rojo";
  return (
    <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Configuración pendiente (mejoras de usabilidad §1.3): todo lo que es carga de
 * datos y no tarea del día. Sale de Hoy para que no parezca urgente; cada tema
 * con su porcentaje de completitud y el botón para completarlo.
 */
export default async function ConfiguracionPendientePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [plan, sinPlan, [cifras], avisos, nombres] = await Promise.all([
    getPlan(),
    getProyectosSinPlan(),
    db.execute<{ piezas: number; con_ruta: number; pasos: number; con_tiempo: number; procesos: number; procesos_def: number; centros: number; centros_def: number; configs: number; configs_def: number; reclasificar: number; duplicados: number }>(sql`
      select
        (select count(*) from pieza where clase <> 'comercial')::int piezas,
        (select count(*) from pieza p where clase <> 'comercial' and exists (select 1 from operacion o where o.pieza_id = p.id))::int con_ruta,
        (select count(*) from operacion o join proceso pr on pr.id = o.proceso_id where pr.tipo = 'interno')::int pasos,
        (select count(*) from operacion o join proceso pr on pr.id = o.proceso_id where pr.tipo = 'interno' and o.min_por_unidad is not null)::int con_tiempo,
        (select count(*) from proceso where tipo = 'interno')::int procesos,
        (select count(*) from proceso where tipo = 'interno' and tiempo_origen = 'definido')::int procesos_def,
        (select count(*) from centro_trabajo)::int centros,
        (select count(*) from centro_trabajo where capacidad_origen = 'definido')::int centros_def,
        (select count(*) from configuracion)::int configs,
        (select count(*) from configuracion where montaje_origen = 'definido')::int configs_def,
        (select count(*) from pieza where clase_sugerida is not null)::int reclasificar,
        (select count(*) from (select 1 from pieza group by lower(trim(nombre)) having count(*) > 1) d)::int duplicados`),
    db
      .select({ id: avisoPlanta.id, texto: avisoPlanta.texto, quien: usuario.nombre, createdAt: avisoPlanta.createdAt })
      .from(avisoPlanta)
      .innerJoin(usuario, eq(usuario.id, avisoPlanta.usuarioId))
      .where(and(eq(avisoPlanta.tipo, "falta_plano"), isNull(avisoPlanta.resueltoAt))),
    db.execute<{ codigo: string; nombre: string }>(sql`select codigo, nombre from pieza order by nombre`),
  ]);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 100);
  const compras = plan.resultado.compras;
  const comprasOk = compras.filter((c) => !c.plazoSupuesto).length;
  const sinFecha = sinPlan.filter((p) => !p.fechaEntrega && !["entregado", "terminado"].includes(p.estado));
  const conTildeFaltante = nombres.filter((n) => SIN_TILDE.test(n.nombre));

  const temas: Tema[] = [
    { id: "rutas", titulo: "Piezas con hoja de ruta", detalle: `${plural(cifras.piezas - cifras.con_ruta, "pieza")} fabricada${cifras.piezas - cifras.con_ruta === 1 ? "" : "s"} sin ruta: se planifican con un tiempo genérico.`, pct: pct(cifras.con_ruta, cifras.piezas), href: "/maestros/tiempos?filtro=sin-ruta", boton: "Cargar rutas" },
    { id: "tiempos", titulo: "Pasos con tiempo propio", detalle: "El resto usa el tiempo estimado del proceso.", pct: pct(cifras.con_tiempo, cifras.pasos), href: "/maestros/tiempos?filtro=sin-tiempo", boton: "Abrir la grilla" },
    { id: "procesos", titulo: "Tiempos por proceso definidos por REINER", detalle: "Hoy son los estimados de la demo.", pct: pct(cifras.procesos_def, cifras.procesos), href: "/operaciones?vista=tiempos", boton: "Revisar tiempos" },
    { id: "capacidad", titulo: "Capacidad de los centros definida", detalle: "Horas por día, máquinas y eficiencia.", pct: pct(cifras.centros_def, cifras.centros), href: "/operaciones?vista=capacidad", boton: "Revisar capacidad" },
    { id: "montaje", titulo: "Secuencias de montaje definidas", detalle: "El orden en que se montan los conjuntos de cada máquina.", pct: pct(cifras.configs_def, cifras.configs), href: "/admin/montaje", boton: "Revisar secuencias" },
    { id: "compras", titulo: "Compras con proveedor y plazo", detalle: `${plural(compras.length - comprasOk, "compra")} con plazo supuesto (10 días).`, pct: pct(comprasOk, compras.length), href: "/pedir", boton: "Completar datos" },
    { id: "reclasificar", titulo: "Artículos para reclasificar como comerciales", detalle: "Motores, reductores, rodamientos: se compran hechos.", cuenta: cifras.reclasificar, href: "/admin/completitud#reclasificar", boton: "Revisar la propuesta" },
    { id: "fechas", titulo: "Órdenes sin fecha de entrega", detalle: sinFecha.length ? `${sinFecha.map((p) => p.codigo).slice(0, 4).join(", ")}${sinFecha.length > 4 ? "…" : ""}: sin fecha no se pueden planificar.` : "", cuenta: sinFecha.length, href: "/proyectos", boton: "Cargar fechas" },
    { id: "duplicados", titulo: "Posibles piezas duplicadas", detalle: "Mismo nombre y código distinto.", cuenta: cifras.duplicados, href: "/admin/completitud", boton: "Revisar" },
    { id: "tildes", titulo: "Nombres de piezas con tildes faltantes", detalle: conTildeFaltante.length ? `Por ejemplo: ${conTildeFaltante.slice(0, 3).map((n) => capitalizar(n.nombre)).join(", ")}.` : "", cuenta: conTildeFaltante.length, href: "/maestros", boton: "Corregir en Maestros" },
  ];
  const pendientes = temas.filter((t) => (t.pct ?? 100) < 100 || (t.cuenta ?? 0) > 0);
  const listos = temas.filter((t) => !pendientes.includes(t));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader titulo="Datos por completar" descripcion="Datos que faltan cargar para que el plan sea confiable. No es trabajo del día: se completa de a poco y el plan mejora solo." />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {avisos.length > 0 && (
        <section id="planos" className="tarjeta franja border-l-naranja p-4 space-y-2 scroll-mt-24">
          <h2 className="font-semibold">Avisos de la planta: planos que faltan ({avisos.length})</h2>
          <ul className="text-sm divide-y divide-border">
            {avisos.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {a.texto} <span className="text-foreground-muted">· avisó {a.quien}</span>
                </span>
                <form action={resolverAvisoAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="volver" value="/admin/configuracion" />
                  <button className="btn-secundario btn-sm">Ya está el plano</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendientes.length === 0 ? (
        <Vacio>Nada pendiente: todos los datos están cargados.</Vacio>
      ) : (
        <ul className="tarjeta divide-y divide-border">
          {pendientes.map((t) => (
            <li key={t.id} id={t.id} className="px-4 py-3.5 grid sm:grid-cols-[1fr_10rem_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{t.titulo}</div>
                {t.detalle && <div className="text-sm text-foreground-muted">{t.detalle}</div>}
              </div>
              <div className="text-sm">
                {t.pct != null ? (
                  <>
                    <div className="font-semibold tabular-nums">{t.pct}%</div>
                    <Barra pct={t.pct} />
                  </>
                ) : (
                  <span className="font-semibold tabular-nums">{numero(t.cuenta ?? 0)}</span>
                )}
              </div>
              <Link href={t.href} className="btn-secundario btn-sm justify-self-start sm:justify-self-end">
                {t.boton} →
              </Link>
            </li>
          ))}
        </ul>
      )}
      {listos.length > 0 && (
        <p className="text-sm text-verde-fg flex items-center gap-2">
          <Icono nombre="okCirculo" className="w-4 h-4" /> Completo: {listos.map((t) => t.titulo.toLowerCase()).join(" · ")}.
        </p>
      )}
      <p className="text-xs text-foreground-muted">
        Plan calculado en {numero(plan.ms)} ms · {plural(plan.resultado.tareas.length, "tarea")} de {plural(plan.resultado.proyectos.length, "orden", "órdenes")} activa{plan.resultado.proyectos.length === 1 ? "" : "s"}.
      </p>
    </div>
  );
}
