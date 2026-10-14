import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, noEncontrado } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Un aula concreta, con sus alumnos: lo que abre el botón "Ver estudiantes"
 * de la tarjeta de aula.
 *
 * Sólo el docente TITULAR del aula puede verla —no "cualquier docente del
 * colegio"—: la lista de alumnos de un aula ajena no es asunto suyo, y para
 * eso está el panel del director, que sí ve el colegio entero.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;

  try {
    const aula = await prisma.aula.findUnique({
      where: { id },
      include: {
        matriculas: {
          orderBy: { creadoEn: "asc" },
          include: { estudiante: { select: { id: true, nombre: true, email: true } } },
        },
        // Lo que pidió el cliente tras el QA: desde la propia aula, sin ir a
        // buscarla a otro sitio, el docente tiene que poder ver QUÉ tarea
        // asignó, con qué plazos y quién de sus matriculados ya entregó.
        tareas: {
          orderBy: { creadoEn: "desc" },
          include: {
            entregas: {
              where: { completada: true },
              select: { estudianteId: true, completada: true, puntaje: true, detalle: true },
            },
          },
        },
      },
    });

    if (!aula || aula.docenteId !== permiso.quien.usuarioId) return noEncontrado("El aula");

    return NextResponse.json({
      aula: {
        id: aula.id,
        nombre: aula.nombre,
        grado: aula.grado,
        seccion: aula.seccion,
        codigoAcceso: aula.codigoAcceso,
        activa: aula.activa,
      },
      estudiantes: aula.matriculas.map((m) => ({
        matriculaId: m.id,
        id: m.estudiante.id,
        nombre: m.estudiante.nombre,
        email: m.estudiante.email,
        matriculadoEn: m.creadoEn,
      })),
      tareas: aula.tareas.map((t) => {
        const entregadas = t.entregas.filter((e) => e.completada).length;
        return {
          id: t.id,
          titulo: t.titulo,
          fechaInicio: t.fechaInicio,
          fechaVencimiento: t.fechaVencimiento,
          cantidadEjercicios: t.cantidadEjercicios,
          limiteReintentos: t.limiteReintentos,
          entregadas,
          // Pendientes se cuenta sobre los matriculados, no sobre las
          // entregas: un alumno que todavía no entregó no tiene fila en
          // `entregas`, así que restar es lo único que lo cuenta.
          pendientes: Math.max(0, aula.matriculas.length - entregadas),
          // "Ver ejercicios de la tarea" (corrección QA) sólo tiene sentido
          // si la tarea viene del banco —con la IA no hay un conjunto FIJO
          // que mostrar, cada alumno recibe el suyo—.
          ejercicioIds: t.ejercicioIds,
          // La dificultad es de LA TAREA, no de cada ejercicio uno a uno
          // (corrección QA: "a la derecha de cada ejercicio se repite el
          // texto 'AVANZADO' en cada fila" — porque todos comparten la
          // misma—): se enseña una sola vez, en la cabecera.
          dificultad: t.dificultad,
          // El desglose de cada entrega YA completada, para que "Ver
          // ejercicios de la tarea" pueda decir, ejercicio por ejercicio,
          // si se acertó —sin esto no había forma de saber qué contestó
          // nadie, sólo la respuesta correcta del banco—.
          entregas: t.entregas.map((e) => ({ detalle: e.detalle })),
        };
      }),
    });
  } catch (e) {
    return fallo(e, "docente/aulas/[id]:leer");
  }
}

/**
 * Borra un aula propia —y, en cascada, sus matrículas, tareas y entregas (ver
 * `onDelete: Cascade` en el esquema)—.
 *
 * No la pidió el cliente como funcionalidad: la necesita esta corrección QA
 * para poder limpiar las aulas de prueba que las baterías de verificación
 * contra el sitio publicado dejaron en la cuenta de demostración —"el
 * docente no debe crear nuevas aulas para cada tarea" es la interfaz
 * comportándose bien; lo confuso eran esas aulas de prueba—. Mismo candado
 * de titularidad que el resto de esta ruta: sólo el docente DUEÑO del aula
 * puede borrarla.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;

  try {
    const aula = await prisma.aula.findUnique({ where: { id }, select: { docenteId: true } });
    if (!aula || aula.docenteId !== permiso.quien.usuarioId) return noEncontrado("El aula");

    await prisma.aula.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fallo(e, "docente/aulas/[id]:borrar");
  }
}
