"use client";

import { SessionProvider } from "next-auth/react";

/**
 * La sesión se expone a los componentes de cliente que la necesitan (el
 * formulario del diagnóstico la refresca al terminar, para que el nivel recién
 * asignado aparezca sin obligar a volver a entrar).
 */
export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
