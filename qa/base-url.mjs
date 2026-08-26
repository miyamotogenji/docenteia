// URL contra la que corre la suite de validación.
//
// Requisito del cliente para el PMV 1: toda la suite debe poder ejecutarse en
// LOCAL, sin depender del despliegue de Render del prototipo. Por eso el valor
// por defecto es http://localhost:3000 —el puerto de la aplicación Next.js— y
// la URL remota ya no aparece en ningún script.
//
// Precedencia:
//   BASE_URL   → variable acordada para el PMV 1 (también se lee de .env)
//   QA_URL     → nombre que usaban qa.mjs y verificar.mjs en el prototipo
//   MATHIA_URL → nombre que usaban aceptacion.mjs, sesiones.mjs y barrido.mjs
//   http://localhost:3000
//
// Se conservan los dos nombres antiguos para no romper los comandos que el
// cliente ya tenga anotados de la etapa anterior.
import "dotenv/config";

export const BASE_URL = (
  process.env.BASE_URL ||
  process.env.QA_URL ||
  process.env.MATHIA_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");

/**
 * Comprueba que hay un servidor escuchando antes de lanzar cientos de turnos
 * contra el vacío. Sin esto, un servidor caído se manifiesta como una cascada
 * de fallos de prueba en lugar de como lo que es: nadie ha arrancado la app.
 */
export async function exigirServidor() {
  try {
    const r = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    // Se acepta también un 503: /api/health devuelve 503 cuando la base de
    // datos no responde, y esta suite valida /api/query, que NO usa la base de
    // datos. Exigir un 200 aquí impediría ejecutar la validación del núcleo
    // pedagógico sólo porque falta PostgreSQL, que es una dependencia de otra
    // parte de la aplicación.
    const salud = await r.json();
    if (!salud?.status) throw new Error(`/api/health devolvió ${r.status}`);
    console.log(`  Servidor: ${BASE_URL}  ·  modo IA: ${salud.modo_ia}`);
    if (salud.base_datos && salud.base_datos !== "ok") {
      console.log(
        `  Aviso: base de datos "${salud.base_datos}". Las baterías de /api/query no la necesitan.`,
      );
    }
    console.log("");
    return salud;
  } catch (e) {
    console.error(
      `\n  ✗ No hay servidor en ${BASE_URL}\n` +
        `    Arranca la aplicación en otra terminal:  npm run dev\n` +
        `    O apunta la suite a otra URL:            BASE_URL=… node qa/…\n` +
        `    Detalle: ${e.message}\n`,
    );
    process.exit(1);
  }
}
