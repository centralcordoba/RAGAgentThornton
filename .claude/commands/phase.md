---
description: Ejecutá una fase específica del master build prompt de RegWatch AI con el contexto correcto cargado
allowed-tools: Read, Write, Edit, Bash, Glob
---

Quiero ejecutar la Fase $ARGUMENTS del proyecto RegWatch AI.

Antes de empezar:
1. Leé el CLAUDE.md para tener el contexto completo del proyecto
2. Confirmá que entendiste el stack: Azure OpenAI + AI Search + Redis + Node.js/TS + Neo4j + Next.js 14
3. Confirmá que vas a aplicar TODAS las reglas: error handling, logging pino, idempotencia, cache Redis, HITL para HIGH alerts

Luego ejecutá las tareas de esa fase en orden, una por una.

Para cada tarea:
- Mostrá el FILE PATH antes del código
- Archivos COMPLETOS, sin omitir imports
- TypeScript strict (no any)
- Estructura de error: `{ code, message, requestId, details? }`
- Logs con pino: `{ service, operation, requestId, duration, result }`

Al terminar cada tarea, preguntame si validé el criterio de aceptación antes de continuar con la siguiente.
