import { z } from "zod";

/**
 * Purga de cuentas de alumno (HITO 4 — cierre PMV2, petición del cliente tras
 * el reinicio de actividad: con la actividad ya en cero, siguen quedando
 * decenas de cuentas `Usuario` de rol ESTUDIANTE acumuladas de meses de
 * pruebas, y estorban para revisar el aplicativo con una sola cuenta de
 * alumno a la vista).
 *
 * Distinto en naturaleza de `lib/admin/reinicio.ts`: aquello borraba
 * ACTIVIDAD (algo que un alumno hizo); esto borra CUENTAS (quién puede
 * entrar). Por eso exige, además de `confirmar`, la lista explícita de qué
 * correos SÍ deben sobrevivir —nunca un "bórralos todos" implícito—: así un
 * cuerpo vacío o mal armado no puede dejar la plataforma sin ningún alumno
 * con el que entrar.
 *
 * Alcance: sólo `Usuario` con `rol: "ESTUDIANTE"`. Nunca toca DOCENTE,
 * DIRECTOR ni SUPERADMIN. El borrado de cada cuenta cae en cascada sobre su
 * `PerfilEstudiante`, `Matricula` y `EntregaTarea` (ya vacías tras el
 * reinicio de actividad); no toca currículo.
 */
export const purgarEstudiantesSchema = z.object({
  confirmar: z.literal("PURGAR"),
  conservarEmails: z.array(z.string().email()).min(1),
});
export type PurgarEstudiantes = z.infer<typeof purgarEstudiantesSchema>;
