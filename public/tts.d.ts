/**
 * Tipos del módulo de voz del prototipo (Web Speech API).
 *
 * Se conserva en JavaScript por la misma razón que el resto del núcleo: ya
 * resuelve la selección de voz en español, la normalización de la lectura
 * ("x²" se dice "equis al cuadrado") y el troceado de textos largos, y `qa/`
 * lo importa tal cual.
 */

/** Convierte el texto a cómo debe SONAR (símbolos y variables → palabras). */
export function normalizeForSpeech(texto: string): string;

/** Trocea un texto largo en fragmentos que el sintetizador pronuncia sin cortes. */
export function chunkForSpeech(texto: string): string[];

export class TTS {
  constructor();
  /** false cuando el navegador no soporta síntesis de voz. */
  enabled: boolean;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  /** ¿Hay una voz en español instalada? */
  hasSpanishVoice(): boolean;
  /** Descripción legible del estado de la voz, para la interfaz. */
  describe(): string;
  speak(texto: string, opciones?: { signal?: AbortSignal }): Promise<void>;
  cancel(): void;
}
