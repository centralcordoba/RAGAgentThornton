---
description: Debug de errores en RegWatch AI con contexto del stack Azure
allowed-tools: Read, Bash, Grep, Glob
---

Tengo este error en RegWatch AI: $ARGUMENTS

Analizalo en contexto del stack del proyecto:
- Azure OpenAI / Azure AI Search / Redis / Neo4j / PostgreSQL / Service Bus
- Node.js TypeScript strict
- Azure Container Apps

Para debuggear:
1. Identificá el componente afectado (ingestion / RAG / graph / alerts / API / frontend)
2. Buscá el error en los archivos relevantes
3. Verificá si es un problema de: rate limiting, conexión, idempotencia, cache, configuración de Azure, TypeScript types
4. Proponé la solución mínima que resuelve el problema sin romper otras partes
5. Si el fix afecta error handling o logging, asegurate de mantener el formato estándar del proyecto

Mostrá el fix como un diff claro o el archivo completo según corresponda.
