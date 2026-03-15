# RegWatch AI — Demo Script (10 minutos)

## Audiencia
Partners y directores de Grant Thornton LATAM/Global.

## Setup previo
- Demo seed ejecutado (`npx tsx scripts/demo-seed.ts`)
- 3 clients cargados: FinanceCorp, EuroTrade, TechStart
- 2 alertas HIGH pendientes de review (HITL)
- 1 deadline venciendo en 7 dias
- Chat listo con Azure OpenAI activo

---

## 00:00–01:00 — El problema

> "Hoy, un profesional de GT que asesora a un cliente multinacional necesita
> monitorear regulaciones en 5 o mas paises manualmente. Revisa 15 sitios web
> distintos, compara cambios en PDFs, y depende de su memoria para saber
> que afecta a cada cliente.
>
> Si se pierde un cambio regulatorio critico, GT esta expuesto a riesgo
> reputacional y legal. Y el cliente no se entera hasta que es demasiado tarde."

*Mostrar: pantalla en blanco o lista manual de URLs de reguladores.*

---

## 01:00–03:00 — Global Dashboard (wow moment)

**Abrir /dashboard**

> "RegWatch AI monitorea automaticamente 7 fuentes regulatorias en 5 paises
> en tiempo real."

Senalar:
- **Mapa**: paises coloreados por riesgo. Argentina en rojo (72), Espana en verde (28).
  - Click en Argentina: 5 clientes, 4 alertas abiertas, cambio AFIP reciente.
- **KPI cards**: 24 clientes, 18 alertas (3 HIGH), 42 cambios en 7 dias.
- **Feed en vivo**: mostrar el indicador "En vivo" verde.
  - Senalar la alerta AFIP RG 5616 con badge HIGH.

> "Todo esto se actualiza automaticamente. SEC EDGAR cada 10 minutos,
> EUR-Lex y BOE cada hora, DOF Mexico cada dia."

---

## 03:00–05:00 — Flujo de alerta inteligente (HITL)

**Navegar a /alerts**

> "Cuando se detecta un cambio de alto impacto, no se envia directamente al
> cliente. Primero pasa por revision de un profesional de GT."

Senalar:
- 2 alertas PENDING_REVIEW (AFIP + DORA) con badge amarillo.
- Explicar: "El sistema uso IA para analizar el impacto, pero GT tiene la
  ultima palabra."

**Click "Aprobar" en la alerta AFIP:**

> "Solo roles PROFESSIONAL y ADMIN pueden aprobar. Un CLIENT_VIEWER no ve
> este boton."

Mostrar:
- Status cambia a APPROVED.
- Audit trail registrado.
- Alerta se envia por email (Azure Communication Services) + Teams (Adaptive Card).

> "Si nadie revisa en 2 horas, el sistema escala automaticamente al manager."

---

## 05:00–07:00 — Onboarding de nuevo cliente

**Navegar a /onboarding**

> "Imaginen que firma un nuevo cliente multinacional. En vez de semanas
> de analisis manual, RegWatch genera el mapa de compliance en segundos."

**Step 1**: Llenar "NuevaCorp S.A.", Financial Institution, banking + securities.

**Step 2**: Seleccionar Argentina + Brasil + Mexico en el mapa.
- Mostrar la animacion de seleccion en el SVG.

**Step 3**: Animacion de analisis.
- Senalar los 6 pasos: "Esta consultando Neo4j para obligaciones,
  Azure AI Search para cambios recientes, y GPT-4o para el resumen ejecutivo."

**Step 4**: Resultado.
- **Stats**: 28 obligaciones, 5 criticas.
- **Risk por pais**: scores circulares.
- **Tab Obligaciones**: tabla con deadlines y badges de urgencia.
- **Tab Resumen**: toggle espanol/ingles.
- **Tab Acciones**: checklist priorizado.

> "En 30 segundos, el profesional de GT tiene un mapa completo de compliance
> listo para presentar al cliente."

---

## 07:00–09:00 — Chat conversacional

**Abrir el chat (boton en header)**

Preguntar: *"Que regulaciones de la SEC afectan a TechStart Inc en derivados?"*

Mostrar:
- Streaming de la respuesta (cursor pulsante).
- Respuesta con [doc-1] [doc-2] como inline badges.
- Source chips expandibles: click muestra titulo, score, link a SEC.gov.
- Confidence score (85%).
- Tools used: searchRegulations, getObligations.

> "El agente combina busqueda semantica en Azure AI Search con el grafo
> de conocimiento en Neo4j. No inventa: si no encuentra datos, dice
> 'insufficient data'."

Segunda pregunta: *"Cuales son los deadlines criticos de FinanceCorp este mes?"*

> "Ahora usa la herramienta getDeadlines del grafo. Cambia automaticamente
> de estrategia segun la pregunta."

---

## 09:00–10:00 — Arquitectura y cierre

Mostrar diagrama (docs/architecture.md o slide):

> "Todo corre en Azure, el stack de GT:
> - Azure OpenAI para el analisis inteligente
> - Azure AI Search para busqueda hibrida (semantica + keyword)
> - Neo4j como grafo de conocimiento regulatorio
> - Azure Container Apps con auto-scaling
> - Todos los secretos en Key Vault, logs en Application Insights
>
> Es complementario a CompliAI: CompliAI automatiza el flujo del auditor,
> RegWatch monitorea las regulaciones que alimentan ese flujo.
>
> Estamos listos para produccion. El MVP cubre 5 paises y 50 obligaciones.
> Phase 2 agrega feeds de datos licenciados. Phase 3 es rollout global GT."

**Cierre:**
> "RegWatch AI transforma el monitoreo regulatorio de reactivo a proactivo.
> GT no solo asesora sobre compliance — ahora lo anticipa."
