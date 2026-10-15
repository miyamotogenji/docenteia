import { prisma } from "@/lib/prisma";

/**
 * Datos en bruto para los reportes del docente (HITO 4, sección 4:
 * "Generación PDF/Excel… listado consolidado de notas", "pestañas separadas:
 * Estudiantes, Tareas, Matriz de Calificaciones y Sesiones/Asistencia").
 *
 * UNA sola consulta, reutilizada por el generador de PDF y el de Excel —los
 * dos arman el mismo reporte en dos formatos, no dos reportes distintos—.
 * Alcance: las aulas de ESTE docente (HITO 3), no el listado libre de
 * `app/docente/page.tsx` (que es anterior al multi-tenant y no distingue de
 * quién es cada alumno).
 */
export interface AulaDelReporte {
  id: string;
  nombre: string;
  grado: number;
  seccion: string;
  estudiantes: Array<{
    id: string;
    nombre: string;
    email: string;
    /** Sesiones de lección TERMINADAS —lo más parecido a "asistencia" que hay: no existe un registro de asistencia como tal. */
    sesionesCompletadas: number;
  }>;
  tareas: Array<{
    id: string;
    titulo: string;
    fechaVencimiento: Date;
    cantidadEjercicios: number;
  }>;
  /** Una fila por (tarea, estudiante) con entrega: la matriz de calificaciones sale de cruzar esto con `tareas` × `estudiantes`. */
  entregas: Array<{
    tareaId: string;
    estudianteId: string;
    completada: boolean;
    puntaje: number | null;
    fechaEntrega: Date | null;
  }>;
}

export async function obtenerReporteDocente(docenteId: string): Promise<AulaDelReporte[]> {
  const aulas = await prisma.aula.findMany({
    where: { docenteId },
    orderBy: [{ grado: "asc" }, { seccion: "asc" }],
    include: {
      matriculas: {
        include: {
          estudiante: {
            select: {
              id: true,
              nombre: true,
              email: true,
              perfilEstudiante: {
                select: { sesiones: { where: { finalizadaEn: { not: null } }, select: { id: true } } },
              },
            },
          },
        },
      },
      tareas: {
        orderBy: { fechaVencimiento: "asc" },
        include: { entregas: { select: { estudianteId: true, completada: true, puntaje: true, fechaEntrega: true } } },
      },
    },
  });

  return aulas.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    grado: a.grado,
    seccion: a.seccion,
    estudiantes: a.matriculas.map((m) => ({
      id: m.estudiante.id,
      nombre: m.estudiante.nombre,
      email: m.estudiante.email,
      sesionesCompletadas: m.estudiante.perfilEstudiante?.sesiones.length ?? 0,
    })),
    tareas: a.tareas.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      fechaVencimiento: t.fechaVencimiento,
      cantidadEjercicios: t.cantidadEjercicios,
    })),
    entregas: a.tareas.flatMap((t) =>
      t.entregas.map((e) => ({
        tareaId: t.id,
        estudianteId: e.estudianteId,
        completada: e.completada,
        puntaje: e.puntaje,
        fechaEntrega: e.fechaEntrega,
      })),
    ),
  }));
}
