"use client";

import katex from "katex";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";

import { TextoMatematico } from "@/components/math";
import { pareceMatematica, planoALatex } from "@/lib/matematicas";
import { cn } from "@/lib/utils";

export { tituloDeFase } from "@/lib/leccion/fases";

/** Una línea escrita en la pizarra. */
export interface LineaPizarra {
  id: number;
  texto: string;
  /** "formula" viene de una directiva `pizarra`; "explicacion", de una `hablar`. */
  clase: "formula" | "explicacion";
}

/** Una fase de la lección, con su propia vista de pizarra. */
export interface Escena {
  id: string;
  titulo: string;
  lineas: LineaPizarra[];
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
  className,
}: {
  escenas: Escena[];
  /** Texto de la línea que el puntero está señalando, si hay alguno. */
  resaltado: string | null;
  className?: string;
}) {
  const actual = escenas[escenas.length - 1] ?? null;
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [actual?.lineas.length, actual?.id]);

  return (
    <div className={cn("space-y-3", className)}>
      <Fases escenas={escenas} />

      <div
        className="relative min-h-[18rem] overflow-hidden rounded-lg border bg-card shadow-inner sm:min-h-[22rem]"
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
              className="h-full"
            >
              <div className="border-b bg-muted/40 px-5 py-2.5">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
                  {actual.titulo}
                </h2>
              </div>

              <div className="max-h-[26rem] space-y-3 overflow-y-auto p-5">
                <AnimatePresence initial={false}>
                  {actual.lineas.map((linea) => (
                    <motion.div
                      key={linea.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      <LineaRenderizada
                        linea={linea}
                        resaltada={resaltado != null && linea.texto.includes(resaltado)}
                      />
                    </motion.div>
                  ))}
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

function LineaRenderizada({
  linea,
  resaltada,
}: {
  linea: LineaPizarra;
  resaltada: boolean;
}) {
  // Una fórmula limpia se compone entera y centrada. Una línea que resulta ser
  // una frase —el motor también escribe rótulos y avisos en la pizarra— se
  // muestra como prosa, pero con SUS fórmulas compuestas igualmente.
  const formulaEntera = useMemo(() => {
    if (linea.clase === "explicacion" || !pareceMatematica(linea.texto)) return null;
    try {
      return katex.renderToString(planoALatex(linea.texto), {
        displayMode: true,
        throwOnError: false,
        errorColor: "hsl(var(--destructive))",
        strict: false,
      });
    } catch {
      return null;
    }
  }, [linea.texto, linea.clase]);

  if (formulaEntera) {
    return (
      <div
        className={cn(
          "overflow-x-auto rounded-md px-3 py-2 transition-colors",
          resaltada
            ? "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50"
            : "bg-muted/40",
        )}
        dangerouslySetInnerHTML={{ __html: formulaEntera }}
      />
    );
  }

  return (
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
  );
}
