---
description: Entrevista técnica para especificar una nueva feature de RegWatch AI antes de implementar
allowed-tools: Read
---

Quiero agregar esta feature a RegWatch AI: $ARGUMENTS

Antes de generar cualquier código, entrevistame en detalle sobre:

**Dominio:**
- ¿Afecta el pipeline de ingestion? ¿Qué fuentes regulatorias?
- ¿Necesita cambios en el knowledge graph de Neo4j?
- ¿Genera o modifica alertas? ¿Hay lógica HITL nueva?

**Técnico:**
- ¿Nuevo endpoint en la API? ¿Cómo se integra con el OpenAPI spec?
- ¿Requiere cambios en el RAG engine o en el sistema prompt?
- ¿Necesita cache Redis nuevo? ¿Qué TTL?
- ¿Cómo afecta los costos de Azure OpenAI?

**Edge cases:**
- ¿Qué pasa si Azure OpenAI tiene rate limiting?
- ¿Qué pasa si el confidence < 0.5?
- ¿Cómo se maneja en el audit trail?

**Priorización:**
- ¿Es parte del MVP o es post-MVP?
- ¿Qué parte del master build prompt (Fases 1-6) es la correcta para implementarla?

No me hagas preguntas obvias. Dig into los hard parts que quizás no consideré.

Cuando tengamos todo claro, escribí la spec en `docs/specs/$(date +%Y%m%d)-$ARGUMENTS.md`.
