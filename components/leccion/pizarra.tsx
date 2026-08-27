"use client";

import katex from "katex";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";

import { pareceMatematica, planoALatex } from "@/lib/matematicas";
import { cn } from "@/lib/utils";

/** Una línea escrita en la pizarra. */
export interface LineaPizarra {
  id: number;
  texto: string;
  /** "formula" viene de una directiva `pizarra`; "explicacion", de una `hablar`. */
  clase: "formula" | "explicacion";
  /** Módulo pedagógico al que pertenece (concepto, regla, ejemplo, práctica). */
  modulo?: string;
}

/**
 * Pizarra digital (SmartBoard).
 *
 * Va revelando el contenido a medida que el tutor lo explica, con la fórmula
 * compuesta en KaTeX y la explicación en prosa.
 *
 * Sobre el renderizado: el motor pedagógico escribe la pizarra en notación
 * plana ("12x³ - 4x"), que es la que entienden sus analizadores y su suite de
 * pruebas. Traducirla a LaTeX aquí, y no en el motor, permite componerla sin
 * tocar una sola línea de la lógica ya validada.
 */
export function Pizarra({
  lineas,
  resaltado,
  className,
}: {
  lineas: LineaPizarra[];
  /** Texto de la línea que el puntero está señalando, si hay alguno. */
  resaltado: string | null;
  className?: string;
}) {
  const finRef = useRef<HTMLDivElement>(null);

  // La pizarra sigue al tutor: cada línea nueva se desplaza a la vista.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lineas.length]);

  return (
    <div
      className={cn(
        "relative min-h-[18rem] overflow-y-auto rounded-lg border bg-card p-5 shadow-inner sm:min-h-[24rem]",
        className,
      )}
      aria-live="polite"
      aria-label="Pizarra"
    >
      {lineas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          La pizarra está en blanco. Elige un tema y pulsa <em>Empezar la lección</em>.
        </p>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {lineas.map((linea) => (
              <motion.div
                key={linea.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
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
      )}
    </div>
  );
}

function LineaRenderizada({
  linea,
  resaltada,
}: {
  linea: LineaPizarra;
  resaltada: boolean;
}) {
  const html = useMemo(() => {
    // Una explicación es prosa: se muestra tal cual. Una fórmula se compone,
    // salvo que resulte ser una frase (el motor también escribe avisos en la
    // pizarra), en cuyo caso se muestra como texto.
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

  if (html) {
    return (
      <div
        className={cn(
          "overflow-x-auto rounded-md px-3 py-2 transition-colors",
          resaltada ? "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50" : "bg-muted/40",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <p
      className={cn(
        "rounded-md px-3 py-1.5 leading-relaxed transition-colors",
        linea.clase === "explicacion"
          ? "text-sm text-muted-foreground"
          : "font-mono text-base",
        resaltada && "bg-amber-100 ring-2 ring-amber-400 dark:bg-amber-950/50",
      )}
    >
      {linea.texto}
    </p>
  );
}
