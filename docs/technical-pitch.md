# RegWatch AI — Technical Pitch for Grant Thornton

## 1. Por que Azure (cero friccion de integracion)

GT es partner estrategico oficial de Microsoft. Usar Azure no es una decision
tecnica — es alineamiento estrategico.

| Aspecto | Beneficio para GT |
|---------|-------------------|
| Azure OpenAI | Mismo modelo GPT-4o que usa CompliAI. Una sola relacion con Microsoft. Datos nunca salen de la region de Azure del cliente |
| Azure AD / Entra ID | SSO con las credenciales GT existentes. Sin crear cuentas nuevas |
| Azure Container Apps | Deploy sin gestionar Kubernetes. Auto-scaling incluido |
| Application Insights | Mismo panel de monitoreo que el equipo DevOps ya conoce |
| Key Vault | Cumple con las politicas de seguridad existentes de GT |
| Compliance certs | Azure SOC 2, ISO 27001, GDPR — GT ya tiene estos audits aprobados |

**Costo estimado mensual (produccion):**

| Recurso | SKU | Costo estimado USD/mes |
|---------|-----|----------------------|
| Azure OpenAI | GPT-4o 30K TPM + embeddings 120K TPM | ~$800 |
| Azure AI Search | Standard S1 | ~$250 |
| Azure Cache for Redis | Standard C2 | ~$160 |
| PostgreSQL Flexible | D2ds_v4 | ~$130 |
| Azure Service Bus | Standard | ~$10 |
| Container Apps (API) | 2 replicas, 0.5 CPU / 1GB | ~$60 |
| Container Apps (Web) | 1 replica, 0.25 CPU / 0.5GB | ~$15 |
| Application Insights | Per-GB ingestion | ~$25 |
| Container Registry | Standard | ~$5 |
| Key Vault | Standard | ~$1 |
| **Total** | | **~$1,456/mes** |

Costo por cliente (24 clientes): ~$60/mes/cliente.
A escala (100 clientes): ~$25/mes/cliente (Redis cache + AOAI amortizado).

## 2. Complementa CompliAI (no lo reemplaza)

```
CompliAI (GT interno)          RegWatch AI (nuevo)
========================       ========================
Automatiza flujo del auditor   Monitorea regulaciones externas
Trabaja con datos internos     Ingesta datos publicos (SEC, BOE...)
Enfocado en engagement actual  Enfocado en cambios futuros
No monitorea cambios           Detecta cambios proactivamente
Reacciona                      Anticipa

              RegWatch AI ---alimenta---> CompliAI
              (nuevas regulaciones)       (workflow del auditor)
```

**Integracion futura**: cuando RegWatch detecta un cambio que afecta a un
engagement activo, puede crear automaticamente una tarea en CompliAI.

## 3. Seguridad y compliance de la solucion

### Tenant isolation (multi-cliente)
- `tenantId` obligatorio en TODA query: PostgreSQL, AI Search, Neo4j, Redis
- Middleware que auto-inyecta el filtro — imposible olvidarlo
- Row-level security en PostgreSQL
- Tests de integracion que validan que un tenant NUNCA ve datos de otro

### Datos sensibles
- Secretos SOLO en Key Vault (nunca env vars directas)
- pino logger con `redact`: authorization, apiKey, password, token, email
- Application Insights con RBAC restrictivo
- Logs no contienen PII de clientes

### LLM safety (critico para compliance)
- System prompt hardcoded: "Nunca inventes regulaciones, fechas, o montos"
- Confidence threshold: < 0.5 retorna "insufficient data"
- Grounding check: toda regulacion citada debe existir en AI Search
- Prompt injection mitigation: input sanitization + delimiter hardening

### Human-in-the-Loop (diferenciador clave)
- Alertas HIGH requieren aprobacion de GT Professional ANTES de llegar al cliente
- RBAC: solo roles PROFESSIONAL y ADMIN pueden aprobar
- Escalacion automatica a manager si no se revisa en 2 horas
- Audit trail completo: REGULATION_INGESTED > AI_ANALYSIS_GENERATED > ALERT_CREATED > ALERT_APPROVED > ALERT_SENT > ALERT_ACKNOWLEDGED

## 4. Human-in-the-Loop como diferenciador

La mayoria de soluciones AI de compliance son "fire and forget": la IA genera
una alerta y se envia automaticamente al cliente.

**Problema**: una IA que le dice a un cliente de audit que tiene una nueva
obligacion regulatoria — sin revision humana — es un riesgo reputacional
enorme para una firma de auditoria.

**RegWatch AI garantiza:**
1. Toda alerta HIGH pasa por revision de un profesional de GT
2. El profesional puede editar, rechazar, o escalar antes de enviar
3. Si nadie revisa en 2h, escala automaticamente
4. El cliente NUNCA recibe informacion no verificada

Esto posiciona a GT como "AI-augmented, human-verified" — el punto
optimo entre eficiencia y responsabilidad profesional.

## 5. Roadmap

### Phase 1 — MVP (actual)
- 5 paises: Argentina, Brasil, Mexico, Espana, USA + EU
- 7 fuentes regulatorias (SEC EDGAR, EUR-Lex, BOE, DOF + 3 mas)
- 50 obligaciones base en el knowledge graph
- 3 canales de notificacion (email, Teams, in-app)
- Chat conversacional con RAG + grafo
- Onboarding wizard con ComplianceMap automatico

### Phase 2 — Data feeds licenciados (Q3 2026)
- Integracion con Thomson Reuters Regulatory Intelligence
- Integracion con LexisNexis Regulatory Compliance
- Expansion a 15 paises (LATAM completo + UK, Alemania, Singapur)
- API publica para integracion con CompliAI
- Multi-language NLP (portugues, aleman, chino simplificado)

### Phase 3 — GT-wide rollout (Q1 2027)
- 150+ paises (cobertura global GT)
- Prediccion de riesgo regulatorio (ML custom en Azure ML)
- Integracion nativa con CompliAI bidireccional
- White-label para clientes enterprise de GT
- SLA 99.9% con support tier dedicado

## 6. Metricas de exito (KPIs)

| Metrica | Target MVP | Target Phase 2 |
|---------|-----------|-----------------|
| Tiempo de deteccion de cambio | < 1 hora | < 15 minutos |
| Cobertura de fuentes por pais | 1-2 fuentes | 3-5 fuentes |
| Precision de clasificacion de impacto | > 80% | > 90% |
| Tiempo de onboarding de cliente | < 5 minutos | < 2 minutos |
| RAG response latency p95 | < 5 segundos | < 3 segundos |
| Cache hit rate | > 60% | > 75% |
| HITL review time (promedio) | < 2 horas | < 1 hora |
| Clientes activos | 10 | 50 |

## 7. Equipo necesario

| Rol | Dedicacion | Responsabilidad |
|-----|-----------|-----------------|
| AI Engineer (lead) | Full-time | RAG pipeline, agentes, prompt engineering |
| Full-stack Developer | Full-time | API, frontend, integraciones |
| DevOps / Cloud | Part-time | Azure infra, CI/CD, monitoring |
| Domain Expert (GT) | Part-time | Validacion de obligaciones, seed data, QA regulatorio |
| Product Owner (GT) | Part-time | Prioridades, feedback de clientes, roadmap |
