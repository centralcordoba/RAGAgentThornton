# RegWatch AI — Azure Infrastructure

## Prerequisites

- Azure CLI >= 2.60
- Bicep CLI (bundled with Azure CLI)
- An Azure subscription with Owner or Contributor role
- A resource group created: `az group create -n rg-regwatch-dev -l eastus2`

## Deploy

```bash
# Validate
az bicep build -f infra/main.bicep

# Deploy dev
az deployment group create \
  -g rg-regwatch-dev \
  -f infra/main.bicep \
  -p infra/main.parameters.json \
  -p pgAdminPassword='<secure-password>'

# Deploy prod
az deployment group create \
  -g rg-regwatch-prod \
  -f infra/main.bicep \
  -p baseName=regwatch environment=prod \
  -p pgAdminLogin=regwatchadmin pgAdminPassword='<secure-password>'
```

## Resources provisioned

| Resource | Name pattern | Purpose |
|----------|-------------|---------|
| Azure OpenAI | `oai-regwatch-{env}` | GPT-4o + text-embedding-3-large |
| Azure AI Search | `srch-regwatch-{env}` | Hybrid vector + BM25 search |
| Azure Cache for Redis | `redis-regwatch-{env}` | RAG cache, embeddings cache, throttling |
| PostgreSQL Flexible | `pg-regwatch-{env}` | Relational data, Prisma ORM |
| Azure Service Bus | `sb-regwatch-{env}` | Queues: regulatory-changes, alert-review. Topic: ingestion-events |
| Key Vault | `kv-{unique}` | All secrets and connection strings |
| Application Insights | `ai-regwatch-{env}` | Monitoring, logs, custom metrics |
| Container Registry | `acr{unique}` | Docker images |
| Container Apps Env | `cae-regwatch-{env}` | Serverless container hosting |
| Container App (API) | `ca-api-regwatch-{env}` | Express API with KEDA scaling |
| Container App (Web) | `ca-web-regwatch-{env}` | Next.js frontend |

## Scaling

- **API**: min 1 (dev) / 2 (prod), max 3 (dev) / 10 (prod)
  - HTTP: scales at 50 concurrent requests
  - Service Bus: scales at 10 queued messages
- **Web**: min 1, max 2 (dev) / 5 (prod)

## Secrets in Key Vault

All connection strings are stored as Key Vault secrets and referenced by Container Apps via managed identity (system-assigned). No secrets in environment variables.
