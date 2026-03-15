---
name: azure-deployment
description: >
  Patrones de deploy de RegWatch AI en Azure. Usar cuando se trabaje en: Bicep templates,
  Azure Container Apps (api, web, ingestion-scheduler), CI/CD con GitHub Actions,
  Dockerfiles multi-stage, configuración de Key Vault references, Application Insights
  custom metrics, o cualquier infraestructura de Azure del proyecto.
---

# Azure Deployment — Patrones de RegWatch AI

## Recursos Azure del proyecto

| Servicio | Tier | Uso |
|---------|------|-----|
| Azure OpenAI | Standard | GPT-4o + text-embedding-3-large |
| Azure AI Search | Standard S1 | Hybrid vector+BM25 |
| Azure Cache for Redis | Basic C1 | Embeddings cache (24h) + RAG cache (1h) |
| Azure Container Apps | Consumption | API (1-5 replicas), Web (1-3 replicas) |
| Azure Database PostgreSQL | Flexible Server | Audit trail, clientes, alertas |
| Azure Service Bus | Standard | Queues: regulatory-changes, notifications |
| Azure Key Vault | Standard | Todos los secrets y connection strings |
| Azure Application Insights | — | Métricas custom + alertas |
| Azure Container Registry | Basic | Imágenes Docker |
| Azure Communication Services | — | Email de alertas |

## Container Apps — configuración

```bicep
// regwatch-api
resource apiApp 'Microsoft.App/containerApps@2023-05-01' = {
  properties: {
    configuration: {
      ingress: { external: true, targetPort: 3000 }
      secrets: [/* referencias a Key Vault */]
    }
    template: {
      scale: { minReplicas: 1, maxReplicas: 5 }
      containers: [{
        resources: { cpu: '1.0', memory: '2Gi' }
        probes: [{ type: 'liveness', httpGet: { path: '/api/health', port: 3000 } }]
      }]
    }
  }
}

// regwatch-web
resource webApp 'Microsoft.App/containerApps@2023-05-01' = {
  properties: {
    template: {
      scale: { minReplicas: 1, maxReplicas: 3 }
      containers: [{ resources: { cpu: '0.5', memory: '1Gi' } }]
    }
  }
}

// ingestion-scheduler (Container Apps Job)
resource schedulerJob 'Microsoft.App/jobs@2023-05-01' = {
  properties: {
    configuration: {
      triggerType: 'Schedule'
      scheduleTriggerConfig: { cronExpression: '*/10 * * * *' } // cada 10 min
    }
    template: {
      containers: [{
        command: ['node', 'dist/jobs/scheduler.js']
        // usa la misma imagen que regwatch-api
      }]
    }
  }
}
```

## Dockerfiles multi-stage

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
HEALTHCHECK CMD curl -f http://localhost:3000/api/health || exit 1
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

## GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test

  build-push:
    needs: test
    steps:
      - uses: azure/login@v1
        with: { creds: '${{ secrets.AZURE_CREDENTIALS }}' }
      - run: az acr login --name ${{ vars.ACR_NAME }}
      - run: |
          docker build -t $ACR/regwatch-api:$SHA apps/api
          docker build -t $ACR/regwatch-web:$SHA apps/web
          docker push $ACR/regwatch-api:$SHA
          docker push $ACR/regwatch-web:$SHA

  deploy:
    needs: build-push
    steps:
      - run: |
          az containerapp update -n regwatch-api -g $RG \
            --image $ACR/regwatch-api:$SHA
          az containerapp update -n regwatch-web -g $RG \
            --image $ACR/regwatch-web:$SHA
```

Target: push → deploy en < 8 minutos.

## Métricas custom de Application Insights

```typescript
// apps/api/src/monitoring/metrics.ts
import { TelemetryClient } from 'applicationinsights';

const client = new TelemetryClient(process.env.APPINSIGHTS_CONNECTION_STRING);

export const metrics = {
  documentIngested: (source: string) =>
    client.trackMetric({ name: 'documents_ingested',
      value: 1, properties: { source } }),

  changeDetected: (impactLevel: string) =>
    client.trackMetric({ name: 'changes_detected',
      value: 1, properties: { impactLevel } }),

  alertGenerated: (severity: string, channel: string) =>
    client.trackMetric({ name: 'alerts_generated',
      value: 1, properties: { severity, channel } }),

  ragQuery: (result: 'success' | 'insufficient_data' | 'error', latencyMs: number) => {
    client.trackMetric({ name: 'rag_queries', value: 1, properties: { result } });
    client.trackMetric({ name: 'rag_latency_ms', value: latencyMs });
  },

  cacheHit: (type: 'embedding' | 'rag', hit: boolean) =>
    client.trackMetric({ name: 'cache_hit_rate',
      value: hit ? 1 : 0, properties: { type } }),

  hitlPending: (count: number) =>
    client.trackMetric({ name: 'hitl_pending', value: count }),
};
```

**Alert rule:** si `rag_latency_ms` p95 > 5000ms → notificar en Teams/email.

## Variables de entorno en Key Vault

```
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
AZURE_SEARCH_ENDPOINT
AZURE_SEARCH_KEY
REDIS_CONNECTION_STRING
POSTGRES_CONNECTION_STRING
NEO4J_URI
NEO4J_USER
NEO4J_PASSWORD
SERVICE_BUS_CONNECTION_STRING
COMMUNICATION_SERVICES_CONNECTION_STRING
APPINSIGHTS_CONNECTION_STRING
JWT_SECRET
```

Todas se inyectan como Key Vault references en Container Apps — NUNCA hardcodeadas.

## Health check endpoint

```typescript
// GET /api/health
app.get('/api/health', async (req, res) => {
  const checks = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    neo4j.verifyConnectivity(),
    redis.ping(),
  ]);

  const healthy = checks.every(c => c.status === 'fulfilled');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    checks: { postgres: checks[0].status, neo4j: checks[1].status, redis: checks[2].status }
  });
});
```
