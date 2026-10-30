/**
 * "Cuándo puede estar" una orden en borrador (simplificación §3, paso 3 del
 * asistente). La fecha es un resultado: con lo decidido en el paso 2, el
 * sistema calcula hacia adelante, desde hoy, con el mismo motor del plan:
 * - cada compra llega hoy + plazo del proveedor (el habitual, o el estimado);
 * - cada pieza puede empezar el día en que tiene el material (hoy, si ya está);
 * - las piezas se encolan en el plan con la carga actual del taller: las
 *   órdenes activas tienen prioridad por su fecha comprometida, la nueva va detrás;
 * - la fecha más temprana es cuando termina la última pieza, más el montaje si
 *   es una máquina completa.
 * No guarda nada: es una simulación sobre el plan actual.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pieza, operacion, proceso, proveedor, proveedorServicio, configuracion, montajeConjunto, conjunto } from "@/lib/db/schema";
import type { OrdenBorrador } from "@/lib/db/schema";
import { getPlan, pasoDeRuta, DEFAULT } from "./datos";
import { planificar, CENTRO_POR_DEFECTO, type ProyectoEntrada, type PiezaEntrada } from "./motor";
import { sumarHabiles, habilesEntre } from "./calendario";
import { queHaceFaltaDeBorrador } from "@/lib/data/que-hace-falta";
import { controlaMateriaPrima, compraInformativa } from "@/lib/data/materia-prima";

export type CuandoPuedeEstar = {
  /** Fecha más temprana posible. */
  fecha: string;
  /** Lo que más demora, en palabras: la compra más larga y la cola del centro más cargado. */
  demoras: string[];
  /** Fecha que pidió el cliente, si la cargó. */
  cliente: string | null;
  /** Días hábiles entre la fecha del cliente y la más temprana: positivo = sobra; negativo = falta. */
  margenCliente: number | null;
  hoy: string;
};

const ID = "orden-nueva";

export async function cuandoPuedeEstar(b: OrdenBorrador): Promise<CuandoPuedeEstar> {
  const [plan, qhf, controlaMP] = await Promise.all([getPlan(), queHaceFaltaDeBorrador(b), controlaMateriaPrima()]);
  const { entrada } = plan;
  const hoy = entrada.hoy;
  const cal = entrada.calendario;
  const filas = qhf.filas.filter((f) => f.resto > 0);
  const ids = [...new Set(filas.map((f) => f.piezaId))];

  const [piezas, ruta, servicios, proveedores, [cfg], montaje, conjuntos] = await Promise.all([
    ids.length ? db.select().from(pieza).where(inArray(pieza.id, ids)) : Promise.resolve([]),
    ids.length ? db.select({ o: operacion, pr: proceso }).from(operacion).innerJoin(proceso, eq(proceso.id, operacion.procesoId)).where(inArray(operacion.piezaId, ids)).orderBy(operacion.piezaId, operacion.secuencia) : Promise.resolve([]),
    db.select().from(proveedorServicio),
    db.select({ id: proveedor.id, plazoDias: proveedor.plazoDias }).from(proveedor),
    b.configuracionId ? db.select().from(configuracion).where(eq(configuracion.id, b.configuracionId)) : Promise.resolve([]),
    b.configuracionId ? db.select().from(montajeConjunto).where(eq(montajeConjunto.configuracionId, b.configuracionId)) : Promise.resolve([]),
    db.select({ id: conjunto.id, nombre: conjunto.nombre, codigo: conjunto.codigo }).from(conjunto),
  ]);
  const plazoProveedor = new Map(proveedores.map((p) => [p.id, p.plazoDias]));
  const datosPieza = new Map(piezas.map((p) => [p.id, p]));
  const esMaquina = b.tipo === "maquina";

  const piezasEntrada: PiezaEntrada[] = filas.map((f) => {
    const p = datosPieza.get(f.piezaId)!;
    const cant = f.resto;
    const conjuntoId = f.conjuntoId ?? "sin-conjunto";
    const tienePlano = !!(p.numeroPlano && p.revision);
    // Con entrada automática entra sola; si se exige plano y no lo tiene, espera a ingeniería.
    const liberada = entrada.entradaAutomatica ? !(entrada.exigirPlano && !tienePlano) : true;
    const base = { otPiezaId: `${ID}:${f.piezaId}`, codigo: f.codigo, nombre: f.nombre, cantidad: cant, conjuntoId, liberada, tienePlano };
    if (f.grupo === "compro") {
      return { ...base, clase: "comercial", sinRuta: false, pasos: [], compraEntera: { plazoDias: f.plazoDias ?? DEFAULT.plazoComercial, plazoSupuesto: f.plazoSupuesto, llegadaPrevista: f.comprar ? null : hoy, pedido: false, recibida: false } };
    }
    const pasosRuta = ruta.filter((r) => r.o.piezaId === f.piezaId);
    const pasos = pasosRuta.length
      ? pasosRuta.map(({ o, pr }) => ({
          ...pasoDeRuta(o, pr, p, cant, servicios, plazoProveedor),
          lote: p.tamanoLote && p.tamanoLote < cant ? p.tamanoLote : null,
          // Sin control de materia prima (§2.2) el paso de Compras no demora la pieza.
          estado: compraInformativa(pr.tipo, pasosRuta.map((x) => ({ tipo: x.pr.tipo })), controlaMP) ? ("terminada" as const) : ("pendiente" as const),
          pedido: pr.tipo === "compras" ? false : undefined,
          llegadaPrevista: null,
        }))
      : [{ operacionId: `fabricar-${p.id}`, nombre: "Fabricar (sin hoja de ruta)", tipo: "interno" as const, centroId: CENTRO_POR_DEFECTO, horas: (DEFAULT.setupMin + DEFAULT.minPorUnidad * cant) / 60, plazoDias: 0, esperaHoras: 0, estimado: true, plazoSupuesto: false, estado: "pendiente" as const }];
    // Material que hay que comprar y la ruta no tiene paso de Compras: la pieza empieza cuando llega.
    const tieneCompras = pasos.some((x) => x.tipo === "compras");
    const materialDesde = f.grupo === "falta_material" && f.comprar && !tieneCompras ? sumarHabiles(hoy, f.plazoDias ?? DEFAULT.plazoCompra, cal) : null;
    return { ...base, clase: "fabricada", sinRuta: !pasosRuta.length, pasos, materialDesde };
  });

  const usados = new Set(piezasEntrada.map((p) => p.conjuntoId));
  const conjuntosEntrada = [...usados].map((id, i) => {
    const c = conjuntos.find((x) => x.id === id);
    const mj = montaje.find((x) => x.conjuntoId === id);
    return { id, nombre: c?.nombre ?? "Piezas", codigo: c?.codigo ?? "", orden: mj?.orden ?? 100 + i, dias: mj?.dias ?? 1 };
  });
  const nueva: ProyectoEntrada = {
    id: ID,
    codigo: "Orden nueva",
    nombre: "Orden nueva",
    tipo: b.destino === "stock" ? "stock" : esMaquina ? "maquina" : "repuesto",
    // Lo antes posible: la entrega no condiciona nada hacia adelante (va detrás de las activas).
    entrega: hoy,
    prioridad: "normal",
    montajeFinalDias: cfg?.montajeFinalDias ?? 5,
    margenDias: cfg?.margenMontajeDias ?? 3,
    conjuntos: conjuntosEntrada,
    piezas: piezasEntrada,
    piezasCubiertasConStock: qhf.filas.length - filas.length,
    inicio: hoy,
    nueva: true,
  };

  const r = planificar({ ...entrada, proyectos: [...entrada.proyectos, nueva] });
  const pp = r.proyectos.find((x) => x.id === ID);
  const fecha = pp?.finEstimado ?? hoy;
  const cliente = b.fechaCliente ?? null;

  // Lo que más demora (simplificación §3): la compra más larga y la cola del centro más cargado.
  const demoras: string[] = [];
  const masLarga = qhf.implica.compraMasLarga;
  if (masLarga) demoras.push(`la compra de ${masLarga.nombre} (${masLarga.dias} días)`);
  // Cola: cuánto espera para arrancar, en cada centro, una pieza que ya tiene el material.
  const conMaterial = new Set(piezasEntrada.filter((x) => !x.materialDesde && !x.pasos.some((y) => y.tipo === "compras")).map((x) => x.otPiezaId));
  const cola = new Map<string, number>();
  for (const t of r.tareas.filter((x) => x.proyectoId === ID && x.posicion === 1 && x.tipo === "interno" && conMaterial.has(x.otPiezaId) && x.fechaPlan)) {
    const espera = habilesEntre(hoy, t.fechaPlan!, cal);
    if (espera > (cola.get(t.centroId ?? "") ?? -1)) cola.set(t.centroId ?? "", espera);
  }
  const [centroLento, espera] = [...cola].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (centroLento && espera >= 5) {
    const nombre = entrada.centros.find((c) => c.id === centroLento)?.nombre ?? "un centro";
    const semanas = Math.round(espera / 5);
    demoras.push(`la carga de ${nombre} (${semanas} semana${semanas === 1 ? "" : "s"} de cola)`);
  }
  return {
    fecha,
    demoras,
    cliente,
    margenCliente: cliente ? habilesEntre(fecha, cliente, cal) : null,
    hoy,
  };
}
