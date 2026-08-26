// Comprobación previa de la suite: verifica que hay un servidor escuchando
// antes de lanzar cientos de turnos contra él.
//
// Sin esto, una aplicación no arrancada se manifiesta como una cascada de
// fallos de prueba, que es un síntoma muy engañoso: parece que el código está
// roto cuando lo único que pasa es que nadie ejecutó `npm run dev`.
import { BASE_URL, exigirServidor } from "./base-url.mjs";

console.log(`\n  Suite de validación de MentorIA Math`);
console.log(`  ────────────────────────────────────`);
await exigirServidor();
console.log(`  Todo listo. Ejecutando las baterías contra ${BASE_URL}\n`);
