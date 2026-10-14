"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Barra de secciones del panel de administración (HITO 4 — cierre PMV2).
 *
 * `/admin` era una sola pantalla de estado hasta este hito; con "Usuarios" —y
 * lo que llegue después, ejercicios y temas— hace falta un sitio desde el que
 * saltar entre ellas, mismo patrón que `NavegacionDocente`.
 */
const SECCIONES = [
  { href: "/admin", titulo: "Estado", exacta: true },
  { href: "/admin/usuarios", titulo: "Usuarios" },
];

export function NavegacionAdmin() {
  const ruta = usePathname();

  return (
    <nav className="border-b bg-muted/30">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6">
        {SECCIONES.map((s) => {
          const activa = s.exacta ? ruta === s.href : ruta.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={activa ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                activa
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.titulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
