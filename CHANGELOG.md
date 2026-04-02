# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/). Versionado [SemVer](https://semver.org/lang/es/) donde aplique.

## [Unreleased]

## [1.0.0] - 2026-04-01

### Changed (breaking)

- Repositorio reorientado a **monorepo de automatizaciones personales**: dominios por carpeta (`correo/`, `finanzas/` reservado), `prompts/` para plantillas versionadas, API mínima `GET /api/health`.
- Eliminado el MVP de finanzas (webhook Twilio/WhatsApp, integración Notion, Gemini, Redis). El historial narrativo de ese MVP está en [docs/archive/CHANGELOG-finance-mvp.md](docs/archive/CHANGELOG-finance-mvp.md).

### Added

- `api/health.ts`, `scripts/verify-health.ts` (smoke sin servidor), documentación raíz y [CLAUDE.md](CLAUDE.md).
- CI con GitHub Actions (`typecheck` + `test:smoke`).

### Git

- Para inspeccionar el árbol de código del Finance Bot MVP antes de este cambio: `git log --oneline` y, si existe, el tag `pre-automation-monorepo` en el commit anterior a este cambio.
