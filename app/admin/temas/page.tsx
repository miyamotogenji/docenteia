import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionAdmin } from "@/components/admin/navegacion";
import {
  GestorCurriculo,
  type MateriaVista,
  type TemaVista,
} from "@/components/docente/gestor-curriculo";
import { prisma } from "@/lib/prisma";
import { SELECCION_TEMA } from "@/lib/docente/temas";
import type { Estado } from "@/lib/docente/curriculo";

export const metadata: Metadata = { title: "Temas · Administración" };
export const dynamic = "force-dynamic";

/**
 * "3.A Gestión de Temas y Asignaturas" (HITO 4 — cierre PMV2): "edición,
 * archivado o depuración de temas que no posean dependencias críticas
 * activas".
 *
 * Reutiliza `GestorCurriculo` —el mismo componente de `/docente/curriculo`—
 * tal cual, por el mismo motivo que `/admin/ejercicios`: el currículo es uno
 * solo, compartido por toda la plataforma, y `SUPERADMIN` ya podía
 * escribirlo desde antes de este hito. El borrado controlado —"un tema con
 * historial no se borra, sólo se archiva"— ya es el comportamiento de
 * `DELETE /api/docente/temas/[id]` desde el HITO 1, con su propia batería
 * (`qa/hito1.mjs`).
 */
export default async function PaginaTemasAdmin() {
  const sesion = await auth();
  if (!sesion?.user || sesion.user.rol !== "SUPERADMIN") redirect("/login");

  const [materias, temas] = await Promise.all([
    prisma.materia.findMany({
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      include: { _count: { select: { temas: true } } },
    }),
    prisma.nodoConocimiento.findMany({
      orderBy: [{ orden: "asc" }, { titulo: "asc" }],
      select: SELECCION_TEMA,
      take: 500,
    }),
  ]);

  const materiasVista: MateriaVista[] = materias.map((m) => ({
    id: m.id,
    codigo: m.codigo,
    nombre: m.nombre,
    descripcion: m.descripcion,
    color: m.color,
    orden: m.orden,
    activa: m.activa,
    temas: m._count.temas,
  }));

  const temasVista: TemaVista[] = temas.map((t) => ({
    id: t.id,
    clave: t.clave,
    titulo: t.titulo,
    descripcion: t.descripcion,
    motor: t.motor,
    nivel: t.nivel,
    etapa: t.etapa,
    cursoMin: t.cursoMin,
    orden: t.orden,
    estado: t.estado as Estado,
    etiquetas: t.etiquetas,
    objetivos: t.objetivos,
    padreId: t.padreId,
    materiaId: t.materiaId,
    materia: t.materia,
    autor: t.autor,
    reglas: t._count.reglas,
    ejercicios: t._count.ejercicios,
    hijos: t._count.hijos,
  }));

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionAdmin />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Temas</h1>
          <p className="text-muted-foreground">
            Asignaturas, temas y subtemas de TODA la plataforma. Archivar uno con reglas o
            ejercicios activos los retira de las lecciones de cualquier alumno que lo tuviera
            disponible.
          </p>
        </div>

        <GestorCurriculo materias={materiasVista} temas={temasVista} puedeEditar />
      </main>
    </div>
  );
}
