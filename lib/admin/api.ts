import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * Lo que comparten las rutas de /api/admin (HITO 4 — cierre PMV2): quién
 * entra.
 *
 * Mismo patrón que `exigirDocente` en `lib/docente/api.ts` —no se importa de
 * ahí porque el admin de plataforma no es un caso particular del dominio
 * docente, es su propio dominio—, pero con la puerta más estrecha posible:
 * `/admin` es, en `lib/rbac.ts`, la única zona que SUPERADMIN no comparte con
 * nadie. Una ruta de administración que aceptara también a DIRECTOR o
 * DOCENTE le daría a un director el mismo poder que al administrador de la
 * plataforma entera —activar o suspender CUALQUIER cuenta, de cualquier
 * colegio—, y eso es justo lo que la zona /admin existe para no permitir.
 */

export interface AutorizacionAdmin {
  usuarioId: string;
  nombre: string;
}

type Resultado =
  | { ok: true; quien: AutorizacionAdmin }
  | { ok: false; respuesta: NextResponse };

export async function exigirSuperadmin(): Promise<Resultado> {
  const sesion = await auth();
  const usuario = sesion?.user;

  if (!usuario) {
    return {
      ok: false,
      respuesta: NextResponse.json({ error: "No autenticado." }, { status: 401 }),
    };
  }
  if (usuario.rol !== "SUPERADMIN") {
    return {
      ok: false,
      respuesta: NextResponse.json(
        { error: "Sólo el administrador de la plataforma puede hacer esto." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, quien: { usuarioId: usuario.id, nombre: usuario.name ?? "" } };
}
