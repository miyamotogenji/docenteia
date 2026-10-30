import { z } from "zod";

/**
 * Reinicio de datos de prueba (HITO 4 — cierre PMV2, petición del cliente
 * tras la liquidación: "entorno de pruebas limpio... dejar limpias las
 * tablas transaccionales de alumnos, matrículas, tareas entregadas y
 * evaluaciones docentes", para validar el flujo operativo completo desde
 * cero antes de la aceptación final).
 *
 * Alcance DELIBERADAMENTE estrecho —sólo actividad del alumno, nunca
 * cuentas, aulas ni tareas—: es la única base de datos que existe (no hay
 * entorno de prueba separado), así que lo que se borra aquí se borra en el
 * sistema real del cliente. Lo que SÍ se borra:
 *
 *   - Matrícula (el alumno vuelve a "sin aula", puede matricularse de cero).
 *   - EntregaTarea (la entrega Y su nota/evaluación viven en la misma fila:
 *     `puntaje` es justo la "evaluación docente" del pliego).
 *   - IntentoDiagnostico + RespuestaDiagnostico (en cascada, al borrar el
 *     intento).
 *   - SesionAprendizaje, RegistroProgreso, RegistroError (actividad de
 *     lección/práctica).
 *   - HistorialNivel, PerfilMateria (derivados de esa actividad).
 *   - `PerfilEstudiante.nivelActual`/`nivelAsignadoEn` vuelven a `null`: es
 *     un RESULTADO del diagnóstico que se acaba de borrar, no un dato
 *     declarado por nadie, así que dejarlo tal cual mentiría sobre un
 *     diagnóstico que ya no existe.
 *
 * Lo que NO se toca, a propósito: `Usuario` (ninguna cuenta, de ningún rol),
 * `PerfilEstudiante.etapa`/`curso` (lo declaró el alumno o el admin, no es
 * actividad), `Institucion`, `Aula`, `Tarea` (las tareas que un docente
 * programó siguen programadas; lo que desaparece es que alguien ya las haya
 * entregado), y todo el contenido curricular (`Materia`, `NodoConocimiento`,
 * `Ejercicio`, `ReglaMatematica`, `PreguntaDiagnostico`).
 */
export const MODELOS_ACTIVIDAD_ALUMNOS = [
  "respuestaDiagnostico",
  "intentoDiagnostico",
  "registroProgreso",
  "registroError",
  "sesionAprendizaje",
  "historialNivel",
  "perfilMateria",
  "entregaTarea",
  "matricula",
] as const;

/**
 * El reinicio es irreversible y de un solo sentido: exige repetir la
 * palabra exacta en el cuerpo de la petición, no basta con la sesión de
 * SUPERADMIN. Mismo motivo que un `rm -rf` pide `-i` en los sitios serios:
 * una sesión abierta en una pestaña de más, o una petición repetida por
 * error, no debe poder disparar esto por accidente.
 */
export const reiniciarActividadSchema = z.object({
  confirmar: z.literal("REINICIAR"),
});
export type ReiniciarActividad = z.infer<typeof reiniciarActividadSchema>;
