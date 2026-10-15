import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import {
  bloqueoDeLogin,
  ipDeLaPeticion,
  registrarExitoDeLogin,
  registrarFalloDeLogin,
} from "@/lib/seguridad/limite-tasa";

/** 5 fallos seguidos bloquean la IP 15 minutos (corrección HITO 4). */
const MAXIMO_FALLOS_LOGIN = 5;
const BLOQUEO_LOGIN_MS = 15 * 60_000;

/** Esquema de las credenciales. Se valida antes de tocar la base de datos. */
const credencialesSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credenciales",
      credentials: {
        email: { label: "Correo electrónico", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credencialesSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // 5 FALLOS SEGUIDOS DESDE LA MISMA IP BLOQUEAN 15 MINUTOS (HITO 4):
        // la fuerza bruta contra el login se corta ANTES de tocar la base de
        // datos o comparar el hash —ni siquiera se gasta ese trabajo—, y
        // ANTES de que el intento llegue a contar como un fallo más (si no,
        // un atacante ya bloqueado seguiría "fallando" y renovando su propio
        // bloqueo sin fin, que es un detalle menor pero gratis de evitar).
        const clave = `login:${ipDeLaPeticion(request)}`;
        const bloqueo = bloqueoDeLogin(clave);
        if (!bloqueo.permitido) return null;

        // Un fallo de infraestructura aquí acabaría mostrándose al usuario como
        // "correo o contraseña incorrectos", que es justo la pista equivocada.
        // No se puede cambiar lo que ve el usuario sin revelar si la cuenta
        // existe, pero sí se deja constancia inequívoca en el log del servidor.
        let usuario;
        try {
          usuario = await prisma.usuario.findUnique({
            where: { email },
            include: {
              perfilEstudiante: {
                select: { id: true, nivelActual: true },
              },
            },
          });
        } catch (e) {
          const infra = explicarFalloDeBaseDeDatos(e);
          console.error(
            `[auth] el inicio de sesión falló por la base de datos (${infra?.registro ?? "desconocido"}): ${infra?.mensaje ?? String(e)}`,
          );
          throw e;
        }

        // Se compara siempre contra un hash, exista el usuario o no, para que
        // el tiempo de respuesta no revele qué correos están registrados.
        const hash =
          usuario?.passwordHash ??
          "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduO";
        const coincide = await bcrypt.compare(password, hash);

        if (!usuario || !coincide || !usuario.activo) {
          registrarFalloDeLogin(clave, MAXIMO_FALLOS_LOGIN, BLOQUEO_LOGIN_MS);
          return null;
        }
        registrarExitoDeLogin(clave);

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.nombre,
          rol: usuario.rol,
          perfilId: usuario.perfilEstudiante?.id ?? null,
          nivelActual: usuario.perfilEstudiante?.nivelActual ?? null,
          // HITO 3: a qué colegio pertenece, si es DOCENTE o DIRECTOR. Viaja en
          // la sesión por la misma razón que `perfilId` —las rutas de
          // /api/docente/aulas y /api/director/resumen lo necesitan en cada
          // petición, y leerlo de la base en cada una sería una consulta de
          // más por petición que el token ya puede ahorrarse—.
          institucionId: usuario.institucionId ?? null,
        };
      },
    }),
  ],
});
