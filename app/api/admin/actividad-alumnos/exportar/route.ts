import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { fallo } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/actividad-alumnos/exportar — copia de respaldo, de sólo
 * lectura, de todo lo que `POST .../reiniciar` va a borrar. Se llama SIEMPRE
 * antes de reiniciar: sin esto, reiniciar sería un borrado sin posibilidad
 * de reconstruir nada si hiciera falta.
 */
export async function GET() {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  try {
    const [
      matriculas,
      entregasTarea,
      intentosDiagnostico,
      respuestasDiagnostico,
      sesionesAprendizaje,
      registrosProgreso,
      registrosError,
      historialNivel,
      perfilMaterias,
    ] = await Promise.all([
      prisma.matricula.findMany(),
      prisma.entregaTarea.findMany(),
      prisma.intentoDiagnostico.findMany(),
      prisma.respuestaDiagnostico.findMany(),
      prisma.sesionAprendizaje.findMany(),
      prisma.registroProgreso.findMany(),
      prisma.registroError.findMany(),
      prisma.historialNivel.findMany(),
      prisma.perfilMateria.findMany(),
    ]);

    return NextResponse.json({
      exportadoEn: new Date().toISOString(),
      conteos: {
        matriculas: matriculas.length,
        entregasTarea: entregasTarea.length,
        intentosDiagnostico: intentosDiagnostico.length,
        respuestasDiagnostico: respuestasDiagnostico.length,
        sesionesAprendizaje: sesionesAprendizaje.length,
        registrosProgreso: registrosProgreso.length,
        registrosError: registrosError.length,
        historialNivel: historialNivel.length,
        perfilMaterias: perfilMaterias.length,
      },
      datos: {
        matriculas,
        entregasTarea,
        intentosDiagnostico,
        respuestasDiagnostico,
        sesionesAprendizaje,
        registrosProgreso,
        registrosError,
        historialNivel,
        perfilMaterias,
      },
    });
  } catch (e) {
    return fallo(e, "admin/actividad-alumnos:exportar");
  }
}
