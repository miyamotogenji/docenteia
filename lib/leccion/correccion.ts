// Ruta relativa, no el alias "@/": este módulo lo importan tanto Next.js (que
// resuelve el alias) como los scripts de qa/, que se ejecutan con Node a secas
// y no lo conocen. La ruta relativa funciona en los dos.
import {
  computeAnswer,
  computeDerivative,
  computeFactorization,
  solveFractionFromText,
  solveLinearFromText,
} from "../../src/preLight.js";

/**
 * Resolución determinista de un ejercicio, en el servidor.
 *
 * El motor no tiene una única puerta de entrada: cada familia de ejercicios
 * tiene su propio solver, y `computeAnswer` sólo cubre aritmética y derivadas.
 * Usarlo para todo dejaba sin calificar las ecuaciones lineales y la
 * factorización —dos de los cinco temas— devolviendo "no verificable" para
 * ejercicios que el motor sí sabe resolver.
 *
 * El TEMA ACTIVO decide qué solver se aplica, y lo hace de forma EXCLUSIVA: una
 * expresión suelta como "x² - 9" se puede derivar o factorizar, y en una
 * sesión de factorización hay que factorizarla. Sin tema se prueban las
 * lecturas en el mismo orden que usa el núcleo heredado.
 */

type Solver = (expresion: string) => string | null;

/** Derivar exige la palabra clave: `computeDerivative("3x²")` devuelve null. */
const derivar: Solver = (e) => computeDerivative(/deriv|d\s*\/\s*dx/i.test(e) ? e : `derivada de ${e}`);

const factorizar: Solver = (e) => computeFactorization(/factoriz/i.test(e) ? e : `factoriza ${e}`);

const SOLVERS_POR_TEMA: Record<string, Solver[]> = {
  aritmetica: [computeAnswer],
  fracciones: [solveFractionFromText, computeAnswer],
  lineales: [solveLinearFromText],
  ecuaciones_lineales: [solveLinearFromText],
  factorizacion: [factorizar],
  derivadas: [derivar],
};

/** Orden de tanteo cuando no se sabe el tema, el mismo que aplica el núcleo. */
const SOLVERS_SIN_TEMA: Solver[] = [
  solveLinearFromText,
  solveFractionFromText,
  computeAnswer,
  derivar,
  factorizar,
];

/**
 * Devuelve la solución del ejercicio, o `null` si el motor no lo cubre.
 *
 * Ese `null` es información, no un fallo: significa que no se puede calificar
 * con garantía. Devolver un veredicto inventado en ese caso sería exactamente
 * la alucinación que el validador determinista existe para evitar.
 */
export function resolverEjercicio(ejercicio: string, tema?: string): string | null {
  const expresion = String(ejercicio ?? "").trim();
  if (!expresion) return null;

  const clave = String(tema ?? "").trim().toLowerCase();
  const solvers = SOLVERS_POR_TEMA[clave] ?? SOLVERS_SIN_TEMA;

  for (const solver of solvers) {
    try {
      const resultado = solver(expresion);
      if (resultado != null && String(resultado).trim() !== "") return String(resultado);
    } catch {
      // Un solver que no sabe leer la expresión no debe tumbar la corrección:
      // se pasa al siguiente.
    }
  }
  return null;
}
