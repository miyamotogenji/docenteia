"use client";

import katex from "katex";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

/**
 * Renderiza notación matemática con KaTeX.
 *
 * Regla acordada con el cliente para el manejo de KaTeX: el texto explicativo
 * de la lección se mantiene en texto plano/Markdown y SÓLO las expresiones
 * matemáticas se renderizan. Por eso este componente recibe la expresión
 * aislada, no un párrafo mixto: quien decide qué es fórmula es el esquema de
 * datos, no un analizador que adivine sobre el texto.
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
  const html = useMemo(() => {
    try {
      return katex.renderToString(expresion, {
        displayMode: display,
        throwOnError: false,
        // Si una expresión está mal escrita se muestra en rojo en lugar de
        // tumbar la página: un fallo de contenido no debe romper la lección.
        errorColor: "hsl(var(--destructive))",
        strict: false,
      });
    } catch {
      return expresion;
    }
  }, [expresion, display]);

  return (
    <span
      className={cn(display && "block my-2", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
