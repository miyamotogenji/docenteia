"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";

import { PSELight } from "@/public/pseLight.js";
import { TTS } from "@/public/tts.js";
import type { EstadoAvatar, EstadoControles, LSG, UIPSELight } from "@/public/pseLight";

import { Avatar2D } from "@/components/leccion/avatar-2d";
import { Pizarra, type LineaPizarra } from "@/components/leccion/pizarra";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  construirPeticion,
  estadoInicial,
  type EstadoConversacion,
  type Seguimiento,
} from "@/lib/leccion/seguimiento";
import { TEMAS_LECCION, type TemaLeccion } from "@/lib/leccion/temas";
import { cn } from "@/lib/utils";

/** Botones de apoyo del entorno de resolución (Módulo 8). */
const BOTONES_APOYO: Array<{
  etiqueta: string;
  consulta: string;
  seguimiento: Seguimiento;
  parte?: "concepto" | "resolucion";
}> = [
  {
    etiqueta: "No entendí este paso",
    consulta: "No entendí, explícalo mejor",
    seguimiento: "reexplicar",
    parte: "resolucion",
  },
  {
    etiqueta: "Dame otro ejemplo",
    consulta: "Dame otro ejemplo",
    seguimiento: "continuacion",
  },
  {
    etiqueta: "Explicar regla",
    consulta: "Explícame la regla que se aplica",
    seguimiento: "reexplicar",
    parte: "concepto",
  },
];

interface Veredicto {
  correcto: boolean | null;
  verificable: boolean;
  mensaje?: string;
  pista?: string;
}

export function Aula() {
  // ── Instancias del motor (sólo en el navegador) ────────────────────────────
  const pseRef = useRef<PSELight | null>(null);
  const ttsRef = useRef<TTS | null>(null);
  const resolverRespuesta = useRef<((valor: string | null) => void) | null>(null);
  const idLinea = useRef(0);
  const conversacion = useRef<EstadoConversacion>(estadoInicial());

  // ── Estado visible ─────────────────────────────────────────────────────────
  const [listo, setListo] = useState(false);
  const [tema, setTema] = useState<TemaLeccion | null>(null);
  const [estadoAvatar, setEstadoAvatar] = useState<EstadoAvatar>("neutral");
  const [hablando, setHablando] = useState(false);
  const [lineas, setLineas] = useState<LineaPizarra[]>([]);
  const [modulo, setModulo] = useState<string>("");
  const [resaltado, setResaltado] = useState<string | null>(null);
  const [subtitulo, setSubtitulo] = useState("");
  const [controles, setControles] = useState<EstadoControles>({
    playing: false,
    paused: false,
    hasLesson: false,
    index: 0,
    total: 0,
  });
  const [pregunta, setPregunta] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [intento, setIntento] = useState(1);
  const [veredicto, setVeredicto] = useState<Veredicto | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vozActiva, setVozActiva] = useState(true);
  const [estadoVoz, setEstadoVoz] = useState("");

  const anadirLinea = useCallback(
    (texto: string, clase: LineaPizarra["clase"]) => {
      const limpio = String(texto ?? "").trim();
      if (!limpio) return;
      setLineas((prev) => [...prev, { id: idLinea.current++, texto: limpio, clase }]);
    },
    [],
  );

  // ── Montaje del reproductor ────────────────────────────────────────────────
  useEffect(() => {
    const tts = new TTS();
    ttsRef.current = tts;
    setEstadoVoz(tts.describe());

    // El avatar y la voz son dependencias del motor; aquí se le entregan como
    // adaptadores que, en lugar de tocar el DOM, actualizan el estado de React.
    const avatar = {
      setState: (estado: EstadoAvatar) => setEstadoAvatar(estado),
      setSpeaking: (activo: boolean) => setHablando(activo),
    };

    const ui: UIPSELight = {
      setModule: (etiqueta) => setModulo(String(etiqueta ?? "")),
      writeBoard: (texto) => anadirLinea(texto, "formula"),
      writeBoardExplain: (texto) => anadirLinea(texto, "explicacion"),
      highlightBoard: (objetivo) => setResaltado(objetivo ?? null),
      clearBoard: () => {
        setLineas([]);
        setResaltado(null);
      },
      setCaption: (texto) => setSubtitulo(String(texto ?? "")),
      onStep: () => {},
      setControls: (estado) => setControles(estado),
      onProgress: (index, total) =>
        setControles((prev) => ({ ...prev, index, total })),
      showFeedback: (ok, msg) => setFeedback({ ok, msg }),
      onLessonEnd: () => {
        setPregunta(null);
        setEstadoAvatar("sonriendo");
      },
      // Suspende la lección hasta que el alumno responde. La promesa se resuelve
      // desde el formulario de respuesta, o con null si se aborta la lección.
      askAnswer: (textoPregunta, opciones) =>
        new Promise<string | null>((resolve) => {
          setPregunta(String(textoPregunta ?? ""));
          setBorrador("");
          setIntento(1);
          setVeredicto(null);
          resolverRespuesta.current = resolve;
          opciones?.signal?.addEventListener("abort", () => {
            resolverRespuesta.current = null;
            setPregunta(null);
            resolve(null);
          });
        }),
    };

    pseRef.current = new PSELight({ avatar, tts, ui });
    setListo(true);

    return () => {
      pseRef.current?.stop();
      tts.cancel();
    };
  }, [anadirLinea]);

  // ── Petición de lección al servidor ────────────────────────────────────────
  const pedirLeccion = useCallback(
    async (
      consulta: string,
      opciones: { seguimiento?: Seguimiento | null; parte?: "concepto" | "resolucion" } = {},
    ) => {
      setCargando(true);
      setError(null);
      setFeedback(null);
      setVeredicto(null);
      setPregunta(null);

      try {
        const cuerpo = construirPeticion(consulta, conversacion.current, opciones);
        const r = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(cuerpo),
        });
        const datos = await r.json();

        if (!r.ok) {
          setError(datos.error ?? "No se pudo generar la lección.");
          return;
        }

        const lsg = datos.lsg as LSG;
        const estado = conversacion.current;

        // El servidor no guarda sesión: el contexto se mantiene aquí y viaja en
        // cada petición. Los cursores de rotación tienen que dar la vuelta
        // completa o el alumno vería siempre el mismo ejemplo.
        if (datos.cursores) estado.cursores = datos.cursores;
        if (!opciones.seguimiento) estado.temaActivo = consulta;
        estado.historial = [...estado.historial, consulta].slice(-5);

        const pasos = Array.isArray(datos.pasos) ? datos.pasos : [];
        estado.previo = pasos
          .filter((p: { tipo: string }) => p.tipo === "hablar")
          .slice(0, 3)
          .map((p: { texto: string }) => p.texto)
          .join(" ")
          .slice(0, 600);

        // El ejercicio en pantalla es la última fórmula escrita: es lo que hay
        // que re-explicar si el alumno dice que no entendió.
        const pizarras = pasos
          .filter((p: { tipo: string }) => p.tipo === "pizarra")
          .map((p: { contenido: string }) => p.contenido);
        estado.ejercicio = pizarras[pizarras.length - 1] ?? "";

        pseRef.current?.play(lsg);
      } catch {
        setError("No se pudo contactar con el servidor. Revisa tu conexión.");
      } finally {
        setCargando(false);
      }
    },
    [],
  );

  const empezarTema = useCallback(
    (elegido: TemaLeccion) => {
      setTema(elegido);
      conversacion.current = estadoInicial();
      conversacion.current.claveTema = elegido.clave;
      void pedirLeccion(elegido.consulta);
    },
    [pedirLeccion],
  );

  // ── Envío de la respuesta del alumno ───────────────────────────────────────
  const responder = useCallback(async () => {
    const respuesta = borrador.trim();
    if (!respuesta) return;

    const estado = conversacion.current;

    // Evaluación inmediata contra la solución que RECALCULA el servidor. El
    // navegador no conoce la respuesta correcta.
    if (estado.ejercicio) {
      try {
        const r = await fetch("/api/practica/corregir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ejercicio: estado.ejercicio,
            respuesta,
            tema: estado.claveTema,
            intento,
            pizarra: lineas.map((l) => l.texto).join("\n").slice(0, 2000),
          }),
        });
        if (r.ok) setVeredicto(await r.json());
      } catch {
        // Un fallo de red al corregir no debe bloquear la lección: el motor
        // local sigue adelante con su propia ramificación pedagógica.
      }
    }

    setIntento((n) => n + 1);
    const resolver = resolverRespuesta.current;
    resolverRespuesta.current = null;
    setPregunta(null);
    setBorrador("");
    resolver?.(respuesta);
  }, [borrador, intento, lineas]);

  // ── Controles de reproducción ──────────────────────────────────────────────
  const alternarVoz = useCallback(() => {
    const tts = ttsRef.current;
    if (!tts) return;
    const activar = !vozActiva;
    setVozActiva(activar);
    tts.enabled = activar && Boolean(tts.voice);
    if (!activar) tts.cancel();
  }, [vozActiva]);

  const progreso =
    controles.total > 0 ? (controles.index / controles.total) * 100 : 0;

  // ── Elección de tema ───────────────────────────────────────────────────────
  if (!tema) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Lección interactiva</h1>
          <p className="text-muted-foreground">
            Elige un tema. El tutor te lo explicará paso a paso en la pizarra y
            después practicarás.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMAS_LECCION.map((t) => (
            <Card
              key={t.clave}
              className="cursor-pointer transition-colors hover:border-primary hover:bg-accent/40"
              onClick={() => empezarTema(t)}
            >
              <CardHeader>
                <CardTitle className="text-lg">{t.titulo}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t.descripcion}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Aula ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tema.titulo}</h1>
          {modulo && (
            <p className="text-sm text-muted-foreground">
              Fase: <span className="font-medium">{etiquetaModulo(modulo)}</span>
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            pseRef.current?.stop();
            setTema(null);
            setLineas([]);
            setSubtitulo("");
            setFeedback(null);
            setVeredicto(null);
          }}
        >
          Cambiar de tema
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Avatar y controles */}
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6">
              <Avatar2D estado={estadoAvatar} hablando={hablando} />
              <div className="flex gap-2">
                {controles.playing && !controles.paused ? (
                  <Button size="sm" variant="outline" onClick={() => pseRef.current?.pause()}>
                    <Pause className="h-4 w-4" />
                    Pausa
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!controles.hasLesson || cargando}
                    onClick={() => void pseRef.current?.play()}
                  >
                    <Play className="h-4 w-4" />
                    {controles.paused ? "Reanudar" : "Reproducir"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={vozActiva ? "Silenciar la voz" : "Activar la voz"}
                  onClick={alternarVoz}
                >
                  {vozActiva ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                disabled={cargando}
                onClick={() => empezarTema(tema)}
              >
                <RotateCcw className="h-4 w-4" />
                Reiniciar lección
              </Button>
              <p className="text-center text-[11px] leading-tight text-muted-foreground">
                {estadoVoz}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pizarra y práctica */}
        <div className="space-y-4">
          <Progress value={progreso} />

          <Pizarra lineas={lineas} resaltado={resaltado} />

          {/* Subtítulo: lo que el tutor está diciendo en este momento. */}
          {subtitulo && (
            <p className="rounded-md bg-muted/60 px-4 py-3 text-sm leading-relaxed">
              {subtitulo}
            </p>
          )}

          {cargando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando la lección…
            </p>
          )}

          {/* Entorno de resolución interactiva */}
          {pregunta && (
            <Card className="border-primary/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">{pregunta}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void responder();
                  }}
                >
                  <Input
                    autoFocus
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    placeholder="Tu respuesta"
                    aria-label="Tu respuesta"
                  />
                  <Button type="submit" disabled={!borrador.trim()}>
                    Responder
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Veredicto del servidor */}
          {veredicto && (
            <Alert
              variant={
                veredicto.correcto === true
                  ? "success"
                  : veredicto.correcto === false
                    ? "destructive"
                    : "default"
              }
            >
              {veredicto.correcto === true ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Lightbulb className="h-4 w-4" />
              )}
              <AlertDescription>
                {veredicto.correcto === true
                  ? "Correcto. Lo has resuelto bien."
                  : (veredicto.pista ?? veredicto.mensaje)}
              </AlertDescription>
            </Alert>
          )}

          {/* Mensaje pedagógico del tutor */}
          {feedback && (
            <p
              className={cn(
                "text-sm font-medium",
                feedback.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600",
              )}
            >
              {feedback.msg}
            </p>
          )}

          {/* Botones contextuales de apoyo */}
          <div className="flex flex-wrap gap-2">
            {BOTONES_APOYO.map((b) => (
              <Button
                key={b.etiqueta}
                variant="secondary"
                size="sm"
                disabled={cargando || !listo}
                onClick={() =>
                  void pedirLeccion(b.consulta, {
                    seguimiento: b.seguimiento,
                    parte: b.parte,
                  })
                }
              >
                {b.etiqueta}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              disabled={cargando || !listo}
              onClick={() =>
                void pedirLeccion("Proponme un problema más difícil", {
                  seguimiento: "mas_dificil",
                })
              }
            >
              Más difícil
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={cargando || !listo}
              onClick={() =>
                void pedirLeccion("Ahora uno más fácil", { seguimiento: "mas_facil" })
              }
            >
              Más fácil
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Nombre legible de cada fase pedagógica del LSG. */
function etiquetaModulo(id: string): string {
  const n = id.toLowerCase();
  if (n.includes("concepto")) return "Concepto";
  if (n.includes("regla") || n.includes("propiedad")) return "Reglas y propiedades";
  if (n.includes("ejemplo")) return "Ejemplo resuelto";
  if (n.includes("practica") || n.includes("práctica")) return "Práctica";
  return id;
}
