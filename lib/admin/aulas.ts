import { z } from "zod";

import { aulaSchema } from "../docente/aulas.ts";
import { cursoValido } from "../curriculo/etapas.ts";

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
 * SIN `docenteId` (corrección del cliente, tras ver el primer formulario:
 * "desacoplar el alta de la estructura física/académica de la asignación de
 * personas" — un aula se crea como entidad independiente, con sólo nombre,
 * grado, sección e institución; el docente titular se asigna DESPUÉS, con
 * `asignarDocenteSchema`). `institucionId` SÍ se pide explícito, a
 * diferencia de `aulaSchema` (que usa el docente, y donde sale de su
 * sesión): el administrador gestiona TODA la plataforma, no un colegio
 * propio, así que no hay sesión de la que deducirlo.
 */
export const aulaAdminSchema = aulaSchema
  .extend({
    institucionId: z.string().trim().min(1, "Falta elegir la institución."),
    /**
     * LA ETAPA DEL AULA (cierre de HITO 4, a petición del cliente: "el rol
     * Estudiante sí debe tener institución" —un alumno la tiene por esta vía,
     * aula por aula, nunca por `Usuario.institucionId`, que sigue siendo
     * sólo de DOCENTE/DIRECTOR/SUPERADMIN— y "al asignar el aula, persistir
     * el grado académico del estudiante"). Sin esto, `grado` (1 a 12) es
     * ambiguo —no se sabe si "grado 3" es primaria, secundaria o superior—,
     * así que no hay con qué completar el perfil del alumno al matricularlo.
     * Obligatoria aquí (a diferencia de `Aula.etapa` en el esquema, que es
     * optativa para no romper las aulas creadas antes de esta corrección):
     * toda aula NUEVA la declara.
     */
    etapa: z.enum(["PRIMARIA", "SECUNDARIA", "SUPERIOR"]),
  })
  .refine((d) => cursoValido(d.etapa, d.grado), {
    message: "Ese grado no existe dentro de la etapa elegida.",
    path: ["grado"],
  });
export type EntradaAulaAdmin = z.infer<typeof aulaAdminSchema>;

/**
 * Asignar (o quitar) el docente titular de un aula YA creada —el "Flujo de
 * Asignación Posterior" que pide el pliego—. `docenteId: null` desvincula al
 * titular actual sin asignar uno nuevo; es un valor legítimo, no un campo
 * vacío por error.
 */
export const asignarDocenteSchema = z.object({
  docenteId: z.string().trim().min(1).nullable(),
});
export type EntradaAsignarDocente = z.infer<typeof asignarDocenteSchema>;

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
