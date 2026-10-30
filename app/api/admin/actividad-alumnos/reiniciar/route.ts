import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { fallo, leerCuerpo } from "@/lib/docente/api";
import { reiniciarActividadSchema } from "@/lib/admin/reinicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/actividad-alumnos/reiniciar — "entorno de pruebas limpio"
 * (HITO 4, cierre contractual): deja en cero toda la actividad del alumno
 * para que el cliente pueda validar el flujo operativo completo desde cero,
 * sin tocar cuentas, aulas, tareas programadas ni currículo. Ver el porqué
 * exacto de este alcance en `lib/admin/reinicio.ts`.
 *
 * Exige repetir `{ confirmar: "REINICIAR" }` en el cuerpo además de la
 * sesión de SUPERADMIN: es irreversible y esta es la única base de datos
 * que hay, así que no debe poder dispararse sin querer.
 */
export async function POST(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, reiniciarActividadSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;

  try {
    const [
      respuestasDiagnostico,
      intentosDiagnostico,
      registrosProgreso,
      registrosError,
      sesionesAprendizaje,
      historialNivel,
      perfilMaterias,
      entregasTarea,
      matriculas,
      perfiles,
    ] = await prisma.$transaction([
      prisma.respuestaDiagnostico.deleteMany(),
      prisma.intentoDiagnostico.deleteMany(),
      prisma.registroProgreso.deleteMany(),
      prisma.registroError.deleteMany(),
      prisma.sesionAprendizaje.deleteMany(),
      prisma.historialNivel.deleteMany(),
      prisma.perfilMateria.deleteMany(),
      prisma.entregaTarea.deleteMany(),
      prisma.matricula.deleteMany(),
      prisma.perfilEstudiante.updateMany({
        data: { nivelActual: null, nivelAsignadoEn: null },
      }),
    ]);

    return NextResponse.json({
      reiniciado: true,
      reiniciadoEn: new Date().toISOString(),
      borrados: {
        respuestasDiagnostico: respuestasDiagnostico.count,
        intentosDiagnostico: intentosDiagnostico.count,
        registrosProgreso: registrosProgreso.count,
        registrosError: registrosError.count,
        sesionesAprendizaje: sesionesAprendizaje.count,
        historialNivel: historialNivel.count,
        perfilMaterias: perfilMaterias.count,
        entregasTarea: entregasTarea.count,
        matriculas: matriculas.count,
      },
      perfilesConNivelReiniciado: perfiles.count,
    });
  } catch (e) {
    return fallo(e, "admin/actividad-alumnos:reiniciar");
  }
}
