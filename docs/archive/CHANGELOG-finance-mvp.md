# Changelog archivado — Finance Bot MVP

Historial de bugs y decisiones del MVP de WhatsApp + Notion + Gemini retirado del repositorio.
Para el código en el commit previo a la reorganización del monorepo, usar `git log` y el tag sugerido `pre-automation-monorepo` (si fue creado).

---

# Changelog - Finance Bot MVP (original)

## Bugs Encontrados y Soluciones

### BUG-001: Modelo Gemini no disponible para cuentas nuevas
- **Error:** `ApiError: models/gemini-2.0-flash is no longer available to new users`
- **Causa raíz:** Google deprecó `gemini-2.0-flash` para cuentas nuevas de AI Studio. El modelo aparece en el listado de modelos pero rechaza peticiones de generación.
- **Fix:** Actualizar el modelo a `gemini-2.5-flash` en `src/services/llm.ts`.
- **Prevención:** Antes de elegir un modelo, validar disponibilidad con una petición de prueba, no solo con el listado de modelos.

### BUG-002: Vercel CLI requiere autenticación interactiva
- **Error:** `vercel dev` se bloquea esperando login OAuth en el navegador.
- **Causa raíz:** Vercel CLI no soporta ejecución sin cuenta autenticada, incluso para desarrollo local.
- **Fix:** Crear `scripts/dev-server.ts`, un servidor HTTP ligero que emula el entorno de Vercel sin dependencia de cuenta. Importa directamente el handler del webhook y construye objetos compatibles con `VercelRequest`/`VercelResponse`.
- **Prevención:** Para MVPs, evitar dependencias de plataforma que requieran autenticación en el flujo de desarrollo local.

### BUG-003: Instalación global de Vercel CLI falla con EACCES
- **Error:** `EACCES: permission denied, mkdir '/usr/local/lib/node_modules/vercel'`
- **Causa raíz:** `npm install -g` requiere permisos de superusuario en macOS con instalaciones de Node.js vía Homebrew.
- **Fix:** Instalar como devDependency local (`npm install -D vercel`) y usar vía `npx`.
- **Prevención:** Preferir siempre dependencias locales sobre globales.

### BUG-004: Esquema de BD incompatible entre meses (March vs April)
- **Error:** `Card Type is not a property that exists.` al insertar en la BD de Marzo.
- **Causa raíz:** La BD de Marzo usa `Card` con opciones simples (`Debit`, `credit`), mientras que Abril usa `Card Type` con opciones detalladas (`TDC Banorte`, `TDC Nu`, etc.). El bot fue diseñado para el esquema de Abril.
- **Fix temporal:** Apuntar `NOTION_DB_MARCH` al ID de la BD de Abril en `.env` para permitir pruebas antes del 1 de Abril.
- **Fix definitivo (futuro):** Estandarizar el esquema de todas las BDs mensuales al formato de Abril, o implementar detección dinámica del esquema vía la API de Notion.

### BUG-005: Dev server interceptaba GET antes de llegar al handler
- **Error:** Test de método GET rechazado fallaba: esperaba "not allowed" pero recibía "Not found".
- **Causa raíz:** `dev-server.ts` filtraba requests no-POST con un 404 antes de delegarlas al webhook handler, que es quien debería retornar el 405.
- **Fix:** Remover el filtro de método HTTP del dev server, delegando toda request a `/api/webhook` directamente al handler.

### BUG-006: IDs de categorías son específicos por mes
- **Descubrimiento:** Cada mes en Notion tiene su propia BD de categorías con page IDs diferentes. Los IDs de "Transport", "Eating out", etc. de Abril no son los mismos que los de Marzo.
- **Impacto:** El sistema actual usa un único set de `NOTION_CAT_*` en `.env`, que solo funciona para el mes cuyos IDs estén configurados (actualmente Abril).
- **Fix futuro:** Implementar resolución dinámica de categorías: al registrar un gasto, consultar la BD de categorías del mes actual vía la API de Notion, buscar la categoría por nombre, y usar el page ID resultante.
