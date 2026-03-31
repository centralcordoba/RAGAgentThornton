---
name: deploy
description: >
  Deploy manual de RegWatch AI a Azure Container Apps.
  Usar cuando el usuario pida desplegar, deployar, subir a Azure, o actualizar la app en produccion/staging.
  Ejecuta build Docker → push ACR → update Container Apps → verificacion e2e.
user_invocable: true
---

# Deploy RegWatch AI a Azure

## Configuracion actual

| Recurso | Valor |
|---------|-------|
| ACR | `regwatchdevacr.azurecr.io` |
| Resource Group | `rg-regwatch-dev` |
| API Container App | `regwatch-api-dev` |
| Web Container App | `regwatch-web-dev` |
| API URL | `https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io` |
| Web URL | `https://regwatch-web-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io` |
| DB Tenant ID | `00000000-0000-0000-0000-000000000001` |
| JWT Secret | `regwatch-prod-jwt-2026-secure-key` |
| API CPU/RAM | `2.0 CPU / 4Gi RAM` (minimo para estabilidad) |

## Pasos de deploy

Ejecutar en este orden exacto:

### 1. Login ACR

```bash
az acr login --name regwatchdevacr
```

### 2. Generar JWT dev token

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'dev-user', tenantId: '00000000-0000-0000-0000-000000000001', role: 'ADMIN' },
  'regwatch-prod-jwt-2026-secure-key',
  { expiresIn: '365d' }
);
console.log(token);
"
```

**CRITICO**: tenantId DEBE ser UUID `00000000-0000-0000-0000-000000000001`. Strings como "gt-global" crashean Prisma.

### 3. Build images (en paralelo)

```bash
IMAGE_TAG=$(git rev-parse --short HEAD)

# API — SIEMPRE usar Alpine, nunca Debian
docker build --target production \
  -f apps/api/Dockerfile \
  -t regwatchdevacr.azurecr.io/regwatch-api:$IMAGE_TAG .

# Web — NEXT_PUBLIC_* se embeben en build time
docker build --target production \
  --build-arg NEXT_PUBLIC_API_URL=https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io \
  --build-arg NEXT_PUBLIC_DEV_TOKEN=<TOKEN_DEL_PASO_2> \
  -f apps/web/Dockerfile \
  -t regwatchdevacr.azurecr.io/regwatch-web:$IMAGE_TAG .
```

### 4. Push images

```bash
docker push regwatchdevacr.azurecr.io/regwatch-api:$IMAGE_TAG
docker push regwatchdevacr.azurecr.io/regwatch-web:$IMAGE_TAG
```

Si da `authentication required`, re-ejecutar `az acr login --name regwatchdevacr`.

### 5. Deploy API

```bash
az containerapp update -n regwatch-api-dev -g rg-regwatch-dev \
  --image regwatchdevacr.azurecr.io/regwatch-api:$IMAGE_TAG \
  --revision-suffix "v$(date +%s)"
```

### 6. Deploy Web

```bash
az containerapp update -n regwatch-web-dev -g rg-regwatch-dev \
  --image regwatchdevacr.azurecr.io/regwatch-web:$IMAGE_TAG \
  --revision-suffix "v$(date +%s)"
```

### 7. Verificacion e2e (OBLIGATORIA)

Esperar ~50 segundos y verificar TODOS estos endpoints:

```bash
# Health
curl -m 15 -s https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io/api/health

# Regulations (con auth)
curl -m 15 -s -w "\nHTTP: %{http_code}" \
  -H "Authorization: Bearer <TOKEN>" \
  "https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io/api/regulations?pageSize=1"

# Clients (con auth)
curl -m 15 -s -w "\nHTTP: %{http_code}" \
  -H "Authorization: Bearer <TOKEN>" \
  "https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io/api/clients?pageSize=1"

# Alerts (con auth)
curl -m 15 -s -w "\nHTTP: %{http_code}" \
  -H "Authorization: Bearer <TOKEN>" \
  "https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io/api/alerts?pageSize=1"

# CORS headers
curl -m 15 -v \
  -H "Origin: https://regwatch-web-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io" \
  "https://regwatch-api-dev.nicewave-a8f04a91.eastus.azurecontainerapps.io/api/health" \
  2>&1 | grep "access-control"
```

Solo reportar deploy exitoso si TODOS los endpoints responden 200 y CORS headers estan presentes.

## Gotchas — leer ANTES de deployar

1. **Alpine, no Debian**: El Dockerfile production DEBE usar `node:20-alpine`. Debian consume 4x mas memoria y crashea el container.

2. **OpenSSL en Alpine**: El stage production necesita `apk add --no-cache openssl`. Sin esto Prisma no puede cargar el query engine.

3. **CORS**: Configurado como `CORS_ORIGIN=*` en env vars. NO usar CORS del ingress de Azure Container Apps (conflicto con middleware Express — se cancelan mutuamente).

4. **Redis deshabilitado**: `REDIS_URL` debe estar vacio o no seteado. Redis de Azure genera timeouts de 12+ segundos que bloquean el event loop y matan el container.

5. **Neo4j deshabilitado**: `NEO4J_URI` y `NEO4J_PASSWORD` deben estar removidos. No esta provisionado en Azure.

6. **Container resources**: API necesita minimo `2.0 CPU / 4Gi RAM`. Con menos crashea despues del primer query Prisma.

7. **NEXT_PUBLIC_* son build-time**: Cambiar `NEXT_PUBLIC_API_URL` o `NEXT_PUBLIC_DEV_TOKEN` en runtime NO tiene efecto. Hay que rebuild la imagen web.

8. **tenantId debe ser UUID**: El JWT DEBE tener `tenantId: "00000000-0000-0000-0000-000000000001"`. Strings no-UUID crashean Prisma al hacer WHERE en campos UUID.

9. **connection_limit**: Usar `connection_limit=5&pool_timeout=10` en DATABASE_URL. PostgreSQL Burstable B2s tiene max 50 conexiones.

10. **ACR token expira**: Si el push falla con `authentication required`, re-ejecutar `az acr login`.

## Env vars del API (referencia)

```
NODE_ENV=production
PORT=3000
CORS_ORIGIN=*
DATABASE_URL=postgresql://regwatchadmin:<pass>@regwatch-postgres-dev.postgres.database.azure.com:5432/regwatch?sslmode=require&connection_limit=5&pool_timeout=10
JWT_SECRET=regwatch-prod-jwt-2026-secure-key
AZURE_OPENAI_ENDPOINT=<endpoint>
AZURE_OPENAI_API_KEY=<key>
AZURE_SEARCH_ENDPOINT=<endpoint>
AZURE_SEARCH_API_KEY=<key>
```

## Troubleshooting

| Sintoma | Causa | Fix |
|---------|-------|-----|
| 502 Bad Gateway | Container crasheado | Verificar logs: `az containerapp logs show -n regwatch-api-dev -g rg-regwatch-dev --type system --tail 10` |
| CORS error en browser | CORS headers faltantes | Verificar `CORS_ORIGIN=*` en env vars, NO usar Azure ingress CORS |
| 401 Unauthorized | Token invalido o expirado | Regenerar JWT con tenantId UUID correcto |
| Container crash loop | Redis/Neo4j timeouts | Verificar que REDIS_URL y NEO4J_URI estan vacios |
| Prisma crash "invalid UUID" | tenantId no es UUID | Regenerar JWT con `00000000-0000-0000-0000-000000000001` |
| `libssl.so.1.1 not found` | OpenSSL no instalado en Alpine | Agregar `apk add --no-cache openssl` al Dockerfile production stage |
| Health OK pero endpoints 503 | OOM kill por pocos recursos | Subir a 2 CPU / 4Gi RAM |
