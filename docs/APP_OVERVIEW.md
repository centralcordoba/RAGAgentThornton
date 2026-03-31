# RegWatch AI — Documentacion Completa

## Que es RegWatch AI

RegWatch AI es una plataforma de monitoreo regulatorio internacional desarrollada para **Grant Thornton**. Automatiza la recopilacion, analisis e interpretacion de cambios regulatorios en multiples paises, reemplazando un proceso que hoy se hace manualmente y que implica alto riesgo de incumplimiento.

Grant Thornton opera en 150+ paises. Cada uno tiene entornos fiscales, laborales y regulatorios distintos. RegWatch AI centraliza todo en un solo lugar.

---

## Vision de Negocio

### Problema

Los equipos de GT recopilan manualmente regulaciones de 7+ paises, interpretan su impacto para cada cliente, actualizan plazos y generan alertas. Esto consume cientos de horas, genera errores y expone a riesgos de incumplimiento cuando un cambio de ultima hora pasa desapercibido.

### Solucion

RegWatch AI:

1. **Monitorea automaticamente** fuentes regulatorias oficiales (SEC, EUR-Lex, BOE, DOF, DOU, Infoleg, MAS) cada 10-60 minutos
2. **Analiza con IA** el impacto de cada cambio usando Azure OpenAI GPT-4o
3. **Mapea obligaciones** a clientes especificos via un knowledge graph (Neo4j)
4. **Genera alertas inteligentes** con revision humana obligatoria para impacto alto (HITL)
5. **Ofrece un dashboard global** con mapas de riesgo, calendario de plazos y chat de compliance

### Usuarios

| Rol | Que hace en la plataforma |
|-----|---------------------------|
| **GT Professional** | Revisa alertas HIGH antes de enviarlas al cliente. Analiza impacto regulatorio. Gestiona onboarding. |
| **Client Viewer** | Ve su dashboard de compliance, recibe alertas, consulta regulaciones via chat. |
| **Admin** | Configura fuentes de ingestion, gestiona usuarios, ve metricas globales. |

### Valor diferencial

- **Complementario a CompliAI** (herramienta interna de GT para auditoria): RegWatch AI monitorea regulaciones externas, CompliAI automatiza flujos internos del auditor
- **Azure-first**: GT es partner estrategico de Microsoft. Toda la infraestructura corre en Azure
- **Multi-jurisdiccion**: Cobertura simultanea en US, EU, ES, BR, AR, MX, SG, CL

---

## Arquitectura General

```
                    ┌──────────────────────────┐
                    │      Browser (Web)       │
                    │  Next.js 14 App Router   │
                    └────────────┬─────────────┘
                                 │ HTTPS + JWT
                                 ▼
                    ┌──────────────────────────┐
                    │      Express API         │
                    │   TypeScript strict      │
                    ├──────────────────────────┤
                    │ Middleware:              │
                    │  Auth → RBAC → Tenant   │
                    │  Rate Limit → Logging   │
                    ├──────────────────────────┤
                    │ Services:               │
                    │  AlertEngine            │
                    │  OnboardingEngine       │
                    │  SummaryGenerator       │
                    │  NotificationRouter     │
                    ├──────────────────────────┤
                    │ AI:                     │
                    │  RegulatoryRAG          │
                    │  ComplianceAgent        │
                    │  ImpactAnalyzerAgent    │
                    └──┬───┬───┬───┬───┬──────┘
                       │   │   │   │   │
          ┌────────────┘   │   │   │   └────────────┐
          ▼                ▼   ▼   ▼                ▼
    ┌──────────┐  ┌──────┐ ┌─────┐ ┌───────┐  ┌──────────┐
    │PostgreSQL│  │Neo4j │ │Redis│ │Service│  │Azure     │
    │          │  │      │ │     │ │Bus    │  │OpenAI    │
    │Clientes  │  │Graph │ │Cache│ │Queues │  │GPT-4o    │
    │Alertas   │  │Oblig.│ │RAG  │ │alerts │  │Embeddings│
    │Regs      │  │Juris.│ │Emb. │ │changes│  │AI Search │
    └──────────┘  └──────┘ └─────┘ └───────┘  └──────────┘
```

### Stack tecnologico

| Capa | Tecnologia |
|------|------------|
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
| Infra | Docker + Azure Container Apps |
| AI Agents | LangChain.js ReAct |

---

## Funcionalidades — Vista Funcional

### 1. Dashboard Global

**Ruta**: `/dashboard`

Vista panoramica del estado regulatorio global. Muestra:

- **KPIs**: regulaciones monitoreadas, alertas activas, clientes, score promedio de cumplimiento
- **Mapa mundial**: riesgo regulatorio por pais (coloreado por nivel)
- **Cambios recientes**: ultimas regulaciones detectadas con nivel de impacto
- **Metricas globales**: tendencias de cumplimiento

### 2. Monitoreo de Regulaciones

**Ruta**: `/regulations`

Feed en tiempo real de cambios regulatorios detectados por los conectores de ingestion.

- Filtros por pais (US, AR, BR, EU, SG), area regulatoria, nivel de impacto y rango de fechas
- Busqueda full-text por titulo, contenido y regulador
- Vista detalle con analisis AI: resumen, confianza, obligaciones impactadas, fuentes
- Exportacion individual a PDF

**Fuentes activas**:
| Fuente | Pais | Metodo | Frecuencia |
|--------|------|--------|------------|
| SEC EDGAR | US | REST API | Cada 10 min |
| EUR-Lex | EU | REST API | Cada hora |
| BOE | ES | XML/RSS | Cada hora |
| DOF Mexico | MX | RSS | Diario |
| DOU Brasil | BR | RSS | Diario |
| Infoleg Argentina | AR | REST API | Diario |
| MAS Singapore | SG | REST API | Diario |

### 3. Gestion de Clientes

**Ruta**: `/clients`, `/clients/[id]`

Cada cliente tiene:
- **Dashboard individual**: compliance score (0-100%), obligaciones por estado, alertas pendientes, deadlines proximos
- **ComplianceMap**: generado automaticamente en onboarding — mapea jurisdicciones + industrias → obligaciones
- **Grafo visual**: visualizacion del knowledge graph de obligaciones (Neo4j)
- **Tendencia**: evolucion del score de cumplimiento mes a mes

### 4. Sistema de Alertas (HITL)

**Ruta**: `/alerts`

Flujo completo de alertas con Human-in-the-Loop:

```
Cambio regulatorio detectado
        │
        ▼
   AlertEngine analiza impacto
        │
        ├── HIGH impact ──→ Cola de revision ──→ GT Professional aprueba ──→ Notificar cliente
        │
        ├── MEDIUM impact ──→ Notificacion directa (Teams + Email)
        │
        └── LOW impact ──→ Notificacion in-app (SSE)
```

**Estados**: `PENDING_REVIEW → APPROVED → SENT → ACKNOWLEDGED`

**Canales de notificacion**:
- Email (Azure Communication Services)
- Microsoft Teams (Adaptive Cards via webhook)
- In-app (Server-Sent Events en tiempo real)

**Regla critica**: Alertas HIGH **nunca** se envian directamente al cliente sin revision humana.

### 5. Chat de Compliance (RAG)

**Disponible globalmente** (panel lateral en cualquier pagina)

El usuario hace preguntas en lenguaje natural como:
- "Que regulaciones de la SEC afectan nuestro trading de derivados?"
- "Cuales son los plazos de cumplimiento DORA para Q2 2026?"

**Pipeline RAG**:
1. Verificar cache Redis (hash de pregunta + filtros, TTL 1h)
2. Si miss: busqueda hibrida en Azure AI Search (vector 70% + BM25 30%, top 5)
3. Consultar obligaciones relacionadas en Neo4j
4. Azure OpenAI GPT-4o genera respuesta (max 1500 tokens, temperature 0.2)
5. Si confidence < 0.5 → devuelve "insufficient data" (nunca fabrica)
6. Cachear resultado en Redis

**Para preguntas complejas**: se activa el ComplianceAgent (LangChain ReAct) que puede hacer multiples pasos combinando busqueda, grafo y analisis.

### 6. Analisis de Impacto

**Ruta**: `/impact`

- **Heatmap interactivo**: matriz paises × areas regulatorias con scores de riesgo (0-100)
- **Timeline**: linea temporal de cambios agrupados por semana y jurisdiccion
- **Analisis AI** (streaming): el ImpactAnalyzerAgent ejecuta un analisis multi-paso con razonamiento visible:
  1. Busca regulaciones relacionadas
  2. Compara versiones (diff)
  3. Consulta clientes afectados
  4. Calcula severidad
  5. Genera recomendaciones

### 7. Horizon Scanning

**Ruta**: `/horizon`

Monitorea regulaciones **propuestas** que aun no estan vigentes:

- Etapas: PROPOSED → COMMENT_PERIOD → FINAL_RULE → EFFECTIVE
- Probabilidad de aprobacion estimada por IA
- Deadlines de periodo de comentarios
- Filtros por pais y etapa

### 8. Calendario de Cumplimiento

**Ruta**: `/calendar`

- Vista mensual, semanal, anual y lista
- Deadlines de obligaciones con estado (pendiente, en progreso, vencido)
- KPIs: vencidos, vencen esta semana, vencen este mes
- Exportacion a iCal (.ics)
- Asignacion de responsables

### 9. Mapa de Riesgo

**Ruta**: `/map`

Mapa mundial interactivo con scoring de riesgo por pais:

**Formula de score**: `alertsHigh×10 + alertsMedium×5 + deadlines7d×8 + changes30d×3 + overdueObligations×15`

Niveles: LOW (0-25), MEDIUM (26-50), HIGH (51-75), CRITICAL (76-100)

Click en un pais muestra: alertas recientes, deadlines proximos, cambios regulatorios y clientes afectados.

### 10. Onboarding de Clientes

**Ruta**: `/onboarding`

Flujo paso a paso para registrar un nuevo cliente:

1. **Datos basicos**: nombre, email, tipo de empresa
2. **Paises**: seleccion de jurisdicciones donde opera
3. **Industrias**: sectores regulados aplicables
4. **Analisis AI**: genera automaticamente el ComplianceMap consultando Neo4j + AI Search
5. **Resultado**: resumen ejecutivo (ES + EN), acciones inmediatas, timeline 12 meses

### 11. Generador de Reportes

**Ruta**: `/reports`

6 plantillas de reportes con datos reales de la API:

| Plantilla | Descripcion | Endpoints que consulta |
|-----------|-------------|----------------------|
| Estado de Cumplimiento por Pais | Score, obligaciones por cliente y pais | `/api/clients` + `/api/clients/{id}/dashboard` |
| Cambios Regulatorios del Periodo | Listado con impacto y areas | `/api/regulations` |
| Evaluacion de Riesgo | Heatmap + risk scores | `/api/impact/heatmap` + `/api/map/risk-scores` |
| Tracker de Obligaciones | Deadlines y estados | `/api/calendar/events` + `/api/calendar/summary` |
| Reporte de Onboarding | ComplianceMap de un cliente | `/api/clients/{id}/dashboard` + `/api/clients/{id}/graph` |
| Resumen de Alertas | Consolidado por estado e impacto | `/api/alerts` |

Genera HTML con estilo Grant Thornton para imprimir a PDF.

### 12. Gestion de Fuentes

**Ruta**: `/sources` (solo Admin)

- CRUD de fuentes regulatorias
- Test de conexion con preview de documentos
- Trigger manual de ingestion con streaming SSE del progreso
- Estado de cada fuente (OK / WARNING / ERROR)
- Frecuencia configurable

---

## Modelo de Datos

### Entidades principales

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────┐
│ RegulatorySource│────▶│ RegulatoryChange │◀────│ Obligation    │
│                 │  1:N│                  │ 1:N │               │
│ name            │     │ title            │     │ title         │
│ country         │     │ summary          │     │ deadline      │
│ connectorType   │     │ impactLevel      │     │ status        │
│ frequency       │     │ country          │     │ priority      │
│ status          │     │ effectiveDate    │     │ assignedTo    │
└─────────────────┘     │ affectedAreas[]  │     │ clientId      │
                        └────────┬─────────┘     └───────┬───────┘
                                 │ 1:N                    │ N:1
                                 ▼                        ▼
                        ┌────────────────┐       ┌───────────────┐
                        │ Alert          │       │ Client        │
                        │                │       │               │
                        │ message        │       │ name          │
                        │ channel        │       │ countries[]   │
                        │ status         │       │ industries[]  │
                        │ impactLevel    │       │ companyType   │
                        │ reviewedBy     │       │ tenantId      │
                        └────────────────┘       └───────────────┘
```

### Multi-tenancy

Todos los datos estan aislados por `tenantId` (UUID). Cada query incluye filtro de tenant extraido automaticamente del JWT. Esto se aplica en:
- PostgreSQL: WHERE tenant_id
- AI Search: $filter=tenantId
- Neo4j: WHERE n.tenantId
- Redis: key prefix {tenantId}:

### Audit Trail

Toda accion critica genera un registro inmutable:
- `REGULATION_INGESTED` — nueva regulacion detectada
- `AI_ANALYSIS_GENERATED` — analisis de IA generado
- `ALERT_CREATED` — alerta creada
- `ALERT_APPROVED` — alerta aprobada por profesional GT
- `ALERT_SENT` — alerta enviada al cliente
- `ALERT_ACKNOWLEDGED` — cliente reconocio la alerta
- `OBLIGATION_CREATED` / `OBLIGATION_UPDATED`
- `CLIENT_ONBOARDED`

---

## Flujos Criticos

### Flujo 1: Ingestion de Regulaciones

```
Scheduler (cada 10-60 min)
    │
    ▼
Connector (SEC, EUR-Lex, BOE...)
    │ Fetch documentos nuevos
    ▼
Idempotencia check (source + documentId + version)
    │ Si ya existe → skip silencioso
    ▼
Azure OpenAI: generar embeddings
    │
    ▼
Azure AI Search: indexar documento
    │
    ▼
Azure OpenAI: clasificar impacto (HIGH/MEDIUM/LOW)
    │
    ▼
PostgreSQL: guardar RegulatoryChange + AuditEntry
    │
    ▼
Service Bus: publicar evento → AlertEngine
```

### Flujo 2: Pipeline de Alertas

```
Cambio regulatorio publicado en Service Bus
    │
    ▼
AlertEngine.process(change)
    │
    ├── Neo4j: findAffectedClients()
    │
    ├── Por cada cliente afectado:
    │     ├── Verificar duplicado (24h window)
    │     ├── RAG: generar analisis
    │     ├── Formatear mensaje
    │     ├── Determinar canal (EMAIL/TEAMS/SSE)
    │     └── Crear Alert en PostgreSQL
    │
    └── Routing:
          ├── HIGH → Service Bus (alert-review) → HITL
          └── MEDIUM/LOW → Service Bus (notifications) → envio directo
```

### Flujo 3: Chat RAG

```
Usuario pregunta: "Que regulaciones DORA afectan a mi empresa?"
    │
    ▼
Redis cache check (hash de pregunta + filtros)
    │
    ├── HIT → devolver cached
    │
    └── MISS:
          ├── Azure AI Search: hybrid search (vector 70% + BM25 30%)
          │   top_k=5, filter: tenantId
          │
          ├── Neo4j: obligaciones relacionadas del cliente
          │
          ├── Azure OpenAI: GPT-4o completion
          │   temperature=0.2, max_tokens=1500
          │
          ├── Confidence < 0.5? → "insufficient data"
          │
          ├── Redis: cachear resultado (TTL 1h)
          │
          └── AuditEntry: AI_ANALYSIS_GENERATED
```

---

## Knowledge Graph (Neo4j)

El ComplianceGraph mapea la relacion entre regulaciones, jurisdicciones, industrias y obligaciones.

### Nodos

| Tipo | Propiedades | Ejemplo |
|------|-------------|---------|
| REGULATOR | name, country, website | SEC (US), CNBV (MX), CVM (BR) |
| REGULATION | title, impactLevel, effectiveDate | "SEC Rule 10b-5 Amendment" |
| JURISDICTION | code (ISO 3166), name, region | US, BR, ES, MX |
| INDUSTRY | name, sectorCode | Banking, Insurance, Securities |
| COMPANY_TYPE | name | Public Company, Financial Institution |
| OBLIGATION | title, status, deadline, priority | "File quarterly derivatives report" |
| DEADLINE | date, type (hard/soft), penaltyInfo | 2026-06-30, hard, "$50K/day fine" |

### Relaciones

```
REGULATOR ──PUBLISHES──▶ REGULATION
REGULATION ──APPLIES_TO──▶ JURISDICTION
REGULATION ──AFFECTS──▶ INDUSTRY
JURISDICTION ──REQUIRES──▶ OBLIGATION
OBLIGATION ──HAS_DEADLINE──▶ DEADLINE
OBLIGATION ──APPLIES_TO──▶ COMPANY_TYPE
INDUSTRY ──REGULATED_BY──▶ REGULATOR
```

### Query de Onboarding

Cuando se registra un nuevo cliente, el sistema genera su ComplianceMap:

```cypher
MATCH (j:JURISDICTION)<-[:APPLIES_TO]-(r:REGULATION)-[:AFFECTS]->(i:INDUSTRY)
WHERE j.code IN $clientCountries
  AND i.name IN $clientIndustries
WITH r, j
MATCH (j)-[:REQUIRES]->(o:OBLIGATION)-[:APPLIES_TO]->(ct:COMPANY_TYPE)
WHERE ct.name = $clientCompanyType
RETURN o, r, j
```

---

## Seguridad

### Autenticacion y Autorizacion

- **JWT Bearer Token** en todas las requests (excepto `/api/health`)
- Claims: `userId`, `tenantId`, `role`
- Roles: `ADMIN`, `PROFESSIONAL`, `CLIENT_VIEWER`
- RBAC en middleware — cada endpoint verifica permisos

### Aislamiento de Tenant

| Capa | Mecanismo |
|------|-----------|
| API Middleware | tenantId auto-inyectado desde JWT |
| PostgreSQL | WHERE tenant_id = $tenantId en cada query (Prisma middleware) |
| AI Search | $filter=tenantId eq '{tenantId}' |
| Neo4j | WHERE n.tenantId = $tenantId |
| Redis | Key prefix {tenantId}:rag:... |

### Logging Seguro

- pino con redact de: `authorization`, `apiKey`, `password`, `token`, `email`
- Structured logging: service, operation, requestId, duration, result
- Application Insights con RBAC restringido

### LLM Safety

- Nunca fabricar regulaciones, fechas o montos
- Si confidence < 0.5 → retornar "insufficient data"
- Toda respuesta AI incluye: `sources[]`, `confidence`, `reasoning`
- Alertas HIGH requieren revision humana antes de llegar al cliente

---

## API — Endpoints Completos

### Health
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Health check con estado de PostgreSQL, Redis, Neo4j |

### Regulaciones
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/api/regulations` | Si | Listar con filtros (country, area, impactLevel, dateFrom/dateTo) |
| GET | `/api/regulations/:id` | Si | Detalle con analisis AI |

### Clientes
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/api/clients` | Si | Listar clientes del tenant |
| POST | `/api/clients` | Si | Crear cliente + trigger onboarding |
| GET | `/api/clients/:id/dashboard` | Si | Dashboard de compliance (score, obligaciones, alertas) |
| GET | `/api/clients/:id/graph` | Si | Grafo de obligaciones (Neo4j) |
| DELETE | `/api/clients/:id` | Si | Soft-delete |

### Alertas
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/api/alerts` | Si | Listar con filtros (status, impactLevel, channel) |
| POST | `/api/alerts/:id/ack` | Si | Aprobar (HITL) o reconocer alerta |

### Chat (RAG)
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| POST | `/api/chat` | Si | Pregunta conversacional con streaming SSE |

### Impacto
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/impact/heatmap` | Si | Heatmap jurisdiccion × area |
| GET | `/impact/timeline` | Si | Timeline de cambios por semana |
| GET | `/impact/reports` | Si | Listar reportes de impacto |
| POST | `/impact/analyze/:changeId` | Si | Analisis AI con streaming SSE |
| PATCH | `/impact/reports/:id/approve` | Si | Aprobar reporte |

### Calendario
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/calendar/events` | Si | Listar deadlines |
| GET | `/calendar/summary` | Si | KPIs (vencidos, esta semana, este mes) |
| POST | `/calendar/events` | Si | Crear evento manual |
| GET | `/calendar/export/ical` | Si | Exportar .ics |

### Mapa
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/map/risk-scores` | Si | Risk scores por pais |
| GET | `/map/country/:code/detail` | Si | Detalle de un pais |

### Horizon Scanning
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/horizon` | Si | Regulaciones propuestas |
| GET | `/horizon/summary` | Si | KPIs por etapa y pais |

### Fuentes
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| GET | `/api/sources` | Si | Listar fuentes regulatorias |
| POST | `/api/sources` | Si | Crear fuente |
| POST | `/api/sources/test` | Si | Test de conexion |
| POST | `/api/sources/:id/trigger` | Si | Ingestion manual (SSE) |

### Ingestion
| Metodo | Endpoint | Auth | Descripcion |
|--------|----------|------|-------------|
| POST | `/api/ingest/trigger` | Si | Trigger manual (202 Accepted) |

---

## Infraestructura Azure

| Recurso | Servicio | Proposito |
|---------|----------|-----------|
| `regwatchdevacr` | Container Registry | Imagenes Docker (api + web) |
| `regwatch-api-dev` | Container App | API Express (2 CPU / 4Gi) |
| `regwatch-web-dev` | Container App | Frontend Next.js |
| `regwatch-postgres-dev` | PostgreSQL Flexible | BD relacional (Burstable B2s) |
| `regwatch-redis-dev` | Cache for Redis | Cache RAG + embeddings |
| Azure OpenAI | OpenAI Service | GPT-4o + text-embedding-3-large |
| Azure AI Search | Search Service | Hybrid vector + BM25 |
| Azure Service Bus | Messaging | Colas: regulatory-changes, alert-review |
| Azure Key Vault | Secrets | Connection strings y API keys |
| Application Insights | Monitoring | Logs + metricas custom |

---

## Estructura del Monorepo

```
regwatch-ai/
├── apps/
│   ├── api/                    # Backend Express + TypeScript
│   │   ├── src/
│   │   │   ├── routes/         # 11 route files (clients, alerts, regulations, etc.)
│   │   │   ├── services/       # AlertEngine, OnboardingEngine, NotificationRouter
│   │   │   ├── agents/         # ImpactAnalyzerAgent (LangChain ReAct)
│   │   │   ├── jobs/           # Scheduler + 7 ingestion connectors
│   │   │   ├── graph/          # Neo4j client + ComplianceGraphService
│   │   │   ├── middleware/     # Auth, RBAC, rate limiting, tenant filter
│   │   │   ├── config/         # Logger (pino), environment
│   │   │   └── server.ts       # Entry point
│   │   ├── prisma/             # Schema + migrations
│   │   └── Dockerfile          # Multi-stage (base → deps → builder → dev → prod)
│   │
│   └── web/                    # Frontend Next.js 14
│       ├── app/                # 15 pages (App Router)
│       ├── components/         # 50+ componentes organizados por feature
│       │   ├── ui/             # Sidebar, Header, SplashScreen, Badge, etc.
│       │   ├── regulations/    # RegulationCard, Filters, Detail, Diff
│       │   ├── impact/         # Heatmap, Timeline, Drawer, AgentLog
│       │   ├── calendar/       # MonthView, WeekView, YearView, ListView
│       │   ├── chat/           # ComplianceChat, ChatProvider, SuggestedQuestions
│       │   ├── client/         # AlertsPanel, ObligationGraph, Timeline
│       │   ├── map/            # WorldRiskMap, CountryRiskList, CountryDrawer
│       │   ├── reports/        # ReportGenerator (6 templates con datos reales)
│       │   ├── onboarding/     # Stepper, StepCountries, StepAnalyzing, StepResult
│       │   ├── horizon/        # HorizonPipeline, HorizonCard
│       │   └── sources/        # SourcesPanel, AddSourceForm, TriggerDrawer
│       ├── lib/                # API client, stores (Zustand), hooks
│       └── Dockerfile          # Multi-stage (base → deps → builder → dev → prod)
│
├── packages/
│   ├── shared/                 # Types, Zod schemas, AppError, Result<T>
│   └── ai-core/                # RAG engine, embeddings, Redis cache, ComplianceAgent
│
├── infra/                      # Bicep templates para Azure
├── scripts/                    # Seed data (real regulations, demo clients)
├── docs/                       # Architecture diagrams, OpenAPI spec
├── .claude/skills/             # Skills para Claude Code (deploy, debug, review, etc.)
└── .github/workflows/          # CI/CD pipeline (test → build → deploy)
```

---

## Metricas y Datos Actuales

- **89 regulaciones** indexadas (SEC EDGAR, EUR-Lex, BOE, DOU)
- **7 clientes** registrados con ComplianceMap
- **7 conectores** de ingestion implementados
- **5 jurisdicciones** activas: US, EU, BR, AR, SG
- **6 templates** de reportes funcionales con datos reales

---

## Proximos Pasos (No implementados aun)

- Provisionamiento de Redis y Neo4j en Azure
- CI/CD completo (secrets de Azure en GitHub Actions)
- Multi-tenant billing
- Internacionalizacion avanzada
- Modelos ML custom (actualmente solo Azure OpenAI)
