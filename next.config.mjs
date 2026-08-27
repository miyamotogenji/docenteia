/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El núcleo pedagógico validado (src/*.js) se importa tal cual desde las rutas de
  // servidor. Se marca como externo para que Next no intente empaquetarlo en el
  // cliente: es código de servidor y usa fetch de Node.
  serverExternalPackages: ["bcryptjs"],
  eslint: {
    // El prototipo heredado (public/, qa/, server.js) no se lintea: es código de
    // referencia para la paridad, no código nuevo del PMV 1.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
