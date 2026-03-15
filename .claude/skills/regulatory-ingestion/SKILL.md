---
name: regulatory-ingestion
description: >
  Patrones de implementación para los connectors de ingestion regulatoria de RegWatch AI.
  Usar cuando se trabaje en: BaseIngestionJob, connectors específicos (SEC EDGAR,
  EUR-Lex, BOE España, DOF México, DOU Brasil, Infoleg Argentina, CMF Chile),
  detección de cambios semánticos, clasificación de impacto, o el scheduler de Azure Functions.
---

# Regulatory Ingestion — Patrones de RegWatch AI

## Arquitectura base

```
BaseIngestionJob (abstract)
├── SecEdgarConnector      — cada 10 min
├── EurLexConnector        — cada hora
├── BoeSpainConnector      — cada hora
├── DofMexicoConnector     — diario 6am UTC (Playwright + Document Intelligence)
├── DouBrasilConnector     — diario 6am UTC (scraping)
├── InfolegalArgConnector  — diario 6am UTC
└── CmfChileConnector      — diario 6am UTC
```

## Rate limits por fuente (CRÍTICO)

| Fuente | Límite | Estrategia |
|--------|--------|-----------|
| SEC EDGAR | 10 req/s | Exponential backoff + cola |
| EUR-Lex | Sin límite documentado | Rate limit preventivo: 2 req/s |
| BOE España | Sin API oficial | Scraping respetuoso: 1 req/s |
| DOF México | Sin API | Playwright headless + delay |

```typescript
// SIEMPRE para SEC EDGAR
const edgar = new SecEdgarConnector({
  maxRequestsPerSecond: 10,
  backoffConfig: {
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    multiplier: 2,
    maxAttempts: 5,
  }
});
```

## Detección de cambios semánticos

```typescript
// Un documento es CAMBIO si cosine similarity con versión anterior < 0.92
async detectChanges(current: ParsedRegulation, previous?: ParsedRegulation): Promise<boolean> {
  if (!previous) return true; // documento nuevo = siempre cambio

  const [embCurrent, embPrevious] = await Promise.all([
    this.getOrGenerateEmbedding(current.content),
    this.getOrGenerateEmbedding(previous.content),
  ]);

  const similarity = cosineSimilarity(embCurrent, embPrevious);
  return similarity < 0.92; // umbral fijo — no cambiar sin validación
}
```

## Clasificación de impacto

```typescript
// HIGH: cambio en fechas críticas, multas, nuevos requisitos OBLIGATORIOS
// MEDIUM: modificación de procedimientos existentes
// LOW: correcciones tipográficas, aclaraciones menores

classifyImpact(change: ParsedRegulation): 'HIGH' | 'MEDIUM' | 'LOW' {
  const HIGH_KEYWORDS = ['multa', 'sanción', 'obligatorio', 'plazo', 'deadline',
    'penalty', 'mandatory', 'required', 'effective date'];
  const LOW_KEYWORDS = ['corrección', 'typo', 'clarificación', 'note', 'clarification'];

  const text = change.content.toLowerCase();
  if (HIGH_KEYWORDS.some(k => text.includes(k))) return 'HIGH';
  if (LOW_KEYWORDS.some(k => text.includes(k))) return 'LOW';
  return 'MEDIUM';
}
```

## Idempotencia — CRÍTICO

```typescript
// Clave única global para todo documento
const idempotencyKey = `${source}:${documentId}:${version}`;

// Verificar ANTES de procesar
const exists = await db.regulatoryDocument.findFirst({
  where: { idempotencyKey }
});

if (exists) {
  logger.info({ service: 'ingestion', operation: 'skip', reason: 'duplicate',
    idempotencyKey, documentId });
  return; // skip silencioso — NO lanzar error
}
```

## Endpoints por fuente

| Conector | URL | Autenticación |
|---------|-----|--------------|
| SEC EDGAR | `https://data.sec.gov/submissions/` | Sin auth |
| EUR-Lex RSS | `https://eur-lex.europa.eu/tools/rss.do?type=LEGISLATION` | Sin auth |
| BOE España | `https://www.boe.es/rss/BOE.xml` | Sin auth |
| DOF México | `https://www.dof.gob.mx` | Scraping (Playwright) |
| Infoleg Argentina | `https://servicios.infoleg.gob.ar/api/...` | API pública |
| CMF Chile | `https://api.cmfchile.cl/...` | API pública |

## Scheduler — frecuencias fijas

```typescript
// Azure Functions timer triggers — NO cambiar sin aprobación
export const schedulerConfig = {
  secEdgar:    '*/10 * * * *',   // cada 10 minutos
  eurLex:      '0 * * * *',      // cada hora
  boeSpain:    '0 * * * *',      // cada hora
  latamDaily:  '0 6 * * *',      // 6am UTC diario (DOF, DOU, Infoleg, CMF)
};
```

## Publicar a Service Bus después de detectar cambio

```typescript
await serviceBusClient
  .createSender('regulatory-changes')
  .sendMessages({
    body: change,
    contentType: 'application/json',
    messageId: idempotencyKey,      // deduplicación en Service Bus
    label: change.impactLevel,
  });
```

## Logs requeridos en cada operación

```typescript
logger.info({
  service: 'ingestion',
  source: 'SEC_EDGAR',           // SIEMPRE el nombre del conector
  operation: 'fetch',
  documentsFetched: 12,
  changesDetected: 3,
  duration: 340,                 // ms
  result: 'success',
});
```
