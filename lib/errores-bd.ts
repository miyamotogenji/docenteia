import { Prisma } from "@prisma/client";

/**
 * Traduce un fallo de base de datos a un mensaje que dice QUÉ HACER.
 *
 * Por qué existe: al desplegar el preview, la aplicación devolvía "No se pudo
 * completar el registro. Inténtalo de nuevo" porque las tablas no existían
 * todavía. Ese mensaje es correcto para un fallo transitorio, pero aquí era
 * engañoso: reintentar no arreglaba nada y no daba ninguna pista de que
 * faltaban las migraciones. Costó un viaje de ida y vuelta averiguarlo.
 *
 * Estos mensajes no filtran nada sensible: no incluyen la cadena de conexión,
 * ni credenciales, ni el mensaje interno de la excepción. Sólo nombran el paso
 * que falta, que es información de despliegue, no del usuario final.
 */
export interface FalloBaseDeDatos {
  /** Mensaje para la respuesta HTTP. */
  mensaje: string;
  /** Código HTTP adecuado: 503, porque el servicio no está listo. */
  status: number;
  /** Etiqueta corta para el log del servidor. */
  registro: string;
}

export function explicarFalloDeBaseDeDatos(e: unknown): FalloBaseDeDatos | null {
  // Las tablas no existen: falta ejecutar las migraciones contra esta base.
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2021" || e.code === "P2022") {
      return {
        mensaje:
          "La base de datos todavía no tiene las tablas del proyecto. Falta ejecutar las migraciones: npx prisma migrate deploy",
        status: 503,
        registro: "tablas_inexistentes",
      };
    }
    if (e.code === "P1000") {
      return {
        mensaje:
          "Las credenciales de la base de datos no son válidas. Revisa DATABASE_URL y DIRECT_URL.",
        status: 503,
        registro: "credenciales_invalidas",
      };
    }
    if (e.code === "P1001" || e.code === "P1002") {
      return {
        mensaje:
          "No se puede alcanzar la base de datos. Revisa que el proyecto de Supabase esté activo y que DATABASE_URL apunte al pooler.",
        status: 503,
        registro: "base_inalcanzable",
      };
    }
  }

  // Fallo al inicializar el cliente: normalmente falta una variable de entorno
  // o la cadena de conexión es incorrecta.
  if (e instanceof Prisma.PrismaClientInitializationError) {
    const detalle = String(e.message);
    if (/Environment variable not found: DIRECT_URL/i.test(detalle)) {
      return {
        mensaje:
          "Falta la variable de entorno DIRECT_URL. Prisma la necesita para migrar; en Supabase es la conexión directa (puerto 5432).",
        status: 503,
        registro: "falta_direct_url",
      };
    }
    if (/Environment variable not found: DATABASE_URL/i.test(detalle)) {
      return {
        mensaje:
          "Falta la variable de entorno DATABASE_URL. En Supabase es la cadena del pooler (puerto 6543).",
        status: 503,
        registro: "falta_database_url",
      };
    }
    return {
      mensaje:
        "No se pudo conectar con la base de datos. Revisa DATABASE_URL y DIRECT_URL, y que las migraciones estén aplicadas.",
      status: 503,
      registro: "inicializacion_fallida",
    };
  }

  return null;
}
