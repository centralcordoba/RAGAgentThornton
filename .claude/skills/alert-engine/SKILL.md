---
name: alert-engine
description: >
  Patrones del sistema de alertas de RegWatch AI. Usar cuando se trabaje en:
  AlertEngine, AlertFormatter, NotificationService, flujo HITL (Human-in-the-Loop)
  para alertas HIGH, canales de notificación (email Azure Communication Services,
  Teams Adaptive Cards, SSE in-app), deduplicación, escalamiento o rate limiting de alertas.
---

# Alert Engine — Patrones de RegWatch AI

## Flujo principal de AlertEngine

```typescript
// AlertEngine.process — SIEMPRE este orden
async process(change: RegulatoryChange): Promise<Alert[]> {
  // 1. Encontrar clientes afectados via ComplianceGraph
  const affectedClients = await graphService.findAffectedClients(change);

  const alerts: Alert[] = [];
  for (const client of affectedClients) {
    // 2. Generar análisis personalizado con RAG
    const analysis = await ragEngine.generateAnalysis(change, client);

    // 3. Calcular urgencia
    const urgencyScore = calculateUrgency(change.effectiveDate);

    // 4. Deduplicar — no enviar si ya hay alerta en las últimas 24h
    const recentAlert = await db.alert.findFirst({
      where: { clientId: client.id, changeId: change.id,
        sentAt: { gte: new Date(Date.now() - 86400000) } }
    });
    if (recentAlert) continue;

    // 5. Construir alerta con AI Explainability completa
    const alert = AlertFormatter.format(analysis, client, change);
    // alert.regulationRef + alert.reasoningSteps[] + alert.impactedObligations[] → SIEMPRE

    // 6. Persistir
    const saved = await db.alert.create({ data: alert });
    alerts.push(saved);

    // 7. Publicar en Service Bus queue 'notifications'
    await serviceBusClient
      .createSender('notifications')
      .sendMessages({ body: saved, label: change.impactLevel });
  }

  return alerts;
}
```

## HITL (Human-in-the-Loop) — CRÍTICO para alertas HIGH

```
Flujo OBLIGATORIO para alertas HIGH:

AI analysis → GT Professional review → client notification

NUNCA enviar HIGH directamente al cliente.
```

```typescript
// En NotificationRouter.route():
if (alert.severity === 'HIGH') {
  // Guardar como PENDING_REVIEW — no notificar al cliente todavía
  await db.alert.update({
    where: { id: alert.id },
    data: { status: 'PENDING_REVIEW', assignedTo: gtProfessional.id }
  });

  // Notificar SOLO al GT Professional (no al cliente)
  await teamsNotifier.sendHITLRequest(alert, gtProfessional);

  // Programar escalamiento si no hay ACK en 2h
  await scheduleEscalation(alert.id, { delayMs: 7200000 });
  return;
}

// MEDIUM y LOW → notificar directamente al cliente
await notificationService.sendToClient(alert, client);
```

## Rate limiting de alertas

```typescript
// Máximo 3 alertas por cliente por hora
const recentCount = await db.alert.count({
  where: {
    clientId,
    sentAt: { gte: new Date(Date.now() - 3600000) }
  }
});

if (recentCount >= 3) {
  logger.warn({ service: 'alerts', operation: 'rate_limit',
    clientId, reason: 'max_3_per_hour' });
  return; // encolar para después
}
```

## Canales de notificación

### Email (Azure Communication Services)
```typescript
await emailNotifier.send({
  to: client.contactEmail,
  subject: `[RegWatch AI] ${alert.severity}: ${alert.title}`,
  html: renderAlertTemplate(alert), // template HTML con branding GT
});
```

### Teams (Adaptive Cards)
```typescript
// Card de HITL para GT Professional
await teamsNotifier.sendAdaptiveCard(gtProfessional.teamsWebhook, {
  type: 'HITL_REVIEW_REQUEST',
  alert,
  actions: ['APPROVE_AND_SEND', 'REJECT', 'MODIFY'],
});
```

### In-app (Server-Sent Events)
```typescript
// SSE push al dashboard — refresco en tiempo real
sseEmitter.emit('alert', {
  clientId: alert.clientId,
  alert: sanitizeForClient(alert), // remover info interna GT
});
```

## Formato AlertMessage (AI Explainability requerida)

```typescript
interface AlertMessage {
  id: string;
  clientId: string;
  changeId: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  summary: string;

  // CRÍTICO — siempre presentes
  regulationRef: string;           // fuente exacta de la regulación
  reasoningSteps: string[];        // por qué afecta a este cliente
  impactedObligations: string[];   // qué obligaciones cambian

  actionRequired: boolean;
  deadline?: string;               // ISO date si hay plazo
  recommendedActions: string[];

  // HITL metadata
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SENT';
  assignedTo?: string;             // userId GT Professional
  reviewedAt?: string;
  reviewNotes?: string;

  sentAt?: string;
  channel: 'email' | 'teams' | 'in_app';
}
```

## Audit trail de alertas (SIEMPRE loguear)

```typescript
// Eventos a loguear en Application Insights

// Cuando se genera la alerta
logger.info({ service: 'alerts', operation: 'ai_analysis_generated',
  regulationId: change.id, clientId: client.id,
  confidence: analysis.confidence, severity: alert.severity });

// Cuando se envía
logger.info({ service: 'alerts', operation: 'alert_sent',
  alertId: alert.id, clientId: client.id,
  channel: alert.channel, severity: alert.severity });

// Cuando se hace ACK
logger.info({ service: 'alerts', operation: 'alert_acknowledged',
  alertId: alert.id, userId: req.user.id, timestamp: new Date() });
```

## Escalamiento automático

```typescript
// Si alerta HIGH no tiene ACK en 2h → escalar al manager
async escalateAlert(alertId: string): Promise<void> {
  const alert = await db.alert.findUniqueOrThrow({ where: { id: alertId } });

  if (alert.status !== 'PENDING_REVIEW') return; // ya fue atendida

  const manager = await getGTManager(alert.assignedTo);
  await teamsNotifier.sendEscalation(manager, alert, {
    reason: 'No acknowledgment after 2 hours',
    originalAssignee: alert.assignedTo,
  });

  logger.warn({ service: 'alerts', operation: 'escalation',
    alertId, assignedTo: alert.assignedTo, escalatedTo: manager.id });
}
```
