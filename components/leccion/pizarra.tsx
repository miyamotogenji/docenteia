"use client";

import katex from "katex";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";

import { TextoMatematico } from "@/components/math";
import { DiagramaConcepto } from "@/components/leccion/diagrama-concepto";
import { pasoIntermedioDerivada } from "@/lib/leccion/desarrollo";
import {
  esFaseDeConcepto,
  esFaseDeEjemplo,
  esFaseDePractica,
  esFaseDeReglas,
} from "@/lib/leccion/fases";
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

/**
 * Lo que se compone en la pizarra en un momento dado.
 *
 * El tipo va declarado a mano, y no inferido: con las tres ramas del cálculo
 * devolviendo formas distintas, TypeScript construía una unión que hacía
 * explotar la comprobación de tipos durante la compilación.
 */
interface ContenidoPizarra {
  /** Pasos del procedimiento, debajo del enunciado. */
  pasos: LineaPizarra[];
  /** Paso suelto de las fases que no plantean ejercicio. */
  pasoSuelto: LineaPizarra | null;
}

/**
 * Una fase abierta de la lección. Sólo identidad: ningún contenido.
 *
 * El ejercicio y el desarrollo NO viven aquí dentro, sino como estado propio
 * del aula que llega en props independientes. Mientras el enunciado colgaba de
 * la fase, cualquier cambio en el desarrollo pasaba por la misma estructura
 * que la tarjeta de arriba, y bastaba con no vaciarla a tiempo para que el
 * enunciado se quedara anclado al ejercicio anterior o desapareciera con los
 * pasos. Separados, la tarjeta superior se compone en cuanto se entra en la
 * fase y no depende en absoluto del ciclo de desarrollo.
 */
export interface FaseAbierta {
  id: string;
  titulo: string;
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
  fases,
  ejercicio,
  desarrollo,
  resaltado,
  reglas = [],
  reglaDetectada = null,
  tema,
  className,
}: {
  /** Fases ya abiertas: la tira de progreso y la vista en curso. */
  fases: FaseAbierta[];
  /**
   * Ejercicio activo. Llega ya resuelto desde el aula, que lo fija al entrar
   * en la fase, así que la tarjeta de arriba se compone en el milisegundo 0
   * sin esperar a que haya un solo paso calculado.
   */
  ejercicio: LineaPizarra | null;
  /**
   * Pasos del procedimiento. Vacío mientras el alumno no pida ayuda ni
   * resolución; el aula lo SUSTITUYE entero en cada petición.
   */
  desarrollo: LineaPizarra[];
  /** Texto de la línea que el puntero está señalando, si hay alguno. */
  resaltado: string | null;
  /** Catálogo formal del tema, del que sale la tarjeta de la fase de Reglas. */
  reglas?: ReglaPizarra[];
  /** Regla que el aula ha detectado como activa a partir de lo narrado. */
  reglaDetectada?: ReglaPizarra | null;
  /** Tema en curso, para elegir el diagrama de la fase de Concepto. */
  tema?: string;
  className?: string;
}) {
  const actual = fases[fases.length - 1] ?? null;
  const finRef = useRef<HTMLDivElement>(null);

  // La regla que el tutor está explicando ahora mismo, deducida de las líneas
  // ya reveladas. Cambia al ritmo del diálogo, no de golpe al entrar en la fase.
  /**
   * Regla que se compone en la fase de Reglas.
   *
   * Se elige, en este orden: la que el aula ha detectado como activa (mira todo
   * lo narrado), la que se deduzca de lo escrito en la pizarra, y si ninguna de
   * las dos da resultado, la PRIMERA del tema.
   *
   * Ese último recurso no es un adorno. En aritmética y en ecuaciones lineales
   * el motor no escribe nada en la pizarra durante esta fase —sólo narra—, así
   * que al dejar de volcar la locución al lienzo la fase se quedaba
   * COMPLETAMENTE en blanco. Una fase de "Reglas y propiedades" sin ninguna
   * regla a la vista no es aceptable, y el catálogo siempre tiene una.
   */
  const reglaEnCurso = useMemo(() => {
    if (!actual || !esFaseDeReglas(actual.id) || reglas.length === 0) return null;
    if (reglaDetectada) return reglaDetectada;
    const porPizarra = reglaActiva(
      [ejercicio?.texto ?? "", ...desarrollo.map((l) => l.texto)],
      reglas,
    );
    return porPizarra ?? reglas[0];
  }, [actual, ejercicio, desarrollo, reglas, reglaDetectada]);

  /** ¿La fase en curso plantea un ejercicio al alumno? */
  const planteaEjercicio =
    actual != null && (esFaseDeEjemplo(actual.id) || esFaseDePractica(actual.id));

  /**
   * ENUNCIADO FIJO ARRIBA + DESARROLLO DEBAJO.
   *
   * El enunciado llega en su propia prop y se compone tal cual: no se deduce de
   * los pasos ni espera a que haya ninguno. Aquí sólo se decide cómo
   * presentar el desarrollo, que en las fases sin ejercicio se reduce al último
   * paso escrito.
   */
  const { pasos, pasoSuelto } = useMemo((): ContenidoPizarra => {
    if (!actual) return { pasos: [], pasoSuelto: null };

    // Concepto y Reglas no plantean ejercicio: se compone el paso actual.
    if (!planteaEjercicio) {
      return {
        pasos: [],
        pasoSuelto: desarrollo.length > 0 ? desarrollo[desarrollo.length - 1] : null,
      };
    }

    // Paso intermedio de la derivada, donde se ve APLICADA la regla. Sólo en el
    // EJEMPLO: en la práctica revelaría la respuesta que el alumno tiene que
    // hallar, que es justo lo que la ramificación pedagógica evita.
    if (ejercicio && esFaseDeEjemplo(actual.id) && desarrollo.length > 0) {
      const intermedio = pasoIntermedioDerivada(ejercicio.texto);
      if (intermedio) {
        return {
          pasos: [{ id: -ejercicio.id - 1, texto: intermedio, clase: "formula" }, ...desarrollo],
          pasoSuelto: null,
        };
      }
    }

    return { pasos: desarrollo, pasoSuelto: null };
  }, [actual, planteaEjercicio, ejercicio, desarrollo]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [desarrollo.length, ejercicio?.id, actual?.id]);

  return (
    <div className={cn("space-y-3", className)}>
      <Fases fases={fases} />

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

                {/* En la fase de Concepto, un diagrama que enseñe la idea: la
                    tangente de una curva, las partes de un todo, la balanza. */}
                {esFaseDeConcepto(actual.id) && tema && <DiagramaConcepto tema={tema} />}

                {/* Fases con ejercicio: el enunciado anclado arriba y su
                    desarrollo debajo, para que el alumno pueda contrastar el
                    planteamiento con el procedimiento.

                    La tarjeta de ARRIBA no depende de que haya desarrollo: se
                    pinta en cuanto se entra en la fase, con el enunciado que se
                    adelantó al recibir la lección. La de ABAJO sólo aparece
                    cuando hay pasos que mostrar. Atar la primera a la segunda
                    dejaba la pizarra en blanco durante toda la locución. */}
                {(ejercicio || planteaEjercicio) && (
                  <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Ejercicio
                    </p>
                    {ejercicio ? (
                      <LineaRenderizada
                        linea={ejercicio}
                        resaltada={resaltado != null && ejercicio.texto.includes(resaltado)}
                        reglas={[]}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Preparando el ejercicio…</p>
                    )}
                  </div>
                )}

                {pasos.length > 0 && (
                  <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Desarrollo
                    </p>
                    <AnimatePresence initial={false}>
                      {pasos.map((linea) => (
                        <motion.div
                          key={linea.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22 }}
                        >
                          <LineaRenderizada
                            linea={linea}
                            resaltada={resaltado != null && linea.texto.includes(resaltado)}
                            reglas={esFaseDeEjemplo(actual.id) ? reglas : []}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Concepto y Reglas: no hay ejercicio, se compone el paso en curso. */}
                <AnimatePresence mode="wait">
                  {pasoSuelto && (
                    <motion.div
                      key={pasoSuelto.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                    >
                      <LineaRenderizada
                        linea={pasoSuelto}
                        resaltada={resaltado != null && pasoSuelto.texto.includes(resaltado)}
                        reglas={[]}
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
function Fases({ fases }: { fases: FaseAbierta[] }) {
  if (fases.length === 0) return null;
  const indiceActual = fases.length - 1;

  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Fases de la lección">
      {fases.map((fase, i) => {
        const completada = i < indiceActual;
        const activa = i === indiceActual;
        return (
          <li key={fase.id}>
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
              {fase.titulo}
            </span>
          </li>
        );
      })}
    </ol>
  );
}


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
