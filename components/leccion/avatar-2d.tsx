"use client";

import type { EstadoAvatar } from "@/public/pseLight";
import { cn } from "@/lib/utils";

/**
 * Avatar 2D reactivo.
 *
 * Es el avatar SVG del prototipo, remapeado a los cuatro estados pedagógicos
 * acordados con el cliente:
 *
 *   esperando   → neutral      · respiración leve
 *   hablando    → hablando     · boca animada mientras suena la voz
 *   pensando    → pensando     · la cabeza se balancea
 *   corrigiendo → preguntando / sonriendo · late para llamar la atención
 *
 * El motor (PSE Light) sigue hablando en sus propios nombres de estado, que son
 * los que llegan por `estado`; la traducción a lenguaje pedagógico ocurre aquí,
 * de modo que el motor no tuvo que tocarse.
 *
 * Las animaciones son CSS (ver globals.css) y no de la librería de animación de
 * React. Sobre SVG, transformar un grupo depende de `transform-box`: sin él el
 * navegador toma como origen la esquina del lienzo, no la del elemento, y el
 * avatar se quedaba completamente quieto.
 */

const BOCAS: Record<EstadoAvatar, string> = {
  neutral: "M 42 74 Q 60 80 78 74",
  hablando: "M 44 72 Q 60 88 76 72 Q 60 80 44 72 Z",
  sonriendo: "M 40 72 Q 60 94 80 72",
  preguntando: "M 52 78 Q 60 84 68 78",
  pensando: "M 48 78 L 72 74",
};

const CEJAS: Record<EstadoAvatar, { l: string; r: string }> = {
  neutral: { l: "M 38 46 L 52 44", r: "M 68 44 L 82 46" },
  hablando: { l: "M 38 46 L 52 44", r: "M 68 44 L 82 46" },
  sonriendo: { l: "M 38 45 L 52 43", r: "M 68 43 L 82 45" },
  preguntando: { l: "M 38 44 L 52 40", r: "M 68 46 L 82 44" },
  pensando: { l: "M 38 43 L 52 41", r: "M 68 45 L 82 43" },
};

/** Cómo se le llama a cada estado de cara al alumno y al docente. */
const ETIQUETA: Record<EstadoAvatar, string> = {
  neutral: "Esperando",
  hablando: "Hablando",
  sonriendo: "Corrigiendo",
  preguntando: "Corrigiendo",
  pensando: "Pensando",
};

const COLOR_ESTADO: Record<EstadoAvatar, string> = {
  neutral: "text-muted-foreground",
  hablando: "text-primary",
  sonriendo: "text-emerald-600 dark:text-emerald-400",
  preguntando: "text-amber-600 dark:text-amber-400",
  pensando: "text-violet-600 dark:text-violet-400",
};

/** Animación de la cabeza según el estado. */
const ANIMACION_CABEZA: Record<EstadoAvatar, string> = {
  neutral: "avatar-esperando",
  hablando: "",
  sonriendo: "avatar-corrigiendo",
  preguntando: "avatar-corrigiendo",
  pensando: "avatar-pensando",
};

export function Avatar2D({
  estado,
  hablando,
  className,
}: {
  estado: EstadoAvatar;
  /** Anima la boca mientras el sintetizador está emitiendo. */
  hablando: boolean;
  className?: string;
}) {
  const boca = BOCAS[estado] ?? BOCAS.neutral;
  const cejas = CEJAS[estado] ?? CEJAS.neutral;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <svg
        viewBox="0 0 120 120"
        className="h-28 w-28 sm:h-32 sm:w-32"
        role="img"
        aria-label={`Tutor: ${ETIQUETA[estado]}`}
      >
        <g className={cn("avatar-pieza", ANIMACION_CABEZA[estado])}>
          {/* Cabeza */}
          <circle
            cx="60"
            cy="60"
            r="42"
            className="fill-primary/10 stroke-primary/40"
            strokeWidth="2"
          />

          {/* Ojos, con parpadeo constante: es lo que impide que el avatar
              parezca una imagen fija cuando está callado. */}
          <g className="avatar-pieza avatar-ojos">
            <circle cx="45" cy="56" r="5" className="fill-foreground" />
            <circle cx="75" cy="56" r="5" className="fill-foreground" />
          </g>

          {/* Cejas: cambian con el estado y dan la expresión. */}
          <path
            d={cejas.l}
            className="stroke-foreground transition-all duration-200"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={cejas.r}
            className="stroke-foreground transition-all duration-200"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />

          {/* Boca: se articula mientras la voz está sonando. */}
          <path
            d={boca}
            className={cn(
              "avatar-pieza stroke-foreground transition-all duration-200",
              estado === "hablando" ? "fill-foreground/70" : "fill-none",
              hablando && "avatar-boca-hablando",
            )}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </svg>

      <span className={cn("text-xs font-medium tabular-nums", COLOR_ESTADO[estado])}>
        {ETIQUETA[estado]}
      </span>
    </div>
  );
}
