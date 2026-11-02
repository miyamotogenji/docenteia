"use client";

import { useRouter } from "next/navigation";
import type { EtapaEducativa } from "@prisma/client";
import { Fragment, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { pedir } from "@/lib/docente/cliente";
import { ETAPAS, cursoValido, etapaPorValor, etiquetaCurso } from "@/lib/curriculo/etapas";
import { cn } from "@/lib/utils";

export interface AulaAdminVista {
  id: string;
  nombre: string;
  etapa: EtapaEducativa | null;
  grado: number;
  seccion: string;
  codigoAcceso: string;
  activa: boolean;
  institucionId: string;
  institucion: string;
  /** `null` = todavía sin titular: el aula se crea sola, se asigna después. */
  docenteId: string | null;
  docente: string | null;
  matriculas: number;
  tareas: number;
}

interface Opcion {
  id: string;
  nombre: string;
}

interface UsuarioBusqueda {
  id: string;
  nombre: string;
  email: string;
}

interface Props {
  aulas: AulaAdminVista[];
  instituciones: Opcion[];
  docentes: Opcion[];
}

/**
 * "/admin/aulas — vista maestra" (checklist actualizado de HITO 4):
 * estructura física/académica y asignación de personas, DESACOPLADAS. El
 * administrador crea el aula con sólo nombre, grado, sección e institución
 * —nace sin titular—, y por separado asigna (o cambia) el docente desde la
 * propia tabla, y matricula alumnos directamente —el "Módulo de Matrícula/
 * Asignación" sin depender del código de invitación—.
 *
 * Mismo patrón que `GestorUsuarios`/`GestorAulas` (del docente): formulario
 * desplegable sin modal, tabla con las filas de siempre, mismo aviso de
 * éxito/error.
 */
export function GestorAulasAdmin({ aulas, instituciones, docentes }: Props) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // ── Crear aula (estructura base, SIN docente) ──────────────────────────
  // La etapa va PRIMERO (cierre HITO 4, a petición del cliente): sin ella,
  // "grado 3" es ambiguo —primaria, secundaria o superior—, y es lo que deja
  // completar el perfil académico del alumno solo, al matricularlo (ver
  // POST /api/admin/matriculas). El selector de grado, igual que en el alta
  // de un alumno, se acota a los cursos reales de la etapa elegida: no se
  // puede pedir un "8.º de secundaria", que no existe.
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState({ nombre: "", etapa: "", grado: "", seccion: "", institucionId: "" });
  const etapaDeNuevaAula = etapaPorValor(nueva.etapa);

  const crearAula = () => {
    if (!nueva.nombre.trim()) return setAviso({ tono: "mal", texto: "El aula necesita un nombre." });
    if (!nueva.etapa) return setAviso({ tono: "mal", texto: "Elige la etapa del aula." });
    const grado = Number(nueva.grado);
    if (!nueva.grado || !cursoValido(nueva.etapa as EtapaEducativa, grado)) {
      return setAviso({ tono: "mal", texto: "Elige un grado válido dentro de la etapa." });
    }
    if (!nueva.seccion.trim()) return setAviso({ tono: "mal", texto: "La sección no puede estar vacía." });
    if (!nueva.institucionId) return setAviso({ tono: "mal", texto: "Elige a qué institución pertenece." });

    setGuardando(true);
    iniciar(async () => {
      const r = await pedir("/api/admin/aulas", {
        metodo: "POST",
        cuerpo: {
          nombre: nueva.nombre.trim(),
          etapa: nueva.etapa,
          grado,
          seccion: nueva.seccion.trim(),
          institucionId: nueva.institucionId,
        },
      });
      setGuardando(false);
      if (r.ok) {
        setNueva({ nombre: "", etapa: "", grado: "", seccion: "", institucionId: "" });
        setCreando(false);
        setAviso({ tono: "ok", texto: `Aula "${nueva.nombre.trim()}" creada. Asígnale un docente desde la tabla.` });
        router.refresh();
      } else {
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  // ── Asignar o cambiar el docente titular ───────────────────────────────
  const [asignandoDocente, setAsignandoDocente] = useState<string | null>(null);

  const asignarDocente = (aulaId: string, docenteId: string) => {
    setAsignandoDocente(aulaId);
    iniciar(async () => {
      const r = await pedir("/api/admin/aulas/" + aulaId, {
        metodo: "PATCH",
        cuerpo: { docenteId: docenteId || null },
      });
      setAsignandoDocente(null);
      if (r.ok) {
        setAviso({ tono: "ok", texto: docenteId ? "Docente asignado." : "Aula desvinculada de su docente." });
        router.refresh();
      } else {
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  // ── Matricular alumno directo ───────────────────────────────────────────
  const [matriculando, setMatriculando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<UsuarioBusqueda[] | "cargando" | null>(null);

  const buscarAlumnos = (texto: string) => {
    setBusqueda(texto);
    if (texto.trim().length < 2) {
      setResultados(null);
      return;
    }
    setResultados("cargando");
    iniciar(async () => {
      const r = await pedir<{ usuarios: UsuarioBusqueda[] }>(
        `/api/admin/usuarios?rol=ESTUDIANTE&q=${encodeURIComponent(texto.trim())}`,
      );
      setResultados(r.ok ? r.datos.usuarios.slice(0, 8) : []);
    });
  };

  const matricular = (aulaId: string, estudianteId: string, nombreAlumno: string) => {
    setGuardando(true);
    iniciar(async () => {
      const r = await pedir("/api/admin/matriculas", { metodo: "POST", cuerpo: { aulaId, estudianteId } });
      setGuardando(false);
      if (r.ok) {
        setAviso({ tono: "ok", texto: `${nombreAlumno} matriculado.` });
        setMatriculando(null);
        setBusqueda("");
        setResultados(null);
        router.refresh();
      } else {
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  return (
    <div className="space-y-6">
      {aviso && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            aviso.tono === "ok"
              ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {aviso.texto}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">Aulas de la plataforma</h2>
          <p className="text-sm text-muted-foreground">
            Crea el aula con su institución; asigna el docente titular y matricula alumnos después,
            desde la tabla.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreando((v) => !v)}>
          {creando ? "Cancelar" : "Crear aula"}
        </Button>
      </div>

      {creando && (
        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="admin-aula-nombre">Nombre del salón</Label>
              <Input
                id="admin-aula-nombre"
                placeholder='p. ej. "3ro B - Secundaria"'
                value={nueva.nombre}
                onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-aula-etapa">Etapa</Label>
              <Select
                id="admin-aula-etapa"
                value={nueva.etapa}
                onChange={(e) => setNueva({ ...nueva, etapa: e.target.value, grado: "" })}
              >
                <option value="">Elige una</option>
                {ETAPAS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-aula-grado">{etapaDeNuevaAula?.unidad ?? "Grado"}</Label>
              <Select
                id="admin-aula-grado"
                value={nueva.grado}
                disabled={!etapaDeNuevaAula}
                onChange={(e) => setNueva({ ...nueva, grado: e.target.value })}
              >
                <option value="">Elige uno</option>
                {etapaDeNuevaAula &&
                  Array.from({ length: etapaDeNuevaAula.cursos }, (_, i) => i + 1).map((c) => (
                    <option key={c} value={c}>
                      {etiquetaCurso(nueva.etapa as EtapaEducativa, c)}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-aula-seccion">Sección</Label>
              <Input
                id="admin-aula-seccion"
                placeholder="B"
                value={nueva.seccion}
                onChange={(e) => setNueva({ ...nueva, seccion: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-aula-institucion">Institución</Label>
              <Select
                id="admin-aula-institucion"
                value={nueva.institucionId}
                onChange={(e) => setNueva({ ...nueva, institucionId: e.target.value })}
              >
                <option value="">Elige una</option>
                {instituciones.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-5">
              <Button onClick={crearAula} disabled={guardando}>
                Crear aula
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {aulas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay aulas en ningún colegio.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Aula</th>
                <th className="px-3 py-2">Institución</th>
                <th className="px-3 py-2">Docente</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Alumnos</th>
                <th className="px-3 py-2">Tareas</th>
                <th className="px-3 py-2">Matricular</th>
              </tr>
            </thead>
            <tbody>
              {aulas.map((a) => (
                <Fragment key={a.id}>
                  <tr className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {a.etapa ? etiquetaCurso(a.etapa, a.grado) : `${a.grado}.º`} {a.seccion}
                      <div className="font-normal text-muted-foreground">{a.nombre}</div>
                      {!a.activa && (
                        <Badge variant="contorno" className="mt-1 text-[0.65rem]">
                          Inactiva
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{a.institucion}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={a.docenteId ?? ""}
                        disabled={asignandoDocente === a.id}
                        onChange={(e) => asignarDocente(a.id, e.target.value)}
                        className={cn("h-8 py-0 text-xs", !a.docenteId && "text-muted-foreground")}
                      >
                        <option value="">Sin asignar</option>
                        {docentes.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nombre}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <code className="rounded border bg-muted/40 px-2 py-0.5 font-mono text-xs tracking-widest">
                        {a.codigoAcceso}
                      </code>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{a.matriculas}</td>
                    <td className="px-3 py-2 tabular-nums">{a.tareas}</td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setMatriculando((id) => (id === a.id ? null : a.id));
                          setBusqueda("");
                          setResultados(null);
                        }}
                      >
                        {matriculando === a.id ? "Cerrar" : "Matricular"}
                      </Button>
                    </td>
                  </tr>
                  {matriculando === a.id && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={7} className="px-3 py-3">
                        <div className="space-y-2">
                          <Label htmlFor={`buscar-alumno-${a.id}`}>
                            Buscar alumno por nombre o correo, para matricularlo directamente en {a.grado}.º{" "}
                            {a.seccion}
                          </Label>
                          <Input
                            id={`buscar-alumno-${a.id}`}
                            placeholder="nombre@correo.com"
                            value={busqueda}
                            onChange={(e) => buscarAlumnos(e.target.value)}
                            className="max-w-sm"
                          />
                          {resultados === "cargando" ? (
                            <p className="text-xs text-muted-foreground">Buscando…</p>
                          ) : resultados && resultados.length > 0 ? (
                            <ul className="space-y-1">
                              {resultados.map((u) => (
                                <li key={u.id} className="flex items-center justify-between gap-3 text-xs">
                                  <span>
                                    <span className="font-medium">{u.nombre}</span>{" "}
                                    <span className="text-muted-foreground">{u.email}</span>
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={guardando}
                                    onClick={() => matricular(a.id, u.id, u.nombre)}
                                  >
                                    Matricular
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          ) : resultados && resultados.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Ningún alumno coincide.</p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
