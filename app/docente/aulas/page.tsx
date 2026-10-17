import { headers } from "next/headers";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { GestorAulas, type AulaVista } from "@/components/docente/gestor-aulas";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Aulas · Panel docente" };

// Las matrículas cambian con cada alumno que se une, así que no se prerenderiza.
export const dynamic = "force-dynamic";

/**
 * /docente/aulas — Arquitectura multi-tenant (HITO 3).
 *
 * Cada aula es un grado y una sección con su código de matrícula propio.
 * VISTA LIMPIA (checklist actualizado de HITO 4): crearlas ya no es cosa del
 * docente —eso pasó a `/admin/aulas`, centralizado—; aquí sólo reparte el
 * código de las que el colegio le asignó y entra a programarles tareas.
 * `GET /api/docente/aulas` sigue siendo "mis aulas" —las que tiene de
 * titular—, sólo que ya no se crean desde este lado.
 */
export default async function PaginaAulas() {
  const sesion = await auth();

  const aulas = sesion?.user
    ? await prisma.aula.findMany({
        where: { docenteId: sesion.user.id },
        orderBy: [{ grado: "asc" }, { seccion: "asc" }],
        include: { _count: { select: { matriculas: true, tareas: true } } },
      })
    : [];

  const aulasVista: AulaVista[] = aulas.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    grado: a.grado,
    seccion: a.seccion,
    codigoAcceso: a.codigoAcceso,
    activa: a.activa,
    matriculas: a._count.matriculas,
    tareas: a._count.tareas,
  }));

  // El enlace de matrícula necesita el origen absoluto: `/estudiante/unirse`
  // se comparte por WhatsApp o correo, fuera del navegador del docente, así
  // que una ruta relativa no sirve.
  const cabeceras = await headers();
  const protocolo = cabeceras.get("x-forwarded-proto") ?? "http";
  const host = cabeceras.get("host") ?? "localhost:3000";
  const baseUrl = `${protocolo}://${host}`;

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Aulas</h1>
          <p className="text-muted-foreground">
            Las aulas que el colegio te asignó. Comparte el código con el que se matriculan tus
            alumnos; crear aulas nuevas es cosa del administrador de la plataforma.
          </p>
        </div>

        <GestorAulas aulas={aulasVista} baseUrl={baseUrl} />
      </main>
    </div>
  );
}
