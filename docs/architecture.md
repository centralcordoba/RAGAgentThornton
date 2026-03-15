# RegWatch AI — Architecture

## System Overview

RegWatch AI is a regulatory monitoring platform for Grant Thornton built on
Azure-first infrastructure. It ingests regulatory changes from multiple
international sources, analyzes them with AI, maps obligations to clients
via a knowledge graph, and delivers alerts through a Human-in-the-Loop
review process.

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "Clients"
        BROWSER[Browser]
    end

    subgraph "Frontend — Azure Container Apps"
        WEB["Next.js 14<br/>App Router<br/>(ca-web)"]
    end

    subgraph "Backend — Azure Container Apps"
        API["Express API<br/>TypeScript strict<br/>(ca-api)"]
    end

    subgraph "AI & Search"
        AOAI["Azure OpenAI<br/>GPT-4o<br/>text-embedding-3-large"]
        AIS["Azure AI Search<br/>Hybrid Vector+BM25<br/>Semantic Ranker"]
    end

    subgraph "Data Stores"
        PG["PostgreSQL 16<br/>Prisma ORM"]
        NEO4J["Neo4j 5<br/>ComplianceGraph"]
        REDIS["Azure Cache for Redis<br/>RAG · Embeddings · Throttle"]
    end

    subgraph "Messaging"
        SB["Azure Service Bus<br/>Queues + Topics"]
    end

    subgraph "Observability"
        INSIGHTS["Application Insights<br/>+ Log Analytics"]
    end

    subgraph "Security"
        KV["Azure Key Vault"]
    end

    BROWSER -->|HTTPS + JWT| WEB
    WEB -->|REST API| API
    API --> AOAI
    API --> AIS
    API --> PG
    API --> NEO4J
    API --> REDIS
    API --> SB
    API -.->|Secrets| KV
    API -.->|Logs + Metrics| INSIGHTS

    classDef azure fill:#0078d4,stroke:#005a9e,color:#fff
    classDef graph fill:#008cc1,stroke:#006a94,color:#fff
    classDef frontend fill:#10b981,stroke:#059669,color:#fff

    class AOAI,AIS,PG,REDIS,SB,INSIGHTS,KV azure
    class NEO4J graph
    class WEB frontend
```

---

## Flow 1 — Regulatory Ingestion

New regulatory documents are discovered, processed, and indexed.

```mermaid
sequenceDiagram
    autonumber
    participant SCHED as Scheduler<br/>(Azure Functions)
    participant CONN as Connector<br/>(SEC, EUR-Lex, BOE...)
    participant SB as Service Bus<br/>(regulatory-changes)
    participant API as API Server
    participant PG as PostgreSQL
    participant AOAI as Azure OpenAI
    participant AIS as Azure AI Search
    participant NEO4J as Neo4j
    participant TOPIC as Service Bus<br/>(ingestion-events)

    SCHED->>CONN: Trigger scheduled check
    CONN->>CONN: Fetch new documents from source

    loop Each document found
        CONN->>SB: Enqueue IngestionMessage<br/>{source, documentId, version}
    end

    SB->>API: Dequeue message

    API->>PG: Check idempotency<br/>(source + documentId + version)
    alt Already exists
        API-->>API: Skip silently
    else New document
        API->>AOAI: Generate embeddings<br/>(text-embedding-3-large)
        API->>AIS: Index document<br/>(vector + metadata)
        API->>AOAI: Classify impact level<br/>(GPT-4o)
        API->>PG: Store RegulatoryChange<br/>+ AuditEntry(REGULATION_INGESTED)
        API->>NEO4J: Update ComplianceGraph<br/>(REGULATION → JURISDICTION → OBLIGATION)
        API->>TOPIC: Publish ingestion-event<br/>(fan-out to analysis + alerts)
    end
```

**Key rules applied:**
- Idempotency: `source + documentId + version` checked in PostgreSQL before any processing
- SEC EDGAR rate limit: max 10 req/s with exponential backoff via Redis throttle
- Audit trail: every ingested regulation logged as `REGULATION_INGESTED`

---

## Flow 2 — RAG Query (Chat)

User asks a natural language compliance question.

```mermaid
sequenceDiagram
    autonumber
    participant USER as User<br/>(Browser)
    participant WEB as Next.js
    participant API as Express API
    participant REDIS as Redis Cache
    participant AIS as Azure AI Search
    participant AOAI as Azure OpenAI
    participant NEO4J as Neo4j
    participant PG as PostgreSQL

    USER->>WEB: "What SEC regulations affect our derivatives trading?"
    WEB->>API: POST /api/chat<br/>{clientId, message, filters}

    Note over API: Validate JWT → extract tenantId<br/>Mandatory tenant filter applied

    API->>REDIS: GET rag:{hash(question+filters)}
    alt Cache HIT
        REDIS-->>API: Cached ChatResponse
        API-->>WEB: Return cached response<br/>{cached: true}
    else Cache MISS
        API->>AIS: Hybrid Search<br/>vectorWeight=0.7, keywordWeight=0.3<br/>top_k=5, filter: tenantId
        AIS-->>API: Top 5 documents + scores

        API->>NEO4J: Query related obligations<br/>MATCH (c:Client)-[:HAS_OBLIGATION]->(o)<br/>WHERE c.tenantId = $tenantId
        NEO4J-->>API: Related obligations

        API->>AOAI: GPT-4o completion<br/>system prompt + retrieved docs<br/>max_tokens=1500, temperature=0.2
        AOAI-->>API: AI answer + confidence

        Note over API: If confidence < 0.5<br/>→ answer = "insufficient data"

        API->>REDIS: SET rag:{hash} TTL=1h
        API->>PG: AuditEntry(AI_ANALYSIS_GENERATED)
        API-->>WEB: ChatResponse<br/>{analysis, obligations, cached: false}
    end

    WEB-->>USER: Render answer with sources
```

**Key rules applied:**
- Redis cache checked FIRST (key: hash of question + filters, TTL 1h)
- Hybrid search: vector 0.7 + BM25 keyword 0.3, top_k=5
- Azure OpenAI: max_tokens=1500, temperature=0.2
- Confidence < 0.5 → return `"insufficient data"` — never fabricate
- Tenant isolation: all queries filtered by `tenantId` from JWT
- Audit: every AI analysis logged

---

## Flow 3 — Alert Pipeline (HITL)

Regulatory change triggers alert with mandatory Human-in-the-Loop for HIGH impact.

```mermaid
sequenceDiagram
    autonumber
    participant TOPIC as Service Bus<br/>(ingestion-events)
    participant CLASS as ClassificationAgent<br/>(LangChain ReAct)
    participant ALERT as AlertEngine
    participant PG as PostgreSQL
    participant SB as Service Bus<br/>(alert-review)
    participant PRO as GT Professional<br/>(Browser)
    participant NOTIF as NotificationService
    participant ACS as Azure Communication<br/>Services
    participant TEAMS as Teams Webhook
    participant SSE as SSE Channel
    participant CLIENT as Client<br/>(Browser)

    TOPIC->>CLASS: New ingestion event
    CLASS->>CLASS: Analyze impact<br/>(GPT-4o + graph context)
    CLASS->>ALERT: Impact assessment<br/>{level, affectedClients, obligations}

    ALERT->>PG: Create Alert<br/>+ AuditEntry(ALERT_CREATED)

    alt Impact = HIGH
        Note over ALERT,SB: CRITICAL: Human-in-the-Loop<br/>NEVER send directly to client
        ALERT->>SB: Enqueue AlertReviewMessage<br/>(alert-review queue)
        SB->>PRO: Alert appears in review panel
        PRO->>ALERT: POST /api/alerts/{id}/ack<br/>(role: PROFESSIONAL required)
        ALERT->>PG: Update status → APPROVED<br/>+ AuditEntry(ALERT_APPROVED)
        ALERT->>NOTIF: Deliver approved alert
    else Impact = MEDIUM or LOW
        ALERT->>NOTIF: Deliver directly
    end

    par Notification channels
        NOTIF->>ACS: Send email
        NOTIF->>PG: AuditEntry(ALERT_SENT)
    and
        NOTIF->>TEAMS: Post Adaptive Card
    and
        NOTIF->>SSE: Push real-time event
        SSE->>CLIENT: Alert appears in dashboard
    end

    CLIENT->>ALERT: POST /api/alerts/{id}/ack
    ALERT->>PG: Status → ACKNOWLEDGED<br/>+ AuditEntry(ALERT_ACKNOWLEDGED)
```

**Key rules applied:**
- HIGH impact → mandatory GT Professional review before client notification
- Alert status machine: `PENDING_REVIEW → APPROVED → SENT → ACKNOWLEDGED`
- HITL approval requires role `PROFESSIONAL` — enforced by RBAC middleware
- Three notification channels: Email (Azure Communication Services), Teams (Adaptive Cards), SSE (in-app)
- Full audit trail: ALERT_CREATED → ALERT_APPROVED → ALERT_SENT → ALERT_ACKNOWLEDGED

---

## Knowledge Graph — ComplianceGraph (Neo4j)

```mermaid
graph LR
    subgraph "ComplianceGraph Schema"
        REG((REGULATION))
        JUR((JURISDICTION))
        IND((INDUSTRY))
        CT((COMPANY_TYPE))
        OBL((OBLIGATION))
        DL((DEADLINE))
        REGR((REGULATOR))

        REGR -->|PUBLISHES| REG
        REG -->|APPLIES_TO| JUR
        REG -->|AFFECTS| IND
        JUR -->|REQUIRES| OBL
        OBL -->|HAS_DEADLINE| DL
        OBL -->|APPLIES_TO| CT
        IND -->|REGULATED_BY| REGR
    end

    style REG fill:#e74c3c,stroke:#c0392b,color:#fff
    style JUR fill:#3498db,stroke:#2980b9,color:#fff
    style IND fill:#2ecc71,stroke:#27ae60,color:#fff
    style CT fill:#9b59b6,stroke:#8e44ad,color:#fff
    style OBL fill:#f39c12,stroke:#d68910,color:#fff
    style DL fill:#e67e22,stroke:#d35400,color:#fff
    style REGR fill:#1abc9c,stroke:#16a085,color:#fff
```

### Node types

| Node | Key Properties | Example |
|------|---------------|---------|
| `REGULATOR` | name, country, website | SEC (US), CNBV (MX), CVM (BR) |
| `REGULATION` | title, sourceId, impactLevel, effectiveDate | "SEC Rule 10b-5 Amendment" |
| `JURISDICTION` | code (ISO 3166), name, region | US, BR, ES, MX, AR, CL |
| `INDUSTRY` | name, sectorCode | Banking, Insurance, Securities |
| `COMPANY_TYPE` | name | Public Company, Financial Institution |
| `OBLIGATION` | title, status, deadline, priority | "File quarterly derivatives report" |
| `DEADLINE` | date, type (hard/soft), penaltyInfo | 2026-06-30, hard, "$50K/day fine" |

### Key relationships

| Relationship | From → To | Purpose |
|-------------|-----------|---------|
| `PUBLISHES` | Regulator → Regulation | Track origin of regulatory changes |
| `APPLIES_TO` | Regulation → Jurisdiction | Geographic scope |
| `AFFECTS` | Regulation → Industry | Industry impact mapping |
| `REQUIRES` | Jurisdiction → Obligation | What must be done where |
| `HAS_DEADLINE` | Obligation → Deadline | Time constraints |
| `APPLIES_TO` | Obligation → CompanyType | Who must comply |
| `REGULATED_BY` | Industry → Regulator | Oversight mapping |

### Onboarding query (ComplianceMap generation)

When a new client is created, the onboarding service builds their
ComplianceMap by traversing the graph:

```cypher
// Find all obligations for a client based on their countries + industries
MATCH (j:JURISDICTION)<-[:APPLIES_TO]-(r:REGULATION)-[:AFFECTS]->(i:INDUSTRY)
WHERE j.code IN $clientCountries
  AND i.name IN $clientIndustries
WITH r, j
MATCH (j)-[:REQUIRES]->(o:OBLIGATION)-[:APPLIES_TO]->(ct:COMPANY_TYPE)
WHERE ct.name = $clientCompanyType
RETURN o, r, j
```

---

## Data Lineage

Full traceability from source document to client alert:

```
Regulatory Source → RegulatoryChange → AIAnalysis → Obligation → Client → Alert
         │                  │                │            │           │
         └── AuditEntry ────┴── AuditEntry ──┴─ AuditEntry┴─ AuditEntry
             (INGESTED)        (ANALYSIS)       (CREATED)    (SENT/ACK)
```

---

## Security Architecture

```mermaid
graph TB
    subgraph "Client Request"
        REQ[HTTPS Request + JWT]
    end

    subgraph "API Gateway"
        AUTH[Auth Middleware<br/>JWT Verification]
        RBAC[RBAC Guard<br/>Role Check]
        TENANT[Tenant Filter<br/>Auto-inject tenantId]
        RATE[Rate Limiter<br/>Per-tenant + global]
    end

    subgraph "Data Access"
        PG[PostgreSQL<br/>Row-level tenantId]
        AIS[AI Search<br/>Filter: tenantId]
        NEO4J[Neo4j<br/>WHERE tenantId]
        REDIS[Redis<br/>Key prefix: tenantId]
    end

    subgraph "Secrets"
        KV[Key Vault<br/>Managed Identity]
    end

    subgraph "Logging"
        PINO[pino logger<br/>redact: auth, PII]
        AI[Application Insights<br/>RBAC-restricted]
    end

    REQ --> AUTH --> RBAC --> TENANT --> RATE
    RATE --> PG & AIS & NEO4J & REDIS
    AUTH -.->|Secrets| KV
    RATE -.->|Structured logs| PINO --> AI

    classDef security fill:#e74c3c,stroke:#c0392b,color:#fff
    class AUTH,RBAC,TENANT,RATE,KV security
```

**Tenant isolation enforced at every layer:**

| Layer | Mechanism |
|-------|-----------|
| API Middleware | JWT `tenantId` claim auto-injected into all queries |
| PostgreSQL | `WHERE tenant_id = $tenantId` on every query (Prisma middleware) |
| AI Search | `$filter=tenantId eq '{tenantId}'` on every search |
| Neo4j | `WHERE n.tenantId = $tenantId` on every Cypher query |
| Redis | Key prefix `{tenantId}:rag:...` |
| Logs | pino redact: `authorization`, `apiKey`, `password`, `token`, `email` |

---

## Infrastructure (Azure)

| Resource | Service | SKU (dev/prod) | Purpose |
|----------|---------|----------------|---------|
| `oai-regwatch-*` | Azure OpenAI | S0 | GPT-4o (30K TPM) + embeddings (120K TPM) |
| `srch-regwatch-*` | Azure AI Search | Basic / Standard | Hybrid vector + BM25 |
| `redis-regwatch-*` | Azure Cache for Redis | Basic C1 / Standard C2 | RAG cache, embeddings, throttle |
| `pg-regwatch-*` | PostgreSQL Flexible | B1ms / D2ds_v4 | Relational data, Prisma |
| `sb-regwatch-*` | Azure Service Bus | Standard | Queues + topics for async |
| `kv-*` | Key Vault | Standard | All secrets |
| `ai-regwatch-*` | Application Insights | Per-GB | Monitoring + logs |
| `acr*` | Container Registry | Basic / Standard | Docker images |
| `cae-regwatch-*` | Container Apps Env | Consumption | Serverless containers |
| `ca-api-*` | Container App | 0.5 CPU / 1Gi | API with KEDA scaling |
| `ca-web-*` | Container App | 0.25 CPU / 0.5Gi | Next.js frontend |
