"use client";

import katex from "katex";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";

import { TextoMatematico } from "@/components/math";
import { identificarRegla, reglaActiva } from "@/lib/leccion/reglas";
import { notacionFormal, pareceMatematica, planoALatex } from "@/lib/matematicas";
import { cn } from "@/lib/utils";

export { tituloDeFase } from "@/lib/leccion/fases";

/** Una línea escrita en la pizarra. */
export interface LineaPizarra {
  id: number;
  texto: string;
  /** "formula" viene de una directiva `pizarra`; "explicacion", de una `hablar`. */
  clase: "formula" | "explicacion";
  /**
   * La línea pertenece a una ACLARACIÓN pedida por el alumno, no al hilo de la
   * lección. Se agrupa aparte y se sustituye en la siguiente aclaración, para
   * que pedir ayuda tres veces no deje tres muros de texto en la pizarra.
   */
  aclaracion?: boolean;
}

/** Una fase de la lección, con su propia vista de pizarra. */
export interface Escena {
  id: string;
  titulo: string;
  lineas: LineaPizarra[];
}

/** Una regla del catálogo formal, tal como la muestra la pizarra. */
export interface ReglaPizarra {
  clave: string;
  nombre: string;
  enunciado: string;
  descripcion: string;
  ejemplo: string | null;
  practicable: boolean;
}

/**
 * Pizarra digital (SmartBoard).
 *
 * Cada fase de la lección es una ESCENA con su propia vista: al pasar de
 * "Concepto" a "Reglas" la pizarra se limpia y entra el contenido nuevo, en
 * lugar de seguir apilando párrafos hacia abajo. Dentro de una escena, las
 * líneas se revelan al ritmo de la explicación.
 *
 * Sobre el renderizado: el motor escribe en notación plana ("12x³ - 4x"), que
 * es la que entienden sus analizadores y su suite de pruebas. La traducción a
 * LaTeX ocurre aquí, de modo que la pizarra se compone sin tocar una línea de
 * la lógica ya validada.
 */
export function Pizarra({
  escenas,
  resaltado,
  reglas = [],
  className,
}: {
  escenas: Escena[];
  /** Texto de la línea que el puntero está señalando, si hay alguno. */
  resaltado: string | null;
  /** Catálogo formal del tema, que se despliega en la fase de Reglas. */
  reglas?: ReglaPizarra[];
  className?: string;
}) {
  const actual = escenas[escenas.length - 1] ?? null;
  const finRef = useRef<HTMLDivElement>(null);

  // La regla que el tutor está explicando ahora mismo, deducida de las líneas
  // ya reveladas. Cambia al ritmo del diálogo, no de golpe al entrar en la fase.
  const reglaEnCurso = useMemo(() => {
    if (!actual || !esFaseDeReglas(actual.id)) return null;
    return reglaActiva(
      actual.lineas.map((l) => l.texto),
      reglas,
    );
  }, [actual, reglas]);

  /**
   * SÓLO EL PASO ACTIVO.
   *
   * La pizarra mostraba todas las líneas de la fase y el contenido se apilaba
   * hasta convertirse en un scroll continuo. Ahora se compone únicamente el
   * paso en curso —la última expresión escrita—, como un docente que borra y
   * vuelve a escribir. El hilo de la explicación va en el subtítulo, y las
   * expresiones anteriores siguen en el estado por si hiciera falta
   * reconstruirlas.
   */
  const pasoActivo = useMemo(() => {
    const lineas = actual?.lineas ?? [];
    return lineas.length > 0 ? lineas[lineas.length - 1] : null;
  }, [actual]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [actual?.lineas.length, actual?.id]);

  return (
    <div className={cn("space-y-3", className)}>
      <Fases escenas={escenas} />

      {/* ALTURA FIJA, no mínima. Con una altura que crecía según el contenido,
          la pizarra cambiaba de tamaño en cada paso y los botones de abajo
          saltaban arriba y abajo mientras el alumno leía. El desbordamiento se
          resuelve dentro, con scroll propio. */}
      <div
        className="relative h-[24rem] overflow-hidden rounded-lg border bg-card shadow-inner sm:h-[30rem]"
        aria-live="polite"
        aria-label="Pizarra"
      >
        {!actual ? (
          <p className="p-5 text-sm text-muted-foreground">
            La pizarra está en blanco. Elige un tema y pulsa <em>Reproducir</em>.
          </p>
        ) : (
          <AnimatePresence mode="wait">
            {/* La clave es la escena: al cambiar de fase, la vista entera se
                sustituye con una transición limpia. */}
            <motion.div
              key={actual.id}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="flex h-full flex-col"
            >
              <div className="shrink-0 border-b bg-muted/40 px-5 py-2.5">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
                  {actual.titulo}
                </h2>
              </div>

              {/* El scroll vive aquí dentro: la caja de fuera nunca cambia de
                  tamaño, así que nada de lo que hay debajo se mueve. */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                {/* En la fase de Reglas se compone ÚNICAMENTE la tarjeta de la
                    regla que el tutor está explicando en este momento. Mostrar
                    el catálogo entero desincronizaba la pizarra del audio. */}
                {esFaseDeReglas(actual.id) && reglaEnCurso && (
                  <TarjetaRegla key={reglaEnCurso.clave} regla={reglaEnCurso} />
                )}

                {/* Únicamente el paso en curso: cada expresión sustituye a la
                    anterior en lugar de acumularse. */}
                <AnimatePresence mode="wait">
                  {pasoActivo && (
                    <motion.div
                      key={pasoActivo.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                    >
                      <LineaRenderizada
                        linea={pasoActivo}
                        resaltada={resaltado != null && pasoActivo.texto.includes(resaltado)}
                        reglas={esFaseDeEjemplo(actual.id) ? reglas : []}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={finRef} />
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/** Indicador de en qué fase de la lección va el alumno. */
function Fases({ escenas }: { escenas: Escena[] }) {
  if (escenas.length === 0) return null;
  const indiceActual = escenas.length - 1;

  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Fases de la lección">
      {escenas.map((escena, i) => {
        const completada = i < indiceActual;
        const activa = i === indiceActual;
        return (
          <li key={escena.id}>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activa && "border-primary bg-primary text-primary-foreground",
                completada && "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
                !activa && !completada && "text-muted-foreground",
              )}
              aria-current={activa ? "step" : undefined}
            >
              {completada && <Check className="h-3 w-3" />}
              {escena.titulo}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const esFaseDeReglas = (id: string) => /regla|propiedad/i.test(id);
const esFaseDeEjemplo = (id: string) => /ejemplo/i.test(id);

/**
 * Tarjeta de UNA regla, compuesta en KaTeX.
 *
 * Se marca si admite práctica calificada. El motor determinista cubre unas
 * reglas y otras no —la del producto o la de la cadena, por ejemplo, quedan
 * fuera—, y conviene enseñarlas igualmente: lo que no se puede es ofrecer una
 * práctica que después no se podría corregir con garantía.
 */
function TarjetaRegla({ regla }: { regla: ReglaPizarra }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="rounded-md border-2 border-primary/40 bg-primary/5 p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{regla.nombre}</h3>
        {!regla.practicable && (
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            sólo referencia
          </span>
        )}
      </div>

      <div className="overflow-x-auto py-1">
        <Formula latex={regla.enunciado} display />
      </div>

      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {regla.descripcion}
      </p>

      {regla.ejemplo && (
        <div className="mt-2 overflow-x-auto border-t pt-2">
          <Formula latex={regla.ejemplo} />
        </div>
      )}
    </motion.div>
  );
}

// NO se renderiza el catálogo completo en ningún punto de este fichero.
//
// Hubo aquí un componente que recorría todas las reglas del tema y las pintaba
// juntas. Aunque estaba plegado y fuera de la pizarra, seguía siendo un bloque
// con todas las tarjetas a la vez —cociente, cadena, producto— compitiendo con
// lo que el tutor estaba explicando. La regla es simple y no admite matices: la
// pizarra muestra ÚNICAMENTE la tarjeta de la regla activa, elegida por
// `reglaActiva()`. Si en el futuro hace falta una vista de consulta del
// temario, no es este componente ni esta pantalla.

/** Compone una expresión que YA viene en LaTeX (el catálogo se escribe así). */
function Formula({ latex, display = false }: { latex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        errorColor: "hsl(var(--destructive))",
        strict: false,
      });
    } catch {
      return null;
    }
  }, [latex, display]);

  if (!html) return <span className="font-mono text-sm">{latex}</span>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function LineaRenderizada({
  linea,
  resaltada,
  reglas = [],
}: {
  linea: LineaPizarra;
  resaltada: boolean;
  /** Si se pasan, se etiqueta qué regla aplica este paso. */
  reglas?: ReglaPizarra[];
}) {
  const regla = useMemo(
    () => (reglas.length ? identificarRegla(linea.texto, reglas) : null),
    [linea.texto, reglas],
  );
  // Una fórmula limpia se compone entera y centrada. Una línea que resulta ser
  // una frase —el motor también escribe rótulos y avisos en la pizarra— se
  // muestra como prosa, pero con SUS fórmulas compuestas igualmente.
  const formulaEntera = useMemo(() => {
    if (linea.clase === "explicacion") return null;

    // El motor rotula algunas fórmulas en castellano ("derivada de x² = 2x").
    // Se reescriben en notación formal; si no encajan en ningún patrón, sólo se
    // componen enteras cuando NO llevan palabras, porque KaTeX tipografiaría
    // cada letra como una variable y el texto saldría pegado y en cursiva.
    const latex = notacionFormal(linea.texto)
      ?? (pareceMatematica(linea.texto) ? planoALatex(linea.texto) : null);
    if (!latex) return null;

    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        errorColor: "hsl(var(--destructive))",
        strict: false,
      });
    } catch {
      return null;
    }
  }, [linea.texto, linea.clase]);

  // Etiqueta de la regla aplicada: hace explícito, paso a paso, en qué se
  // apoya cada movimiento del ejemplo.
  const etiqueta = regla ? (
    <span className="mb-1 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
      {regla.nombre}
    </span>
  ) : null;

  if (formulaEntera) {
    return (
      <div>
        {etiqueta}
        <div
          className={cn(
            "overflow-x-auto rounded-md px-3 py-2 transition-colors",
            resaltada
              ? "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50"
              : "bg-muted/40",
          )}
          dangerouslySetInnerHTML={{ __html: formulaEntera }}
        />
      </div>
    );
  }

  return (
    <div>
      {etiqueta}
      <p
        className={cn(
          "rounded-md px-3 py-1.5 leading-relaxed transition-colors",
          linea.clase === "explicacion"
            ? "text-sm text-muted-foreground"
            : "text-base font-medium",
          resaltada && "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50",
        )}
      >
        <TextoMatematico texto={linea.texto} />
      </p>
    </div>
  );
}
