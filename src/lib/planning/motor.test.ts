/* Tests del motor: node --import tsx --test src/lib/planning/*.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planificar, haciaAtras, nivelDe, diasDePaso, type ProyectoEntrada, type PasoEntrada, type CentroEntrada } from "./motor";
import { sumarHabiles, habilesEntre, esHabil, type Calendario } from "./calendario";

const cal: Calendario = { feriados: new Set(["2026-11-23"]), diasSemana: [1, 2, 3, 4, 5] };
const torno: CentroEntrada = { id: "TORNO", nombre: "Torno", horasDia: 8, maquinas: 1, eficiencia: 0.85, operarios: [{ id: "op1", nombre: "Uno" }] };
const centros = new Map([[torno.id, torno]]);
const paso = (id: string, o: Partial<PasoEntrada> = {}): PasoEntrada => ({
  operacionId: id, nombre: id, tipo: "interno", centroId: "TORNO", horas: 4, plazoDias: 0, esperaHoras: 0, estimado: true, plazoSupuesto: false, estado: "pendiente", ...o,
});
const proyecto = (pasos: PasoEntrada[], o: Partial<ProyectoEntrada> = {}): ProyectoEntrada => ({
  id: "P1", codigo: "OTM1", nombre: "Prueba", tipo: "maquina", entrega: "2026-12-30", prioridad: "normal", montajeFinalDias: 5, margenDias: 3,
  conjuntos: [{ id: "C1", nombre: "Uno", orden: 1, dias: 2, codigo: "C01" }],
  piezas: [{ otPiezaId: "X", codigo: "X1", nombre: "Pieza", cantidad: 4, conjuntoId: "C1", liberada: true, tienePlano: true, clase: "fabricada", sinRuta: false, pasos }],
  piezasCubiertasConStock: 0, ...o,
});
const entrada = (p: ProyectoEntrada) => ({ hoy: "2026-11-02", calendario: cal, proyectos: [p], centros: [torno], ausencias: new Map(), ajustes: new Map(), horizonteLiberacion: 15, exigirPlano: false });

test("calendario: suma y cuenta días hábiles saltando fin de semana y feriado", () => {
  assert.equal(esHabil("2026-11-21", cal), false); // sábado
  assert.equal(esHabil("2026-11-23", cal), false); // feriado
  assert.equal(sumarHabiles("2026-11-20", 1, cal), "2026-11-24");
  assert.equal(sumarHabiles("2026-11-24", -1, cal), "2026-11-20");
  assert.equal(habilesEntre("2026-11-20", "2026-11-24", cal), 1);
});

test("hacia atrás, ruta de 1 paso: entrega − montaje final − montaje del conjunto − margen − duración − cola", () => {
  const a = haciaAtras(proyecto([paso("A")]), centros, cal);
  assert.equal(a.montajeFinalInicio, sumarHabiles("2026-12-30", -5, cal));
  const montaje = a.conjuntos.get("C1")!.inicio;
  assert.equal(montaje, sumarHabiles(a.montajeFinalInicio, -2, cal));
  const limite = sumarHabiles(montaje, -3, cal);
  const t = a.pasos.get("X::A")!;
  assert.equal(t.fechaLimite, limite);
  assert.equal(t.inicioMasTardio, sumarHabiles(limite, -(1 + 1), cal)); // 4 h = 1 día + 1 de cola
});

test("hacia atrás, ruta de 5 pasos: cada paso termina antes del inicio más tardío del siguiente", () => {
  const pasos = ["A", "B", "C", "D", "E"].map((x) => paso(x, { horas: 10 }));
  const a = haciaAtras(proyecto(pasos), centros, cal);
  for (let i = 0; i < 4; i++) assert.equal(a.pasos.get(`X::${pasos[i].operacionId}`)!.fechaLimite, a.pasos.get(`X::${pasos[i + 1].operacionId}`)!.inicioMasTardio);
  assert.equal(diasDePaso(10, torno), 2); // 10 h ÷ 6,8 h por día
});

test("tercerizado: inicio más tardío = límite − plazo − 1 día de logística", () => {
  const a = haciaAtras(proyecto([paso("A"), paso("CROMADO", { tipo: "tercerizado", plazoDias: 7, centroId: null })]), centros, cal);
  const t = a.pasos.get("X::CROMADO")!;
  assert.equal(t.inicioMasTardio, sumarHabiles(t.fechaLimite, -8, cal));
});

test("feriado en el medio: el plazo cuenta días hábiles", () => {
  const p = proyecto([paso("A")], { entrega: "2026-11-30", montajeFinalDias: 1, conjuntos: [{ id: "C1", nombre: "Uno", orden: 1, dias: 1, codigo: "C01" }], margenDias: 1 });
  const a = haciaAtras(p, centros, cal);
  // 30/11 − 1 = 27/11; − 1 = 26/11; − 1 margen = 25/11; − 2 (1 día + cola) = 23/11 es feriado → 20/11
  assert.equal(a.pasos.get("X::A")!.inicioMasTardio, "2026-11-20");
});

test("pieza cubierta por stock: no genera tareas y se informa", () => {
  const r = planificar(entrada(proyecto([paso("A")], { piezas: [], piezasCubiertasConStock: 7 })));
  assert.equal(r.tareas.length, 0);
  assert.equal(r.proyectos[0].piezasCubiertasConStock, 7);
});

test("compra de material: pedir antes del = llegada necesaria − plazo", () => {
  const r = planificar(entrada(proyecto([paso("COMPRAS", { tipo: "compras", plazoDias: 10, centroId: null }), paso("A")])));
  const c = r.compras[0];
  assert.equal(c.llegadaNecesaria, r.tareas.find((t) => t.operacionId === "A")!.inicioMasTardio);
  assert.equal(c.pedirAntes, sumarHabiles(c.llegadaNecesaria, -10, cal));
});

test("hacia adelante: no supera la capacidad del centro y respeta la secuencia", () => {
  const p = proyecto([paso("A", { horas: 10 }), paso("B", { horas: 3 })]);
  const r = planificar(entrada(p));
  const [a, b] = r.tareas;
  for (const h of r.carga.get("TORNO")!.values()) assert.ok(h <= 6.8 + 1e-6);
  assert.ok(b.fechaPlan! > a.finPlan!);
  assert.equal(a.operarioId, "op1");
});

test("fijada: no se mueve aunque el centro esté lleno", () => {
  const p = proyecto([paso("A", { horas: 6 })]);
  const e = { ...entrada(p), ajustes: new Map([["X::A", { fecha: "2026-11-10", operarioId: null, centroId: null, fijada: true }]]) };
  const r = planificar(e);
  assert.equal(r.tareas[0].fechaPlan, "2026-11-10");
  assert.equal(r.tareas[0].fijada, true);
});

test("holgura y colores", () => {
  assert.equal(nivelDe(-1), "atrasada");
  assert.equal(nivelDe(2), "urgente");
  assert.equal(nivelDe(7), "en_plazo");
  assert.equal(nivelDe(11), "futura");
});

test("fecha estimada de fin: un proyecto sin margen llega tarde", () => {
  const p = proyecto([paso("A", { horas: 60 })], { entrega: "2026-11-06" });
  const r = planificar(entrada(p));
  assert.ok(r.proyectos[0].diferenciaDias > 0);
  assert.ok(r.tareas[0].tarde);
});

test("montaje: conjuntos alternativos (mismo orden) comparten el tramo y no suman días", () => {
  const p = proyecto([paso("A")], {
    entrega: "2026-12-18",
    montajeFinalDias: 5,
    conjuntos: [
      { id: "C1", nombre: "Uno", orden: 1, dias: 2, codigo: "C01" },
      { id: "C9", nombre: "Forzada", orden: 2, dias: 2, codigo: "C09" },
      { id: "C23", nombre: "Gravedad", orden: 2, dias: 2, codigo: "C23" },
    ],
  });
  const a = haciaAtras(p, centros, cal);
  // 18/12 − 5 = 11/12 (montaje final); tramo 2 (C09 / C23 juntos) = 09/12 a 11/12; C01 = 07/12 a 09/12
  assert.equal(a.conjuntos.get("C9")!.inicio, "2026-12-09");
  assert.equal(a.conjuntos.get("C23")!.inicio, "2026-12-09");
  assert.equal(a.conjuntos.get("C1")!.inicio, "2026-12-07");
});

test("lotes: una tarea grande se parte y el lote 1 del paso siguiente no espera al último lote", () => {
  const p = proyecto([paso("A", { horas: 20, setupHoras: 0.5, porUnidadHoras: 0.13, lote: 30 }), paso("B", { horas: 10, setupHoras: 0.5, porUnidadHoras: 0.06, lote: 30 })], {
    piezas: [{ otPiezaId: "X", codigo: "X1", nombre: "Pieza", cantidad: 150, conjuntoId: "C1", liberada: true, tienePlano: true, clase: "fabricada", sinRuta: false, pasos: [] }],
  });
  p.piezas[0].pasos = [paso("A", { horas: 20, setupHoras: 0.5, porUnidadHoras: 0.13, lote: 30 }), paso("B", { horas: 10, setupHoras: 0.5, porUnidadHoras: 0.06, lote: 30 })];
  const r = planificar(entrada(p));
  const a = r.tareas.filter((t) => t.operacionId === "A");
  const b = r.tareas.filter((t) => t.operacionId === "B");
  assert.equal(a.length, 5);
  assert.deepEqual(a[0].lote, { n: 1, de: 5 });
  assert.equal(a[0].cantidad, 30);
  // El lote 1 de B arranca antes de que termine el último lote de A.
  assert.ok(b[0].fechaPlan! <= a[4].finPlan!);
});

test("carga por operario: un operario en dos centros nunca pasa sus horas del día", () => {
  const cnc: CentroEntrada = { id: "CNC", nombre: "CNC", horasDia: 8, maquinas: 1, eficiencia: 0.85, operarios: [{ id: "op1", nombre: "Uno" }] };
  const p = proyecto([paso("A", { horas: 6 }), paso("B", { horas: 6, centroId: "CNC" })]);
  p.piezas.push({ ...p.piezas[0], otPiezaId: "Y", pasos: [paso("C", { horas: 6, centroId: "CNC" })] });
  const r = planificar({ ...entrada(p), centros: [torno, cnc], horasOperarioDia: 6.8 });
  for (const h of r.cargaOperario.get("op1")!.values()) assert.ok(h <= 6.8 + 1e-6);
});

test("plan factible: lo que nació tarde es 'arranca tarde' y 'pedir ya', no atrasado ni vencido", () => {
  const p = proyecto([paso("M", { tipo: "compras", horas: 0, plazoDias: 20 }), paso("A")], { entrega: "2026-11-12", inicio: "2026-11-02" });
  const r = planificar(entrada(p));
  assert.equal(r.compras[0].pedirYa, true);
  assert.equal(r.tareas.find((t) => t.operacionId === "A")!.nivel, "arranca_tarde");
  const r2 = planificar({ ...entrada(p), asignadasAntes: new Set(["X::A"]) });
  assert.equal(r2.tareas.find((t) => t.operacionId === "A")!.nivel, "atrasada");
});

test("entrada automática: sin tandas para liberar; lo que espera plano queda trabado 'Falta plano' aunque empiece lejos", () => {
  const sinLiberar = { otPiezaId: "X", codigo: "X1", nombre: "Pieza", cantidad: 4, conjuntoId: "C1", liberada: false, tienePlano: false, clase: "fabricada" as const, sinRuta: false, pasos: [paso("A")] };
  const p = proyecto([], { entrega: "2027-12-30", piezas: [sinLiberar] });
  const manual = planificar({ ...entrada(p), exigirPlano: true });
  assert.equal(manual.tareas[0].estado, "futura"); // lejos del horizonte: todavía no se propone
  const auto = planificar({ ...entrada(p), exigirPlano: true, entradaAutomatica: true });
  assert.equal(auto.tareas[0].estado, "trabada");
  assert.equal(auto.tareas[0].motivoTraba, "Falta plano");
  assert.deepEqual(auto.tandas.flatMap((t) => t.otPiezaIds), []);
  assert.deepEqual(auto.tandas.flatMap((t) => t.sinPlano), ["X"]);
});

test("plan hacia adelante: compitiendo por un centro, va primero la de fecha comprometida más cercana", () => {
  const pieza = (id: string) => ({ otPiezaId: id, codigo: id, nombre: id, cantidad: 4, conjuntoId: "C1", liberada: true, tienePlano: true, clase: "fabricada" as const, sinRuta: false, pasos: [paso(`${id}-A`, { horas: 6 })] });
  const lejos = proyecto([], { id: "P1", codigo: "OTM1", entrega: "2027-06-30", prioridad: "alta", piezas: [pieza("L")] });
  const cerca = proyecto([], { id: "P2", codigo: "OTM2", entrega: "2027-02-26", piezas: [pieza("C")] });
  const r = planificar({ ...entrada(lejos), proyectos: [lejos, cerca] });
  const de = (id: string) => r.tareas.find((t) => t.otPiezaId === id)!;
  // La de entrega más cercana usa el día entero; la otra toma lo que sobra y termina después (aunque sea de prioridad alta).
  assert.ok(de("C").finPlan! < de("L").finPlan!);
});

test("orden nueva (cuándo puede estar): va detrás de las activas y compra hoy, aunque su entrega sea la más cercana", () => {
  const pieza = (id: string, pasos: PasoEntrada[]) => ({ otPiezaId: id, codigo: id, nombre: id, cantidad: 4, conjuntoId: "C1", liberada: true, tienePlano: true, clase: "fabricada" as const, sinRuta: false, pasos });
  const activa = proyecto([], { id: "P1", entrega: "2027-06-30", piezas: [pieza("A", [paso("A-1", { horas: 6 })])] });
  const nueva = proyecto([], { id: "N", entrega: "2026-11-02", nueva: true, piezas: [pieza("N", [paso("N-C", { tipo: "compras", plazoDias: 10, centroId: null }), paso("N-1", { horas: 6 })])] });
  const r = planificar({ ...entrada(activa), proyectos: [activa, nueva] });
  const compra = r.tareas.find((t) => t.operacionId === "N-C")!;
  assert.equal(compra.finPlan, sumarHabiles("2026-11-02", 10, cal)); // llega hoy + plazo
  const sinCompra = proyecto([], { id: "N2", entrega: "2026-11-02", nueva: true, piezas: [pieza("M", [paso("M-1", { horas: 6 })])] });
  const r2 = planificar({ ...entrada(activa), proyectos: [activa, sinCompra] });
  const de = (id: string) => r2.tareas.find((t) => t.otPiezaId === id)!;
  assert.ok(de("A").finPlan! < de("M").finPlan!); // la activa primero
});
