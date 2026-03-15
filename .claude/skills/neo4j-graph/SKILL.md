---
name: neo4j-graph
description: >
  Patrones de Neo4j y Cypher para el knowledge graph de ComplianceGraph en RegWatch AI.
  Usar cuando se trabaje en: schema de nodos y relaciones, queries Cypher de obligaciones,
  onboarding engine que genera ComplianceMap, actualización del grafo cuando llegan
  nuevos cambios regulatorios, o el ComplianceAgent de LangChain.
---

# Neo4j / ComplianceGraph — Patrones de RegWatch AI

## Schema de nodos

```cypher
-- Constraints (crear al inicializar)
CREATE CONSTRAINT FOR (j:Jurisdiction) REQUIRE j.id IS UNIQUE;
CREATE CONSTRAINT FOR (o:Obligation) REQUIRE o.id IS UNIQUE;
CREATE CONSTRAINT FOR (c:CompanyType) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT FOR (r:Regulator) REQUIRE r.id IS UNIQUE;
CREATE CONSTRAINT FOR (rc:RegulatoryChange) REQUIRE rc.id IS UNIQUE;
```

## Propiedades de cada nodo

```typescript
interface JurisdictionNode {
  id: string;          // 'AR', 'BR', 'MX', 'ES', 'USA'
  country: string;
  region: string;      // 'LATAM', 'EU', 'NA'
  regulatoryBody: string;
  language: string;
}

interface ObligationNode {
  id: string;
  title: string;
  area: 'fiscal' | 'labor' | 'corporate' | 'securities';
  frequency: 'annual' | 'quarterly' | 'monthly' | 'ad_hoc';
  description: string;
  nextDueDate?: string;  // ISO date
}

interface CompanyTypeNode {
  id: string;
  name: string;         // 'SA', 'SRL', 'Inc', etc.
  sector: string;
  requiresAudit: boolean;
}
```

## Relaciones del grafo

```
(Jurisdiction)-[:HAS_OBLIGATION]->(Obligation)
(CompanyType)-[:SUBJECT_TO]->(Obligation)
(Obligation)-[:HAS_DEADLINE]->(Deadline)
(Obligation)-[:REGULATED_BY]->(Regulator)
(RegulatoryChange)-[:MODIFIES]->(Obligation)
(Client)-[:OPERATES_IN]->(Jurisdiction)
(Client)-[:IS_TYPE]->(CompanyType)
```

## Queries Cypher más usados

### Obtener todas las obligaciones de un cliente

```cypher
MATCH (j:Jurisdiction {country: $country})
  -[:HAS_OBLIGATION]->(o:Obligation)
  <-[:SUBJECT_TO]-(ct:CompanyType {name: $companyType})
MATCH (o)-[:HAS_DEADLINE]->(d:Deadline)
MATCH (o)-[:REGULATED_BY]->(r:Regulator)
OPTIONAL MATCH (rc:RegulatoryChange)-[:MODIFIES]->(o)
RETURN j, o, d, r, collect(rc) as recentChanges
ORDER BY d.nextDueDate ASC
```

### Encontrar clientes afectados por un cambio regulatorio

```cypher
MATCH (rc:RegulatoryChange {id: $changeId})-[:MODIFIES]->(o:Obligation)
MATCH (ct:CompanyType)-[:SUBJECT_TO]->(o)
MATCH (j:Jurisdiction)-[:HAS_OBLIGATION]->(o)
MATCH (client:Client)-[:IS_TYPE]->(ct)
MATCH (client)-[:OPERATES_IN]->(j)
RETURN DISTINCT client
```

### Deadlines próximos en N días

```cypher
MATCH (o:Obligation)-[:HAS_DEADLINE]->(d:Deadline)
WHERE d.nextDueDate <= date() + duration({days: $days})
MATCH (ct:CompanyType)-[:SUBJECT_TO]->(o)
MATCH (j:Jurisdiction)-[:HAS_OBLIGATION]->(o)
RETURN o, d, j, ct
ORDER BY d.nextDueDate ASC
```

### Actualizar grafo cuando llega un cambio regulatorio

```cypher
MERGE (rc:RegulatoryChange {id: $changeId})
SET rc.title = $title,
    rc.effectiveDate = $effectiveDate,
    rc.impactLevel = $impactLevel,
    rc.updatedAt = datetime()

WITH rc
MATCH (o:Obligation {id: $obligationId})
MERGE (rc)-[:MODIFIES]->(o)
```

## ComplianceMap output structure

```typescript
interface ComplianceMap {
  client: Client;
  generatedAt: string;           // ISO datetime
  countries: CountryCompliance[];
  executiveSummary: {
    es: string;                  // resumen en español
    en: string;                  // resumen en inglés
  };
  immediateActions: string[];    // acciones para los próximos 30 días
  timeline: TimelineItem[];      // próximos 12 meses
}

interface CountryCompliance {
  country: string;
  riskScore: number;             // 0-100
  obligations: ObligationDetail[];
  criticalDeadlines: Deadline[]; // vencen en < 30 días
  recentChanges: RegulatoryChange[];
}
```

## OnboardingEngine — flujo

```typescript
async generateComplianceMap(input: NewClientInput): Promise<ComplianceMap> {
  // 1. Para cada país: query Neo4j + query AI Search en paralelo
  const [graphData, ragData] = await Promise.all([
    this.graphService.getClientObligations(input),
    this.ragEngine.getRecentChanges(input.countries, { lastDays: 180 }),
  ]);

  // 2. Combinar y clasificar por urgencia
  const obligations = this.mergeAndClassify(graphData, ragData);
  const critical = obligations.filter(o => o.daysUntilDeadline < 30);

  // 3. Generar resumen con Azure OpenAI
  const summary = await this.ragEngine.generateExecutiveSummary(obligations);

  return { client, generatedAt, countries, executiveSummary: summary, ... };
}
```

## ComplianceAgent (LangChain ReAct)

```typescript
const tools = [
  new Tool({
    name: 'searchRegulations',
    description: 'Busca cambios regulatorios en Azure AI Search. Input: { query, country?, area? }',
    func: (input) => ragEngine.query(input.query, input.filters),
  }),
  new Tool({
    name: 'queryGraph',
    description: 'Ejecuta queries Cypher en Neo4j. Input: { clientId?, country?, area? }',
    func: (input) => graphService.getClientObligations(input),
  }),
  new Tool({
    name: 'getClientContext',
    description: 'Recupera perfil completo de un cliente. Input: { clientId }',
    func: (input) => clientService.getById(input.clientId),
  }),
];

// El agente responde preguntas como:
// "¿Qué obligaciones tiene Acme Corp en Brasil este trimestre?"
// "¿Hay cambios recientes en MiFID II que afecten a clientes europeos?"
// "¿Cuál es el calendario de compliance para el onboarding de XYZ?"
```

## Seed data MVP (5 países)

Ejecutar `npm run seed:graph` para cargar:
- Argentina (AR): SA, SRL, Sucursal — 5 fiscal + 3 labor + 2 corporate
- Brasil (BR): SA, Ltda — 5 fiscal + 3 labor + 2 corporate
- México (MX): SA de CV, SAPI — 5 fiscal + 3 labor + 2 corporate
- España (ES): SA, SL — 5 fiscal + 3 labor + 2 corporate
- USA: Corp, LLC — 5 fiscal + 3 labor + 2 corporate
