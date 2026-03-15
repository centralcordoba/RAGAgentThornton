---
name: rag-pipeline
description: >
  Patrones de implementación del pipeline RAG de RegWatch AI usando Azure OpenAI
  y Azure AI Search. Usar cuando se trabaje en: ingestion de documentos regulatorios,
  generación de embeddings, hybrid search, cache Redis de embeddings o queries,
  sistema prompt del LLM, o cualquier parte del RAGEngine y DocumentIndexer.
---

# RAG Pipeline — Patrones de RegWatch AI

## Flujo obligatorio (SIEMPRE en este orden)

```
1. Verificar Redis cache (key: rag:hash(question+filters), TTL 1h)
2. Si cache miss → HybridSearch en Azure AI Search
3. Llamar Azure OpenAI
4. Si confidence < 0.5 → retornar "insufficient data"
5. Cachear resultado en Redis
```

## Sistema prompt del LLM (usar VERBATIM — no modificar)

```
SYSTEM: Eres un analista de compliance regulatorio especializado.

Reglas:
- Solo responde usando los documentos provistos como contexto.
- Cita fuentes usando [doc_id] inline en tu respuesta.
- Si la información no está disponible, responde exactamente: 'insufficient data'.
- Nunca inventes regulaciones, fechas, o montos de multa.

Formato de respuesta requerido (SIEMPRE este formato exacto):
Answer: <tu respuesta con [doc_id] citations inline>
Sources: [lista de doc_ids usados]
Confidence: <0.0 a 1.0>
Reasoning: <pasos de razonamiento step by step>
Impacted obligations: <lista de obligaciones afectadas>
```

## Parámetros Azure OpenAI (nunca cambiar)

```typescript
const completion = await openAIClient.getChatCompletions(deployment, messages, {
  maxTokens: 1500,      // FIJO — control de costos
  temperature: 0.2,     // FIJO — respuestas conservadoras y consistentes
});
```

## Parámetros Azure AI Search (nunca cambiar)

```typescript
const searchOptions: SearchOptions = {
  vectorSearchOptions: {
    queries: [{
      kind: 'vector',
      vector: embedding,
      fields: ['contentVector'],
      kNearestNeighborsCount: 5,
    }],
  },
  semanticSearchOptions: { configurationName: 'regulatory-semantic' },
  queryType: 'semantic',
  top: 5,
  // Híbrido: el SDK combina vector + keyword internamente
  // vectorWeight: 0.7, keywordWeight: 0.3 se configura en el índice
};
```

## Redis cache keys y TTL

| Tipo | Key pattern | TTL |
|------|-------------|-----|
| Embeddings | `emb:sha256(text)` | 24h |
| RAG results | `rag:sha256(question+filtersJSON)` | 1h |
| Regulations | `reg:${id}` | 6h |

```typescript
// SIEMPRE verificar antes de llamar a Azure OpenAI
const cacheKey = `emb:${sha256(text)}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const embedding = await generateEmbedding(text);
await redis.setex(cacheKey, 86400, JSON.stringify(embedding)); // 24h
return embedding;
```

## Formato de respuesta RAGResponse

```typescript
interface RAGResponse {
  answer: string;                    // con [doc_id] citations
  sources: string[];                 // lista de doc_ids usados
  confidence: number;                // 0.0 a 1.0
  reasoning: string;                 // pasos de razonamiento
  impactedObligations: string[];     // obligaciones afectadas
  cached: boolean;                   // si vino de cache
  latencyMs: number;                 // duración total
}
```

## Índice de Azure AI Search

Campos requeridos del índice `regulatory-changes`:
- `id` (key), `title`, `content`, `summary`
- `country`, `jurisdiction`, `area` (fiscal|labor|corporate|securities)
- `impactLevel` (HIGH|MEDIUM|LOW), `effectiveDate`, `sourceUrl`
- `contentVector` (1536 dims — text-embedding-3-large)
- Semantic config: titleField=title, contentFields=[content, summary]

## Checklist antes de hacer PR

- [ ] Verifico cache antes de cada llamada a Azure OpenAI
- [ ] Sistema prompt NO fue modificado
- [ ] max_tokens=1500 y temperature=0.2
- [ ] confidence < 0.5 retorna "insufficient data" (no una respuesta inventada)
- [ ] Respuesta incluye sources[], confidence, reasoning, impactedObligations[]
- [ ] Latencia logueada en Application Insights (rag_latency_ms)
