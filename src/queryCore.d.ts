/**
 * Tipos del núcleo de /api/query.
 *
 * El motor (classifier, preLight, lsgPrompt, geminiClient, queryCore) se
 * mantiene en JavaScript a propósito: son ~5.000 líneas de lógica matemática
 * validada en producción y con una suite de QA que la respalda. Reescribirlas
 * en TypeScript sería reescribir la pedagogía, que es justamente lo que el
 * encargo pide NO hacer. En su lugar se declara aquí su superficie pública, de
 * modo que todo el código nuevo del PMV 1 la consume con tipos estrictos.
 */

/** Intenciones que distingue el clasificador. */
export type Intencion = "resolver" | "aprender" | "explicar" | "practicar";

/** Un paso ya normalizado por el PRE Light, listo para la SmartBoard. */
export interface Paso {
  tipo: "avatar" | "hablar" | "pizarra" | "preguntar" | "esperar" | string;
  [clave: string]: unknown;
}

/** Learning Scene Graph: la lección como grafo de directivas ordenadas. */
export interface LSG {
  escena: string;
  intencion?: string;
  duracion_estimada?: number;
  directivas: Array<Record<string, unknown>>;
  [clave: string]: unknown;
}

export interface RespuestaQuery {
  query: string;
  reexplicacion: boolean;
  intencion: Intencion;
  confianza: number;
  /** "gemini" (modelo real) · "mock" (demo) · "local" (motor determinista). */
  fuente_ia: "gemini" | "mock" | "local";
  modelo: string;
  lsg: LSG;
  pasos: Paso[];
  advertencias: string[];
  tokens: Record<string, number> | null;
  cache_activo: boolean;
  cursores?: Record<string, number>;
  cacheado?: boolean;
}

export interface RespuestaError {
  error: string;
  reintentar_en_segundos?: number;
}

export interface Resultado {
  status: number;
  json: RespuestaQuery | RespuestaError;
  headers?: Record<string, string>;
}

export interface Salud {
  status: "ok";
  modo_ia: "gemini" | "mock";
  modelo: string;
  version: string;
}

export function salud(): Salud;

export function limiteGeneral(
  ip: string,
):
  | { ok: true }
  | { ok: false; status: number; headers: Record<string, string>; json: RespuestaError };

export function manejarConsulta(body: unknown, ip?: string): Promise<Resultado>;
