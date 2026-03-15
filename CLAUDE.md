# RegWatch AI + ComplianceGraph

Plataforma de monitoreo regulatorio internacional para Grant Thornton.
Construida en Azure-first (GT es partner oficial de Microsoft — sin excepciones).

## Stack

| Capa | Tecnología |
|------|-----------|
| Cloud | Microsoft Azure |
| AI/LLM | Azure OpenAI — GPT-4o + text-embedding-3-large |
| Search | Azure AI Search — Hybrid Vector+BM25 |
| Cache | Azure Cache for Redis |
| Backend | Node.js / Express — TypeScript strict |
| Frontend | Next.js 14 App Router |
| Graph DB | Neo4j (knowledge graph) |
| Relacional | PostgreSQL — Azure Database |
| Queue | Azure Service Bus |
| Monitoring | Azure Application Insights |
| Logging | pino (structured) |
| Infra | Docker + Azure Container Apps + Bicep |
| AI Agents | LangChain.js ReAct |

## Estructura del monorepo

```
regwatch-ai/
├── apps/api/src/
│   ├── routes/        # REST endpoints
│   ├── services/      # Business logic (alerts, onboarding, notifications)
│   ├── agents/        # LangChain agents
│   ├── jobs/          # Ingestion jobs + scheduler (Azure Functions)
│   ├── db/            # Prisma + PostgreSQL
│   ├── graph/         # Neo4j queries
│   └── middleware/    # Auth, RBAC, logging, rate limiting
├── apps/web/          # Next.js 14 frontend
├── packages/shared/   # Types e interfaces TypeScript compartidas
├── packages/ai-core/  # RAG engine, embeddings, Redis cache
├── infra/             # Bicep templates
├── scripts/           # Seed data, demo setup
└── docs/              # Architecture diagrams, OpenAPI spec
```

## Comandos

```bash
npm run dev          # API en :3000, web en :3001
npm test             # vitest (unitarios + integración)
npm run typecheck    # tsc --noEmit (correr antes de commit)
npm run lint         # eslint
docker compose up    # full stack local (api, web, postgres, neo4j, redis, azurite)
az bicep build -f infra/main.bicep   # validar infra
```

## Reglas de código — SIEMPRE aplicar

### Formato de output
- Archivos COMPLETOS, nunca fragmentos
- FILE PATH antes de cada bloque de código: `FILE: apps/api/src/...`
- Fenced code blocks con el lenguaje correcto
- Sin imports omitidos, sin pseudo-código

### Error handling
- Nunca `throw new Error(...)` directo — usar AppError class centralizada
- Todo error incluye `requestId`
- Formato: `{ code: string, message: string, requestId: string, details?: unknown }`

### Logging (pino)
- Todo log incluye: `service`, `operation`, `requestId`, `duration`, `result`
- Ejemplo: `logger.info({ service: 'ingestion', source: 'SEC_EDGAR', operation: 'fetch', documentsFetched: 12, duration: 340 })`
- Nunca loguear datos sensibles de clientes

### TypeScript
- Strict mode ON — nunca `any`
- Interfaces completas para todos los tipos de dominio
- Result<T, E> pattern para operaciones que pueden fallar

## Reglas del dominio — CRÍTICO

### LLM safety (aplicación regulatoria)
- Nunca fabricar regulaciones, fechas o montos
- Si confidence < 0.5 → retornar exactamente `"insufficient data"`
- Toda respuesta AI incluye: `answer`, `sources[]`, `confidence: 0-1`, `reasoning`, `impactedObligations[]`

### RAG pipeline
1. Verificar Redis cache PRIMERO (key: hash(question+filters), TTL 1h)
2. Si miss: HybridSearch vectorWeight=0.7, keywordWeight=0.3, top_k=5
3. Azure OpenAI: max_tokens=1500, temperature=0.2
4. Cachear resultado en Redis

### Ingestion — idempotencia
- Clave única: `source + documentId + version`
- Verificar en PostgreSQL antes de indexar
- Skip silencioso si ya existe — nunca duplicar

### Rate limits externos
- SEC EDGAR: máximo 10 req/segundo con exponential backoff
- Usar Redis para throttling

### Human-in-the-Loop (CRÍTICO)
- Alertas HIGH → revisión de GT Professional → recién notificar al cliente
- NUNCA enviar directamente al cliente sin revisión humana

### Audit trail
- Loguear SIEMPRE: `regulation_ingested`, `ai_analysis_generated`, `alert_sent`, `alert_acknowledged`
- Data lineage: `regulation → ai_analysis → obligation → client → alert`

## Arquitectura — criterios de decisión

Cuando hay múltiples opciones, preferir en orden:
1. Soluciones Azure-native (managed services)
2. Arquitectura más simple
3. Managed services sobre infraestructura custom
4. Implementaciones observability-friendly

## Non-goals del MVP — NO implementar

- Multi-tenant billing
- UI theming avanzado
- Modelos ML custom (solo Azure OpenAI)
- Auto-registro de usuarios
- Internacionalización — solo español e inglés hardcoded

## Contexto de Grant Thornton

GT es partner estratégico oficial de Microsoft. Usan Azure OpenAI para su herramienta
interna CompliAI (automatiza flujo de trabajo del auditor). CompliAI NO monitorea
regulaciones externas — RegWatch AI es COMPLEMENTARIO, no competidor.

Presencia en 150+ países. Crecimiento fuerte en LATAM: Brasil +21%, Singapur +28.8%.

## Referencia

- @docs/architecture.md — diagrama Mermaid completo
- @docs/openapi.yaml — spec completa de endpoints
- @infra/README.md — guía de deploy en Azure
