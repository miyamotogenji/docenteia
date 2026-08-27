import { NextResponse } from "next/server";

import { salud } from "@/src/queryCore.js";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salud del servicio.
 *
 * Amplía la del prototipo con el estado real de la persistencia, que en el PMV
 * 1 es una dependencia dura: sin ella no hay login, ni diagnóstico, ni
 * progreso. Distingue tres situaciones que desde fuera se ven igual —"la app
 * falla"— pero se arreglan de forma muy distinta:
 *
 *   sin_configurar → faltan las variables de entorno
 *   sin_migrar     → la base responde, pero no tiene las tablas
 *   sin_sembrar    → hay tablas, pero el banco de preguntas está vacío
 *   ok             → todo listo
 *
 * No revela la cadena de conexión ni la API key, sólo si están en su sitio.
 */
export async function GET() {
  const base = salud();

  let estado:
    | "ok"
    | "sin_configurar"
    | "sin_migrar"
    | "sin_sembrar"
    | "error" = "sin_configurar";
  let detalle: string | null = null;
  let preguntasActivas: number | null = null;

  if (!process.env.DATABASE_URL) {
    detalle = "Falta la variable de entorno DATABASE_URL.";
  } else {
    try {
      // Contar preguntas toca una tabla real: si no existe, Prisma lanza P2021
      // y sabemos que faltan las migraciones. Un simple "SELECT 1" habría
      // pasado y el problema seguiría escondido.
      preguntasActivas = await prisma.preguntaDiagnostico.count({
        where: { activa: true },
      });
      if (preguntasActivas === 0) {
        estado = "sin_sembrar";
        detalle = "No hay preguntas de diagnóstico. Ejecuta: npm run db:seed";
      } else {
        estado = "ok";
      }
    } catch (e) {
      const infra = explicarFalloDeBaseDeDatos(e);
      detalle = infra?.mensaje ?? "No se pudo consultar la base de datos.";
      estado = infra?.registro === "tablas_inexistentes" ? "sin_migrar" : "error";
    }
  }

  return NextResponse.json(
    {
      ...base,
      app: "docenteia",
      paso: 1,
      base_datos: estado,
      preguntas_activas: preguntasActivas,
      detalle,
    },
    { status: estado === "ok" ? 200 : 503 },
  );
}
