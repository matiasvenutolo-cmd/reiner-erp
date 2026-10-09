import type { Usuario } from "@/lib/db/schema";

/**
 * Quién puede modificar maestros: piezas y su hoja de ruta, adjuntos de
 * ingeniería, y tipos de operación y centros de trabajo (Administración →
 * Operaciones y centros). Observación del cliente en Fase 3: "Horacio no
 * debería tener acceso a la modificación de maestros" — taller los sigue
 * viendo (los links desde Stock y OT llevan ahí), pero sin editarlos.
 * La bitácora de la pieza no entra: es un registro de observaciones,
 * también de producción, no un dato maestro.
 */
export const ROLES_EDITAN_MAESTROS: Usuario["rol"][] = ["ingenieria", "direccion"];

export function puedeEditarMaestros(rol: Usuario["rol"]): boolean {
  return ROLES_EDITAN_MAESTROS.includes(rol);
}
