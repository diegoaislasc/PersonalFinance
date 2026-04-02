# personal-automations

Monorepo para **automatizaciones personales** de bajo esfuerzo. Cada dominio vive en su carpeta; la API HTTP en `api/` solo orquesta y delega.

## Estructura

| Ruta | Rol |
|------|-----|
| [api/](api/) | Funciones Vercel (Serverless); mantener handlers delgados. |
| [correo/](correo/) | Próximo: pipeline de análisis/resumen de correo. |
| [finanzas/](finanzas/) | Reservado (vacío). |
| [prompts/](prompts/) | Plantillas de LLM versionadas por dominio. |
| [scripts/](scripts/) | Dev local y verificación (`verify-health`). |

## Requisitos

- Node.js 22+ (recomendado 24 LTS)
- npm

## Desarrollo local

```bash
npm install
npm run dev
# En otra terminal:
curl -s http://localhost:3000/api/health | jq .
```

## Comprobaciones

```bash
npm run typecheck
npm run test:smoke
```

## Despliegue (Vercel)

La configuración vive en [vercel.json](vercel.json). Variables: copiar [.env.example](.env.example) a `.env.local` y rellenar por dominio cuando existan integraciones.

**Logs en producción:** [Vercel Dashboard](https://vercel.com) → proyecto → Logs, o `npx vercel logs` si tienes CLI vinculada.

## Git y contribución

- **Rama principal:** los cambios entran vía **pull request** (no pushes directos a `main`); convención de commits: [Conventional Commits](https://www.conventionalcommits.org/).
- **CI:** GitHub Actions ejecuta `typecheck` y `test:smoke` en cada push y PR.

## Contexto para agentes

Ver [CLAUDE.md](CLAUDE.md).
