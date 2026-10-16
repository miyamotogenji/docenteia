/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El núcleo pedagógico validado (src/*.js) se importa tal cual desde las rutas de
  // servidor. Se marca como externo para que Next no intente empaquetarlo en el
  // cliente: es código de servidor y usa fetch de Node.
  //
  // `@react-pdf/renderer` (HITO 4, exportación de reportes) hace lo mismo por
  // otro motivo: el bundle de webpack empaquetaba mal sus fuentes/metricas
  // internas —funcionaba en local (`next dev` y `next start`, con el
  // filesystem completo) pero fallaba con 500 en Vercel, donde el rastreo de
  // archivos de la función serverless sólo incluye lo que webpack empaquetó.
  // Tratarlo como externo deja que Node lo resuelva tal cual desde
  // node_modules, que es lo que el rastreador de Vercel sí sabe copiar
  // completo.
  serverExternalPackages: ["bcryptjs", "@react-pdf/renderer"],
  eslint: {
    // El prototipo heredado (public/, qa/, server.js) no se lintea: es código de
    // referencia para la paridad, no código nuevo del PMV 1.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
