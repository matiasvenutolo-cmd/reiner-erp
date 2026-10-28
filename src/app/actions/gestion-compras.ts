"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "@/lib/revalidar";
import { getUsuarioDeCompras } from "@/lib/session";
import {
  crearSolicitudDesdeNecesidad,
  crearSolicitudGeneral,
  actualizarSolicitud,
  anularSolicitud,
  agregarCotizacion,
  completarTipoCambio,
  eliminarCotizacion,
  elegirCotizacion,
  confirmarCompra,
  registrarRecepcion,
  registrarPago,
  eliminarPago,
  type Moneda,
} from "@/lib/data/gestion-compras";

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const numero = (fd: FormData, k: string) => {
  const v = texto(fd, k).replace(",", "."); // los campos son type="number" (punto decimal); por las dudas acepta coma
  return v === "" ? NaN : Number(v);
};

/**
 * Corre la acción y vuelve a la pantalla con el resultado explicado: el motivo
 * si se rechazó, o qué se hizo y qué sigue si salió bien. Sólo el perfil
 * Compras (el único acceso nuevo de esta etapa — ver docs/06 §26).
 */
async function correr(volverA: string, fn: (usuarioId: string) => Promise<string | void>, ok: string | (() => string)) {
  const usuario = await getUsuarioDeCompras();
  let error: string | null = null;
  let destino = volverA;
  try {
    const nuevoDestino = await fn(usuario.id);
    if (nuevoDestino) destino = nuevoDestino;
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo guardar.";
  }
  if (error) redirect(`${volverA}?error=${encodeURIComponent(error)}`);
  revalidatePath("/compras", "layout");
  revalidatePath("/proveedores", "layout");
  revalidatePath("/stock", "layout");
  redirect(`${destino}?ok=${encodeURIComponent(typeof ok === "function" ? ok() : ok)}`);
}

export async function tomarNecesidadAction(formData: FormData) {
  const otPiezaId = texto(formData, "otPiezaId");
  await correr(
    "/compras",
    async (u) => `/compras/${await crearSolicitudDesdeNecesidad(otPiezaId, u)}`,
    "Compra creada. Cargá la fecha en que se necesita y las cotizaciones que vayas recibiendo.",
  );
}

export async function crearCompraGeneralAction(formData: FormData) {
  await correr(
    "/compras/nueva",
    async (u) =>
      `/compras/${await crearSolicitudGeneral({
        descripcion: texto(formData, "descripcion"),
        cantidad: numero(formData, "cantidad"),
        unidad: texto(formData, "unidad"),
        fechaNecesidad: texto(formData, "fechaNecesidad"),
        observacion: texto(formData, "observacion"),
        usuarioId: u,
      })}`,
    "Compra creada. Ahora cargá las cotizaciones que vayas recibiendo.",
  );
}

export async function actualizarSolicitudAction(formData: FormData) {
  const id = texto(formData, "id");
  const campos: Parameters<typeof actualizarSolicitud>[1] = {};
  for (const c of ["descripcion", "unidad", "observacion", "fechaNecesidad", "fechaCompraPrevista", "fechaPagoPrevista"] as const) {
    if (formData.has(c)) campos[c] = texto(formData, c);
  }
  if (formData.has("cantidad")) campos.cantidad = numero(formData, "cantidad");
  await correr(`/compras/${id}`, () => actualizarSolicitud(id, campos), "Cambios guardados.");
}

export async function anularSolicitudAction(formData: FormData) {
  const id = texto(formData, "id");
  await correr(`/compras/${id}`, () => anularSolicitud(id), "Compra anulada.");
}

export async function agregarCotizacionAction(formData: FormData) {
  const id = texto(formData, "solicitudId");
  const plazo = texto(formData, "tiempoEntregaDias");
  let aviso = "Cotización agregada.";
  await correr(
    `/compras/${id}`,
    async (u) => {
      const { sinTipoCambio } = await agregarCotizacion(
        id,
        {
          proveedorId: texto(formData, "proveedorId"),
          cantidad: numero(formData, "cantidad"),
          precioUnitario: numero(formData, "precioUnitario"),
          moneda: texto(formData, "moneda") as Moneda,
          tiempoEntregaDias: plazo === "" ? null : Number(plazo),
          condicionPago: texto(formData, "condicionPago"),
          observaciones: texto(formData, "observaciones"),
          fechaConfirmacionPosible: texto(formData, "fechaConfirmacionPosible"),
          fecha: texto(formData, "fecha"),
        },
        u,
      );
      if (sinTipoCambio) aviso = "Cotización agregada, pero no se pudo obtener el tipo de cambio oficial: quedó sin conversión. Probá completarlo más tarde.";
    },
    () => aviso,
  );
}

export async function completarTipoCambioAction(formData: FormData) {
  const id = texto(formData, "solicitudId");
  await correr(
    `/compras/${id}`,
    async () => {
      if (!(await completarTipoCambio(texto(formData, "cotizacionId")))) throw new Error("La fuente oficial del tipo de cambio sigue sin responder. Probá más tarde.");
    },
    "Tipo de cambio completado.",
  );
}

export async function eliminarCotizacionAction(formData: FormData) {
  const id = texto(formData, "solicitudId");
  await correr(`/compras/${id}`, async () => void (await eliminarCotizacion(texto(formData, "cotizacionId"))), "Cotización eliminada.");
}

export async function elegirCotizacionAction(formData: FormData) {
  const id = texto(formData, "solicitudId");
  const cotizacionId = texto(formData, "cotizacionId") || null;
  await correr(
    `/compras/${id}`,
    () => elegirCotizacion(id, cotizacionId),
    cotizacionId ? "Cotización elegida: la compra ya cuenta en Gastos futuros. Siguiente paso: confirmarla al proveedor." : "Se deshizo la elección.",
  );
}

export async function confirmarCompraAction(formData: FormData) {
  const id = texto(formData, "solicitudId");
  await correr(`/compras/${id}`, (u) => confirmarCompra(id, texto(formData, "fecha"), u), "Compra confirmada. Cuando llegue, registrá la entrega con su control.");
}

export async function registrarRecepcionAction(formData: FormData) {
  const id = texto(formData, "solicitudId");
  const resultado = texto(formData, "resultado");
  await correr(
    `/compras/${id}`,
    async (u) => {
      if (resultado !== "ok" && resultado !== "no_ok") throw new Error("Indicá si la entrega llegó OK o NO OK.");
      await registrarRecepcion(id, { resultado, fecha: texto(formData, "fecha"), observacion: texto(formData, "observacion") }, u);
    },
    resultado === "ok" ? "Entrega registrada como OK." : "Entrega registrada como NO OK: la compra sigue esperando una entrega OK.",
  );
}

export async function registrarPagoAction(formData: FormData) {
  const id = texto(formData, "solicitudId");
  await correr(
    `/compras/${id}`,
    (u) => registrarPago(id, { fecha: texto(formData, "fecha"), importe: numero(formData, "importe"), observacion: texto(formData, "observacion") }, u),
    "Pago registrado: ese importe ya es gasto efectuado. Si queda saldo, sigue en Gastos futuros.",
  );
}

export async function eliminarPagoAction(formData: FormData) {
  const id = texto(formData, "solicitudId");
  await correr(`/compras/${id}`, async () => void (await eliminarPago(texto(formData, "pagoId"))), "Pago eliminado.");
}
