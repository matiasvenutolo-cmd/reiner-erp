/* Un estado por pieza (simplificación §4.2): node --import tsx --test src/lib/planning/*.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoDePieza } from "../estado-pieza";
import type { Tarea, Compra } from "./motor";

const t = (posicion: number, o: Partial<Tarea> = {}): Tarea =>
  ({ clave: `p::${posicion}`, otPiezaId: "p", operacionId: String(posicion), posicion, totalPasos: 3, paso: `Paso ${posicion}`, tipo: "interno", estado: "lista", motivoTraba: null, nivel: "en_plazo", holgura: 5, fechaPlan: null, ...o }) as Tarea;
const compra = (o: Partial<Compra> = {}): Compra => ({ otPiezaId: "p", pedido: false, llegadaPrevista: null, esMaterial: false, ...o }) as Compra;

test("todos los pasos terminados: Terminada", () => {
  assert.equal(estadoDePieza([t(1, { estado: "terminada" }), t(2, { estado: "terminada" })]).estado, "terminada");
});

test("paso anterior terminado y el próximo sin empezar: Lista (puede seguir)", () => {
  const e = estadoDePieza([t(1, { estado: "terminada" }), t(2, { estado: "lista" }), t(3, { estado: "liberada" })]);
  assert.equal(e.estado, "lista");
  assert.equal(e.actual?.posicion, 2);
});

test("un paso empezado o parado: En curso, nunca 'esperando el paso anterior'", () => {
  assert.equal(estadoDePieza([t(1, { estado: "en_curso" }), t(2, { estado: "liberada" })]).estado, "en_curso");
  assert.equal(estadoDePieza([t(1, { estado: "pausada" }), t(2, { estado: "liberada" })]).estado, "en_curso");
});

test("paso de Compras pendiente: Falta material, con lo que se sabe del pedido", () => {
  const e = estadoDePieza([t(1, { tipo: "compras", estado: "liberada", motivoTraba: "Esperando material" }), t(2)], compra({ esMaterial: true, pedido: true, llegadaPrevista: "2026-11-20" }));
  assert.equal(e.estado, "falta_material");
  assert.match(e.motivo ?? "", /pedido/);
});

test("trabada siempre con motivo", () => {
  const e = estadoDePieza([t(1, { estado: "trabada", motivoTraba: "Tercerizado demorado" })]);
  assert.deepEqual([e.estado, e.motivo], ["trabada", "Tercerizado demorado"]);
  assert.equal(estadoDePieza([t(1, { estado: "trabada" })]).motivo, "Sin motivo cargado");
});

test("con material pero fuera del plan: Trabada · Falta pasarla al plan", () => {
  const e = estadoDePieza([t(1, { estado: "futura" })]);
  assert.deepEqual([e.estado, e.motivo], ["trabada", "Falta pasarla al plan"]);
});

test("confirmada en 'Falta material' y la compra no llegó: Falta material aunque no tenga paso de Compras", () => {
  assert.equal(estadoDePieza([t(1, { estado: "futura" })], null, "Material: falta pedir").estado, "falta_material");
});

test("se compra hecha: Falta material hasta que llega, después Terminada", () => {
  assert.equal(estadoDePieza([], compra()).estado, "falta_material");
  assert.equal(estadoDePieza([], null).estado, "terminada");
});

test("'No comprar' en un artículo: no queda esperando la compra; se ve terminada con el motivo", () => {
  const e = estadoDePieza([], null, null, true);
  assert.deepEqual([e.estado, e.motivo], ["terminada", "No se compra: se decidió al cargar la orden"]);
});
