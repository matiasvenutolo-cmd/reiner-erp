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
