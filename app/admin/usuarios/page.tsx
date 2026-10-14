import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionAdmin } from "@/components/admin/navegacion";
import { GestorUsuarios } from "@/components/admin/gestor-usuarios";

export const metadata: Metadata = { title: "Usuarios · Administración" };
export const dynamic = "force-dynamic";

/**
 * "3.B Control de Accesos y Gestión de Usuarios" (HITO 4 — cierre PMV2):
 * listado completo filtrable por rol, con activar/suspender, reasignar rol y
 * vincular a una institución.
 *
 * `middleware.ts` ya corta `/admin` a quien no sea SUPERADMIN —ver
 * `lib/rbac.ts`—; se vuelve a comprobar aquí (igual que el resto de páginas
 * de rol) porque la regla de negocio no puede vivir sólo en el middleware.
 */
export default async function PaginaUsuarios() {
  const sesion = await auth();
  if (!sesion?.user || sesion.user.rol !== "SUPERADMIN") redirect("/login");

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionAdmin />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground">
            Activa o suspende cuentas, reasigna roles y vincula docentes y directores a su
            institución.
          </p>
        </div>

        <GestorUsuarios miPropioId={sesion.user.id} />
      </main>
    </div>
  );
}
