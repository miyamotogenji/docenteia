import { NextResponse } from "next/server";

// Núcleo pedagógico heredado, en JavaScript. Se importa tal cual, a propósito:
// es la lógica matemática validada del prototipo y reescribirla en TypeScript
// significaría reescribir la pedagogía. Sus tipos se declaran en
// src/queryCore.d.ts, así que desde aquí se consume con tipos estrictos.
import { salud, limiteGeneral, manejarConsulta } from "@/src/queryCore.js";

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

  const r = await manejarConsulta(body, ip);
  return NextResponse.json(r.json, { status: r.status, headers: r.headers });
}

export async function GET() {
  // Cómodo para comprobar desde el navegador que la ruta está viva.
  return NextResponse.json(salud());
}
