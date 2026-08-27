import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { INICIO_POR_ROL, puedeAcceder, zonaDe } from "@/lib/rbac";

// El middleware corre en el edge: usa sólo authConfig, sin Prisma ni bcrypt.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const usuario = req.auth?.user;
  const zona = zonaDe(pathname);

  // Ruta pública: pasa.
  if (!zona) {
    // Salvo /login y /registro, que no tienen sentido con la sesión ya abierta.
    if ((pathname === "/login" || pathname === "/registro") && usuario) {
      return NextResponse.redirect(
        new URL(INICIO_POR_ROL[usuario.rol], req.nextUrl),
      );
    }
    return NextResponse.next();
  }

  // Zona protegida sin sesión: al login, recordando a dónde quería ir.
  if (!usuario) {
    const destino = new URL("/login", req.nextUrl);
    destino.searchParams.set("volverA", pathname);
    return NextResponse.redirect(destino);
  }

  // Zona protegida con un rol que no corresponde: se le devuelve a SU zona, no
  // se le muestra un 403 anónimo que no le dice qué hacer.
  if (!puedeAcceder(usuario.rol, pathname)) {
    return NextResponse.redirect(
      new URL(INICIO_POR_ROL[usuario.rol], req.nextUrl),
    );
  }

  return NextResponse.next();
});

export const config = {
  // Se excluyen assets estáticos y la propia API de autenticación.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
