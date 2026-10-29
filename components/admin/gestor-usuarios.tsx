"use client";

import { useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { pedir } from "@/lib/docente/cliente";
import { ETAPAS } from "@/lib/curriculo/etapas";
import { ROLES, ETIQUETA_ROL } from "@/lib/rbac";
import { cn } from "@/lib/utils";

interface UsuarioVista {
  id: string;
  nombre: string;
  email: string;
  rol: (typeof ROLES)[number];
  activo: boolean;
  creadoEn: string;
  institucionId: string | null;
  institucion: string | null;
}

interface Props {
  /** El id de quien está viendo el panel: sus propios controles se desactivan. */
  miPropioId: string;
}

// Mismo criterio que `rolUsaInstitucion` en lib/admin/usuarios.ts: un
// SUPERADMIN también puede vincularse a un colegio, para crear aulas o
// entrar a un panel institucional con su propia cuenta.
const USA_INSTITUCION = new Set(["DOCENTE", "DIRECTOR", "SUPERADMIN"]);

/**
 * "3.B Control de Accesos y Gestión de Usuarios" (HITO 4 — cierre PMV2):
 * listado filtrable por rol, activar/suspender, reasignar rol, vincular a
 * una institución.
 */
export function GestorUsuarios({ miPropioId }: Props) {
  const [usuarios, setUsuarios] = useState<UsuarioVista[] | "cargando">("cargando");
  const [instituciones, setInstituciones] = useState<{ id: string; nombre: string }[]>([]);
  const [filtroRol, setFiltroRol] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const cargar = () => {
    setUsuarios("cargando");
    iniciar(async () => {
      const parametros = new URLSearchParams();
      if (filtroRol) parametros.set("rol", filtroRol);
      if (busqueda.trim()) parametros.set("q", busqueda.trim());
      const r = await pedir<{ usuarios: UsuarioVista[]; instituciones: { id: string; nombre: string }[] }>(
        `/api/admin/usuarios?${parametros.toString()}`,
      );
      if (r.ok) {
        setUsuarios(r.datos.usuarios);
        setInstituciones(r.datos.instituciones);
      } else {
        setUsuarios([]);
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  // Se recarga cuando cambian los filtros —con un pequeño respiro para la
  // búsqueda de texto, que si no dispara una petición por cada tecla—.
  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroRol, busqueda]);

  const actualizar = async (id: string, cambios: Record<string, unknown>) => {
    setGuardando(id);
    const r = await pedir<{ usuario: UsuarioVista }>(`/api/admin/usuarios/${id}`, {
      metodo: "PATCH",
      cuerpo: cambios,
    });
    setGuardando(null);
    if (!r.ok) {
      setAviso({ tono: "mal", texto: r.error });
      return;
    }
    setUsuarios((us) => (us === "cargando" ? us : us.map((u) => (u.id === id ? r.datos.usuario : u))));
    setAviso(null);
  };

  // ── Formulario de Docentes (checklist actualizado): entidad maestra, ──────
  // independiente de a qué institución o a qué aula vaya a parar —eso se
  // decide después, aquí mismo (institución) o en /admin/aulas (aula)—.
  const [creandoDocente, setCreandoDocente] = useState(false);
  const [nuevoDocente, setNuevoDocente] = useState({ nombre: "", email: "", password: "" });
  const [guardandoAlta, setGuardandoAlta] = useState(false);

  const crearDocente = () => {
    if (!nuevoDocente.nombre.trim()) return setAviso({ tono: "mal", texto: "El docente necesita un nombre." });
    if (!nuevoDocente.email.trim()) return setAviso({ tono: "mal", texto: "El docente necesita un correo." });
    if (nuevoDocente.password.length < 8) {
      return setAviso({ tono: "mal", texto: "La contraseña debe tener al menos 8 caracteres." });
    }
    setGuardandoAlta(true);
    iniciar(async () => {
      const r = await pedir("/api/admin/usuarios", {
        metodo: "POST",
        cuerpo: { ...nuevoDocente, nombre: nuevoDocente.nombre.trim(), email: nuevoDocente.email.trim(), rol: "DOCENTE" },
      });
      setGuardandoAlta(false);
      if (r.ok) {
        setNuevoDocente({ nombre: "", email: "", password: "" });
        setCreandoDocente(false);
        setAviso({ tono: "ok", texto: `Docente "${nuevoDocente.nombre.trim()}" creado. Vincúlalo a una institución en la tabla de abajo.` });
        cargar();
      } else {
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  // ── Formulario de Alumnos: entidad maestra, con su etapa/curso ya ────────
  // listos de una vez si el administrador los sabe —si no, el propio
  // alumno los completa en su primer inicio de sesión—.
  const [creandoAlumno, setCreandoAlumno] = useState(false);
  const [nuevoAlumno, setNuevoAlumno] = useState({ nombre: "", email: "", password: "", etapa: "", curso: "" });

  const etapaDelAlumno = ETAPAS.find((e) => e.valor === nuevoAlumno.etapa);

  const crearAlumno = () => {
    if (!nuevoAlumno.nombre.trim()) return setAviso({ tono: "mal", texto: "El alumno necesita un nombre." });
    if (!nuevoAlumno.email.trim()) return setAviso({ tono: "mal", texto: "El alumno necesita un correo." });
    if (nuevoAlumno.password.length < 8) {
      return setAviso({ tono: "mal", texto: "La contraseña debe tener al menos 8 caracteres." });
    }
    setGuardandoAlta(true);
    iniciar(async () => {
      const r = await pedir("/api/admin/usuarios", {
        metodo: "POST",
        cuerpo: {
          nombre: nuevoAlumno.nombre.trim(),
          email: nuevoAlumno.email.trim(),
          password: nuevoAlumno.password,
          rol: "ESTUDIANTE",
          ...(nuevoAlumno.etapa ? { etapa: nuevoAlumno.etapa } : {}),
          ...(nuevoAlumno.etapa && nuevoAlumno.curso ? { curso: Number(nuevoAlumno.curso) } : {}),
        },
      });
      setGuardandoAlta(false);
      if (r.ok) {
        setNuevoAlumno({ nombre: "", email: "", password: "", etapa: "", curso: "" });
        setCreandoAlumno(false);
        setAviso({ tono: "ok", texto: `Alumno "${nuevoAlumno.nombre.trim()}" creado.` });
        cargar();
      } else {
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setCreandoDocente((v) => !v)}>
          {creandoDocente ? "Cancelar" : "Crear docente"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCreandoAlumno((v) => !v)}>
          {creandoAlumno ? "Cancelar" : "Crear alumno"}
        </Button>
      </div>

      {creandoDocente && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium">Formulario de Docentes</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="nuevo-docente-nombre">Nombre</Label>
                <Input
                  id="nuevo-docente-nombre"
                  value={nuevoDocente.nombre}
                  onChange={(e) => setNuevoDocente({ ...nuevoDocente, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nuevo-docente-email">Correo</Label>
                <Input
                  id="nuevo-docente-email"
                  type="email"
                  placeholder="docente@colegio.edu"
                  value={nuevoDocente.email}
                  onChange={(e) => setNuevoDocente({ ...nuevoDocente, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nuevo-docente-password">Contraseña</Label>
                <Input
                  id="nuevo-docente-password"
                  type="password"
                  placeholder="Al menos 8 caracteres"
                  value={nuevoDocente.password}
                  onChange={(e) => setNuevoDocente({ ...nuevoDocente, password: e.target.value })}
                />
              </div>
            </div>
            <Button onClick={crearDocente} disabled={guardandoAlta}>
              Crear docente
            </Button>
          </CardContent>
        </Card>
      )}

      {creandoAlumno && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium">Formulario de Alumnos</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="nuevo-alumno-nombre">Nombre</Label>
                <Input
                  id="nuevo-alumno-nombre"
                  value={nuevoAlumno.nombre}
                  onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nuevo-alumno-email">Correo</Label>
                <Input
                  id="nuevo-alumno-email"
                  type="email"
                  placeholder="alumno@correo.com"
                  value={nuevoAlumno.email}
                  onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nuevo-alumno-password">Contraseña</Label>
                <Input
                  id="nuevo-alumno-password"
                  type="password"
                  placeholder="Al menos 8 caracteres"
                  value={nuevoAlumno.password}
                  onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, password: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nuevo-alumno-etapa">Etapa (opcional)</Label>
                <Select
                  id="nuevo-alumno-etapa"
                  value={nuevoAlumno.etapa}
                  onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, etapa: e.target.value, curso: "" })}
                >
                  <option value="">Sin definir —lo elige el alumno</option>
                  {ETAPAS.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              {etapaDelAlumno && (
                <div className="space-y-1.5">
                  <Label htmlFor="nuevo-alumno-curso">{etapaDelAlumno.unidad}</Label>
                  <Select
                    id="nuevo-alumno-curso"
                    value={nuevoAlumno.curso}
                    onChange={(e) => setNuevoAlumno({ ...nuevoAlumno, curso: e.target.value })}
                  >
                    <option value="">Elige uno</option>
                    {Array.from({ length: etapaDelAlumno.cursos }, (_, i) => i + 1).map((c) => (
                      <option key={c} value={c}>
                        {c}.º {etapaDelAlumno.unidad}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
            <Button onClick={crearAlumno} disabled={guardandoAlta}>
              Crear alumno
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-rol">Rol</Label>
          <Select id="filtro-rol" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-busqueda">Buscar</Label>
          <Input
            id="filtro-busqueda"
            placeholder="Nombre o correo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      {usuarios === "cargando" ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : usuarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay usuarios que coincidan con el filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Correo</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Institución</th>
                <th className="px-3 py-2">Acceso</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esUnoMismo = u.id === miPropioId;
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {u.nombre}
                      {esUnoMismo && (
                        <Badge variant="contorno" className="ml-2 text-[0.65rem]">
                          tú
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={u.rol}
                        disabled={esUnoMismo || guardando === u.id}
                        onChange={(e) => actualizar(u.id, { rol: e.target.value })}
                        className="h-8 py-0 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ETIQUETA_ROL[r]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      {USA_INSTITUCION.has(u.rol) ? (
                        <Select
                          value={u.institucionId ?? ""}
                          disabled={guardando === u.id}
                          onChange={(e) => actualizar(u.id, { institucionId: e.target.value || null })}
                          className="h-8 py-0 text-xs"
                        >
                          <option value="">Sin institución</option>
                          {instituciones.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nombre}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant={u.activo ? "outline" : "destructive"}
                        disabled={esUnoMismo || guardando === u.id}
                        onClick={() => actualizar(u.id, { activo: !u.activo })}
                      >
                        {u.activo ? "Activo" : "Suspendido"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
