import type { Rol } from "@prisma/client";

/**
 * Control de acceso basado en roles (RBAC).
 *
 * Los tres perfiles son independientes: un usuario tiene exactamente un rol y
 * ese rol decide a qué zona de la aplicación entra. ADMIN es el único que
 * atraviesa las tres zonas, porque su función es administrar el sistema.
 *
 * Esta tabla es la única fuente de verdad: la usa el middleware para cortar la
 * navegación y la usan las rutas de API para cortar las peticiones. No se debe
 * duplicar la lógica en ningún otro sitio.
 */
export const ROLES = ["ESTUDIANTE", "DOCENTE", "ADMIN"] as const;

/** Zonas protegidas y roles admitidos en cada una. */
export const ZONAS: ReadonlyArray<{ prefijo: string; permite: readonly Rol[] }> = [
  { prefijo: "/estudiante", permite: ["ESTUDIANTE", "ADMIN"] },
  { prefijo: "/docente", permite: ["DOCENTE", "ADMIN"] },
  { prefijo: "/admin", permite: ["ADMIN"] },
];

/** Página de inicio de cada rol tras iniciar sesión. */
export const INICIO_POR_ROL: Record<Rol, string> = {
  ESTUDIANTE: "/estudiante",
  DOCENTE: "/docente",
  ADMIN: "/admin",
};

/** Devuelve la zona que cubre una ruta, o null si la ruta es pública. */
export function zonaDe(pathname: string) {
  return ZONAS.find(
    (z) => pathname === z.prefijo || pathname.startsWith(z.prefijo + "/"),
  );
}

/** ¿Puede este rol entrar en esta ruta? Las rutas públicas devuelven true. */
export function puedeAcceder(rol: Rol | undefined, pathname: string): boolean {
  const zona = zonaDe(pathname);
  if (!zona) return true;
  if (!rol) return false;
  return zona.permite.includes(rol);
}

export function esRolValido(valor: unknown): valor is Rol {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor);
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  ESTUDIANTE: "Estudiante",
  DOCENTE: "Docente",
  ADMIN: "Administrador",
};
