import { NextResponse } from "next/server";

// Núcleo pedagógico heredado, en JavaScript. Se importa tal cual, a propósito:
// es la lógica matemática validada del prototipo y reescribirla en TypeScript
// significaría reescribir la pedagogía. Sus tipos se declaran en
// src/queryCore.d.ts, así que desde aquí se consume con tipos estrictos.
import { salud, limiteGeneral, manejarConsulta } from "@/src/queryCore.js";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  contextoDeAlumno,
  contextoParaElModelo,
  type ContextoAlumno,
} from "@/lib/perfil/contexto";

// Node, no edge: el núcleo usa temporizadores y estado en memoria (caché LRU y
// ventanas del limitador) que el runtime edge no conserva entre invocaciones.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** IP del solicitante, respetando la cabecera del proxy (Vercel/Render). */
function ipDe(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "desconocida";
}

export async function POST(req: Request) {
  const ip = ipDe(req);

  // Capa 1: tope general por IP, idéntico al del prototipo.
  const limite = limiteGeneral(ip);
  if (!limite.ok) {
    return NextResponse.json(limite.json, {
      status: limite.status,
      headers: limite.headers,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Falta la consulta ('query')." }, { status: 400 });
  }

  // Los metadatos académicos del alumno viajan con la consulta: el ciclo, el
  // nivel que le asignó el diagnóstico y sus debilidades. Sin ellos, el motor
  // generaba la misma lección para un alumno de Básico recién diagnosticado que
  // para uno Avanzado con veinte fallos de factorización a la espalda.
  //
  // Sin sesión no se añade nada y la consulta se comporta igual que siempre: la
  // lección determinista no puede depender de quién la pida, o dejaría de ser
  // reproducible.
  const alumno = await contextoDelSolicitante();
  const cuerpo =
    alumno && body && typeof body === "object"
      ? {
          ...(body as Record<string, unknown>),
          alumno: { ...alumno, resumen: contextoParaElModelo(alumno) },
        }
      : body;

  const r = await manejarConsulta(cuerpo, ip);
  return NextResponse.json(r.json, { status: r.status, headers: r.headers });
}

/**
 * El contexto académico de quien consulta, o `null` si no hay sesión.
 *
 * Un fallo al leerlo no puede tumbar la consulta: la lección es lo importante y
 * el contexto sólo la afina. Si la base no responde, se sigue sin él.
 */
async function contextoDelSolicitante(): Promise<ContextoAlumno | null> {
  try {
    const sesion = await auth();
    const perfilId = sesion?.user?.perfilId;
    if (!perfilId) return null;

    const [perfil, errores] = await Promise.all([
      prisma.perfilEstudiante.findUnique({
        where: { id: perfilId },
        select: { ciclo: true, grado: true, nivelActual: true, nivelAsignadoEn: true },
      }),
      prisma.registroError.findMany({
        where: { perfilId },
        orderBy: { ocurrencias: "desc" },
        take: 5,
        select: { tema: true, tipoError: true, ocurrencias: true },
      }),
    ]);

    return contextoDeAlumno(perfil, errores);
  } catch {
    return null;
  }
}

export async function GET() {
  // Cómodo para comprobar desde el navegador que la ruta está viva.
  return NextResponse.json(salud());
}
