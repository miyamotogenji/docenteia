import { z } from "zod";

import { ROLES } from "../rbac.ts";

/**
 * Gestión de usuarios y roles (HITO 4 — cierre PMV2, "3.B Control de Accesos
 * y Gestión de Usuarios"): activar/suspender cuentas, reasignar roles,
 * vincular a una institución.
 *
 * Separado de la ruta por el mismo motivo que `lib/docente/aulas.ts`: es
 * forma y unas pocas reglas sin Prisma ni Next.js de por medio, así que la
 * suite de QA lo ejercita sin levantar servidor ni base de datos.
 */

/**
 * Lo que `PATCH /api/admin/usuarios/[id]` acepta. Los tres campos son
 * independientes y optativos —se puede mandar sólo `activo`, sólo `rol`, o
 * los tres a la vez—, porque los tres controles de la pantalla (el
 * interruptor de activo, el selector de rol, el de institución) actúan cada
 * uno por su cuenta.
 */
export const patchUsuarioSchema = z.object({
  activo: z.boolean().optional(),
  rol: z.enum(ROLES).optional(),
  /// `null` desvincula de cualquier institución; `undefined` (el campo
  /// ausente) deja la que ya tuviera. Son dos cosas distintas a propósito:
  /// sin esto no habría forma de pedir "quita la institución" sin, a la vez,
  /// estar obligado a mandar también `rol` o `activo`.
  institucionId: z.string().trim().min(1).nullable().optional(),
});
export type PatchUsuario = z.infer<typeof patchUsuarioSchema>;

/**
 * ¿Tiene sentido vincular a una institución el rol resultante? Sólo DOCENTE
 * y DIRECTOR pertenecen a un colegio por esta vía —un ESTUDIANTE entra en
 * las aulas de sus profesores por matrícula, no por institución directa (ver
 * el comentario de `Usuario.institucionId` en el esquema)—, así que asignarle
 * una a un estudiante o a un SUPERADMIN sería un dato que la aplicación
 * nunca lee, guardado como si significara algo.
 */
export function rolUsaInstitucion(rol: string): boolean {
  return rol === "DOCENTE" || rol === "DIRECTOR";
}
