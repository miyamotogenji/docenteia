"use client";

import katex from "katex";
import { Fragment, useMemo } from "react";

import { separarFormulas } from "@/lib/matematicas";
import { cn } from "@/lib/utils";

/**
 * Renderiza una expresión matemática AISLADA con KaTeX.
 *
 * El HTML que produce KaTeX se inyecta con dangerouslySetInnerHTML, que es el
 * modo previsto de uso de la librería. Es seguro aquí porque KaTeX escapa la
 * entrada y porque las expresiones provienen del banco de contenidos del
 * servidor, nunca de texto escrito por un alumno.
 */
export function Math({
  expresion,
  display = false,
  className,
}: {
  expresion: string;
  /** true = fórmula en bloque, centrada; false = en línea con el texto. */
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(() => renderKatex(expresion, display), [expresion, display]);

  return (
    <span
      className={cn(display && "block my-2", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderKatex(expresion: string, display: boolean): string {
  try {
    return katex.renderToString(expresion, {
      displayMode: display,
      throwOnError: false,
      // Una expresión mal escrita se muestra en rojo en lugar de tumbar la
      // página: un fallo de contenido no debe romper la lección.
      errorColor: "hsl(var(--destructive))",
      strict: false,
    });
  } catch {
    return escaparHtml(expresion);
  }
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Renderiza un texto MIXTO: prosa normal con fórmulas intercaladas entre
 * delimitadores `$…$` (en línea) o `$$…$$` (en bloque).
 *
 * Por qué hace falta, además de <Math>: los enunciados del banco son frases
 * completas que llevan la fórmula dentro —"Resuelve y simplifica: $\frac{2}{3}
 * + \frac{5}{6}$"—. Pasar la frase entera a KaTeX produciría un galimatías, y
 * dejarla como texto plano es justamente lo que se quería evitar. Aquí se
 * separa una cosa de la otra: sólo lo que va entre `$` se compone como
 * matemática, y la prosa se queda como prosa.
 *
 * Un texto sin ningún `$` se muestra tal cual, así que sigue siendo válido
 * escribir enunciados sin fórmulas.
 */
export function TextoMatematico({
  texto,
  className,
}: {
  texto: string;
  className?: string;
}) {
  const partes = useMemo(() => separarFormulas(texto), [texto]);

  return (
    <span className={className}>
      {partes.map((parte, i) =>
        parte.tipo === "texto" ? (
          <Fragment key={i}>{parte.contenido}</Fragment>
        ) : (
          <span
            key={i}
            className={parte.tipo === "bloque" ? "block my-2" : undefined}
            dangerouslySetInnerHTML={{
              __html: renderKatex(parte.contenido, parte.tipo === "bloque"),
            }}
          />
        ),
      )}
    </span>
  );
}
