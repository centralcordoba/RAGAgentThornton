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

## Deploy manual a Azure (sin CI/CD)

### Recursos actuales (dev)

| Recurso | Nombre | Detalle |
|---------|--------|---------|
| ACR | `regwatchdevacr.azurecr.io` | Container Registry |
| API Container App | `regwatch-api-dev` | rg-regwatch-dev, East US |
| Web Container App | `regwatch-web-dev` | rg-regwatch-dev, East US |
| PostgreSQL | `regwatch-postgres-dev` | Burstable B2s, 32GB |
| Redis | `regwatch-redis-dev` | Deshabilitado temporalmente (timeouts bloquean API) |
| Neo4j | No provisionado en Azure | Deshabilitado en env vars |

### URLs

- **API**: `https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io`
- **Web**: `https://regwatch-web-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io`

### Pasos para deploy manual

```bash
# 1. Login
az acr login --name regwatchdevacr

# 2. Build images (desde raiz del repo)
docker build --target production -f apps/api/Dockerfile \
  -t regwatchdevacr.azurecr.io/regwatch-api:TAG .

docker build --target production \
  --build-arg NEXT_PUBLIC_API_URL=https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io \
  --build-arg NEXT_PUBLIC_DEV_TOKEN=<JWT_TOKEN> \
  -f apps/web/Dockerfile \
  -t regwatchdevacr.azurecr.io/regwatch-web:TAG .

# 3. Push
docker push regwatchdevacr.azurecr.io/regwatch-api:TAG
docker push regwatchdevacr.azurecr.io/regwatch-web:TAG

# 4. Deploy
az containerapp update -n regwatch-api-dev -g rg-regwatch-dev \
  --image regwatchdevacr.azurecr.io/regwatch-api:TAG

az containerapp update -n regwatch-web-dev -g rg-regwatch-dev \
  --image regwatchdevacr.azurecr.io/regwatch-web:TAG
```

### Generar JWT dev token

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'dev-user', tenantId: '00000000-0000-0000-0000-000000000001', role: 'ADMIN' },
  'regwatch-prod-jwt-2026-secure-key',
  { expiresIn: '365d' }
);
console.log(token);
"
```

**IMPORTANTE**: El `tenantId` DEBE ser UUID válido (`00000000-0000-0000-0000-000000000001`).
Usar strings como `"gt-global"` crashea Prisma porque el campo es tipo UUID en PostgreSQL.

### Gotchas de deploy — CRÍTICO

1. **Dockerfile production DEBE usar `node:20-alpine`** (no Debian). Alpine usa ~100MB vs ~400MB de Debian. Con Debian el container se queda sin memoria.

2. **OpenSSL en Alpine**: El stage production necesita `apk add --no-cache openssl`. Sin esto Prisma no puede cargar `libquery_engine-linux-musl-openssl-3.0.x.so.node`.

3. **CORS**: Configurado como `CORS_ORIGIN=*` en env vars del container. NO usar CORS del ingress de Azure (conflicto con middleware Express).

4. **Redis deshabilitado**: `REDIS_URL` vacío. Redis de Azure genera timeouts de 12+ segundos que bloquean el event loop de Node.js y matan el container.

5. **Neo4j deshabilitado**: `NEO4J_URI` y `NEO4J_PASSWORD` removidos. No está provisionado en Azure. Si se configura sin que exista, el driver intenta reconectar indefinidamente y consume recursos.

6. **Container resources**: API necesita mínimo `2.0 CPU / 4Gi RAM` para ser estable. Con 0.5 CPU crashea después del primer query Prisma.

7. **NEXT_PUBLIC_* son build-time**: Variables `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_DEV_TOKEN` se embeben en el JS durante `next build`. Cambiarlas en runtime NO tiene efecto — hay que rebuild la imagen web.

8. **DB tenant_id**: Todos los datos usan tenant `00000000-0000-0000-0000-000000000001`. El JWT dev token DEBE tener este tenantId.

### Env vars del API Container App

```
NODE_ENV=production
PORT=3000
CORS_ORIGIN=*
DATABASE_URL=postgresql://regwatchadmin:<password>@regwatch-postgres-dev.postgres.database.azure.com:5432/regwatch?sslmode=require&connection_limit=5&pool_timeout=10
JWT_SECRET=regwatch-prod-jwt-2026-secure-key
AZURE_OPENAI_ENDPOINT=<endpoint>
AZURE_OPENAI_API_KEY=<key>
AZURE_SEARCH_ENDPOINT=<endpoint>
AZURE_SEARCH_API_KEY=<key>
# REDIS_URL= (vacío — deshabilitado)
# NEO4J_URI= (removido — no provisionado)
```

## Referencia

- @docs/architecture.md — diagrama Mermaid completo
- @docs/openapi.yaml — spec completa de endpoints
- @infra/README.md — guía de deploy en Azure
