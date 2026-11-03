import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionAdmin } from "@/components/admin/navegacion";
import { RegistroAuditoria } from "@/components/admin/registro-auditoria";

export const metadata: Metadata = { title: "Auditoría · Administración" };
export const dynamic = "force-dynamic";

/**
 * "Auditoría y control de trazabilidad" (observación del cliente, cierre
 * HITO 4 — ver el comentario de `LogAuditoria` en `prisma/schema.prisma`).
 *
 * `middleware.ts` ya corta `/admin` a quien no sea SUPERADMIN; se vuelve a
 * comprobar aquí, igual que el resto de páginas de rol.
 */
export default async function PaginaAuditoria() {
  const sesion = await auth();
  if (!sesion?.user || sesion.user.rol !== "SUPERADMIN") redirect("/login");

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionAdmin />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Auditoría</h1>
          <p className="text-muted-foreground">
            Quién hizo qué y cuándo: suspensiones, cambios de rol, vínculos a una institución y
            matrículas creadas desde el panel.
          </p>
        </div>

        <RegistroAuditoria />
      </main>
    </div>
  );
}
