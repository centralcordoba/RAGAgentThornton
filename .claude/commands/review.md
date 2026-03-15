---
description: Code review completo con foco en patrones de RegWatch AI — error handling, logging, seguridad, cache Redis y reglas del dominio
allowed-tools: Read, Grep, Glob, Bash
---

Hacé un code review completo del siguiente archivo o PR: $ARGUMENTS

Revisá ESPECÍFICAMENTE estos puntos en orden:

## 1. Error handling
- ¿Usa AppError class centralizada o tira raw `throw new Error()`?
- ¿Todo error incluye `requestId`?
- ¿Formato correcto: `{ code, message, requestId, details? }`?

## 2. Logging (pino)
- ¿Todo log incluye `service`, `operation`, `requestId`, `duration`, `result`?
- ¿Hay datos sensibles de clientes en los logs?

## 3. TypeScript
- ¿Hay algún `any` o cast sin justificación?
- ¿Las interfaces están completas?
- ¿Los retornos de funciones están tipados?

## 4. RAG / AI
- ¿Verifica Redis cache ANTES de llamar a Azure OpenAI?
- ¿max_tokens=1500 y temperature=0.2?
- ¿Maneja el caso confidence < 0.5 con "insufficient data"?
- ¿La respuesta AI incluye sources[], confidence, reasoning, impactedObligations[]?

## 5. Ingestion
- ¿Implementa idempotencia (source + documentId + version)?
- ¿Respeta rate limits de SEC EDGAR (max 10 req/s)?
- ¿Tiene exponential backoff?

## 6. Alertas HITL
- ¿Las alertas HIGH pasan por revisión de GT Professional?
- ¿Se loguean todos los eventos de audit trail?
- ¿Hay rate limiting (max 3 alertas/cliente/hora)?

## 7. Seguridad
- ¿Hay secretos hardcodeados?
- ¿Los endpoints tienen authMiddleware + rbacMiddleware?
- ¿Los logs de clientes están sanitizados?

## 8. Tests
- ¿Hay tests para los happy path y casos de error?
- ¿Los mocks de Azure OpenAI y AI Search están bien configurados?

---
Para cada issue encontrado, mostrá:
- Línea o función específica
- Por qué es un problema
- Cómo corregirlo (con código si es necesario)

Terminá con un resumen: APROBADO / APROBADO CON CAMBIOS MENORES / REQUIERE CAMBIOS.
