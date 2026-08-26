// Math IA — servidor Express del PROTOTIPO (heredado).
//
// ESTADO EN EL PMV 1: se conserva como referencia ejecutable del prototipo, no
// como el servidor de producción. La aplicación del PMV 1 es Next.js
// (`npm run dev`), que sirve /api/query desde app/api/query/route.ts.
//
// Ambos caminos llaman al MISMO núcleo (src/queryCore.js), de modo que este
// servidor y la ruta de Next no pueden divergir: la paridad algorítmica es
// estructural, no algo que haya que verificar a mano en cada cambio.
//
// Para levantarlo:  npm run legacy:start   (sirve public/ en el puerto 3001)
//
// La API key vive SOLO en variables de entorno, nunca en el código ni en el
// frontend. El navegador nunca ve la clave: habla con este backend.

import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { salud, limiteGeneral, manejarConsulta } from "./src/queryCore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Puerto 3001 por defecto: el 3000 lo ocupa la aplicación Next.js del PMV 1, y
// la suite de qa/ apunta al 3000. Así ambos pueden convivir levantados.
const PORT = process.env.LEGACY_PORT || 3001;

app.use(express.json({ limit: "64kb" }));
// Estáticos con "no-cache" en HTML/JS/CSS: el navegador DEBE revalidar en cada carga.
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    setHeaders: (res, filePath) => {
      if (/\.(html|js|css)$/i.test(filePath)) res.setHeader("Cache-Control", "no-cache");
    },
  }),
);

const ipDe = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "desconocida";

app.get("/api/health", (_req, res) => res.json(salud()));

// Capa 1: tope general por IP sobre /api/query.
app.use("/api/query", (req, res, next) => {
  const r = limiteGeneral(ipDe(req));
  if (r.ok) return next();
  for (const [k, v] of Object.entries(r.headers || {})) res.set(k, v);
  return res.status(r.status).json(r.json);
});

app.post("/api/query", async (req, res) => {
  const r = await manejarConsulta(req.body, ipDe(req));
  for (const [k, v] of Object.entries(r.headers || {})) res.set(k, v);
  return res.status(r.status).json(r.json);
});

app.listen(PORT, () => {
  const modo = process.env.GEMINI_API_KEY ? "Gemini (API real)" : "MOCK (sin API key)";
  console.log(`\n  Math IA — prototipo heredado escuchando en http://localhost:${PORT}`);
  console.log(`  Modo IA: ${modo}`);
  console.log(`  (La aplicación del PMV 1 es Next.js: npm run dev → http://localhost:3000)`);
  if (!process.env.GEMINI_API_KEY) {
    console.log("  → Configura GEMINI_API_KEY en .env.local para usar la IA real.\n");
  } else {
    console.log("");
  }
});
