# Prompts versionados

- Organización sugerida: `prompts/<dominio>/` (p. ej. `correo/`, `finanzas/`).
- Versionar carpetas (`v1`, `v2`) o prefijos en nombre de archivo; evitar editar una plantilla “en uso” sin copiar a nueva versión.
- Cada plantilla debería documentar en comentario o frontmatter:
  - Rol del modelo y límites.
  - **Temperatura** y **tokens máximos** recomendados para la tarea (analítica → baja temperatura).
- Salidas: preferir JSON o esquemas estructurados cuando el consumidor sea código.
