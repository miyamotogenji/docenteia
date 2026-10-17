import { z } from "zod";

import { aulaSchema } from "../docente/aulas.ts";

/**
 * Gestión centralizada de aulas y matrículas (checklist actualizado de HITO
 * 4: "el docente sólo visualiza las aulas asignadas por el colegio"; crearlas
 * y matricular pasan a ser cosa del SUPERADMIN).
 *
 * Separado de la ruta por el mismo motivo que `lib/admin/usuarios.ts`: forma
 * y validación sin Prisma ni Next.js, para que la QA lo ejercite sin
 * servidor.
 */

/**
 * Un aula nueva, creada por el administrador.
 *
 * A diferencia de `aulaSchema` (que usa el docente, y donde `institucionId`
 * y `docenteId` salen de la sesión) aquí SÍ se piden explícitos: el
 * administrador gestiona TODA la plataforma, no un colegio propio, así que
 * no hay sesión de la que deducirlos —es, de hecho, el motivo de que esta
 * ruta exista—.
 */
export const aulaAdminSchema = aulaSchema.extend({
  docenteId: z.string().trim().min(1, "Falta elegir el docente titular."),
  institucionId: z.string().trim().min(1, "Falta elegir la institución."),
});
export type EntradaAulaAdmin = z.infer<typeof aulaAdminSchema>;

/**
 * Matricular a un alumno en un aula directamente, sin pasar por el código de
 * acceso —"sin depender únicamente del código de invitación", como pide el
 * pliego—.
 */
export const matriculaAdminSchema = z.object({
  estudianteId: z.string().trim().min(1, "Falta elegir el alumno."),
  aulaId: z.string().trim().min(1, "Falta elegir el aula."),
});
export type EntradaMatriculaAdmin = z.infer<typeof matriculaAdminSchema>;
