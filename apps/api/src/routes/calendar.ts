// ============================================================================
// FILE: apps/api/src/routes/calendar.ts
// Compliance Calendar endpoints — events CRUD, summary, iCal export.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Errors } from '@regwatch/shared';
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarEventStatus,
  CalendarSummary,
} from '@regwatch/shared';
import { createServiceLogger } from '../config/logger.js';

const logger = createServiceLogger('route:calendar');

// ---------------------------------------------------------------------------
// In-memory store (PostgreSQL in production)
// ---------------------------------------------------------------------------

const eventsStore: Map<string, CalendarEvent> = new Map();

// Seed realistic data
seedEvents();

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface CalendarRouteDeps {
  readonly prisma: unknown;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createCalendarRouter(_deps: CalendarRouteDeps): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET /calendar/events — list events with filters
  // -----------------------------------------------------------------------
  router.get('/calendar/events', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const from = req.query['from'] as string | undefined;
    const to = req.query['to'] as string | undefined;
    const clientId = req.query['clientId'] as string | undefined;
    const country = req.query['country'] as string | undefined;
    const area = req.query['area'] as string | undefined;
    const type = req.query['type'] as CalendarEventType | undefined;

    let events = Array.from(eventsStore.values());

    if (from) events = events.filter((e) => e.date >= from);
    if (to) events = events.filter((e) => e.date <= to);
    if (clientId) events = events.filter((e) => e.client.id === clientId);
    if (country) events = events.filter((e) => e.country === country);
    if (area) events = events.filter((e) => e.regulatoryArea === area);
    if (type) events = events.filter((e) => e.type === type);

    // Recalculate daysUntil
    events = events.map(recalcDaysUntil);

    logger.info({ operation: 'calendar:list', requestId, count: events.length });
    res.json({ data: events, total: events.length });
  });

  // -----------------------------------------------------------------------
  // GET /calendar/events/upcoming — next N days, sorted by urgency
  // -----------------------------------------------------------------------
  router.get('/calendar/events/upcoming', (req: Request, res: Response) => {
    const days = parseInt(req.query['days'] as string ?? '30', 10);
    const clientId = req.query['clientId'] as string | undefined;
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 86_400_000).toISOString().split('T')[0]!;

    let events = Array.from(eventsStore.values())
      .filter((e) => e.status !== 'COMPLETED')
      .filter((e) => e.date <= cutoff)
      .map(recalcDaysUntil);

    if (clientId) events = events.filter((e) => e.client.id === clientId);

    events.sort((a, b) => a.daysUntil - b.daysUntil);

    res.json({ data: events, total: events.length });
  });

  // -----------------------------------------------------------------------
  // GET /calendar/summary — KPI counts
  // -----------------------------------------------------------------------
  router.get('/calendar/summary', (_req: Request, res: Response) => {
    const events = Array.from(eventsStore.values())
      .filter((e) => e.status !== 'COMPLETED')
      .map(recalcDaysUntil);

    const now = todayStr();
    const weekEnd = dateOffset(7);
    const monthEnd = dateOffset(30);

    const overdue = events.filter((e) => e.date < now && e.status !== 'COMPLETED').length;
    const dueThisWeek = events.filter((e) => e.date >= now && e.date <= weekEnd).length;
    const dueThisMonth = events.filter((e) => e.date >= now && e.date <= monthEnd).length;

    // Group by country
    const countryMap = new Map<string, number>();
    for (const e of events) {
      countryMap.set(e.country, (countryMap.get(e.country) ?? 0) + 1);
    }
    const byCountry = Array.from(countryMap.entries()).map(([country, count]) => ({ country, count }));

    // Group by type
    const typeMap = new Map<CalendarEventType, number>();
    for (const e of events) {
      typeMap.set(e.type, (typeMap.get(e.type) ?? 0) + 1);
    }
    const byType = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));

    const summary: CalendarSummary = { overdue, dueThisWeek, dueThisMonth, byCountry, byType };
    res.json(summary);
  });

  // -----------------------------------------------------------------------
  // POST /calendar/events — create manual event
  // -----------------------------------------------------------------------
  router.post('/calendar/events', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const body = req.body;

    if (!body.title || !body.date || !body.type) {
      throw Errors.validation(requestId, [{ path: ['title', 'date', 'type'], message: 'Required fields' }]);
    }

    const event: CalendarEvent = {
      id: randomUUID(),
      type: body.type,
      title: body.title,
      date: body.date,
      daysUntil: daysUntilDate(body.date),
      client: body.client ?? { id: 'manual', name: 'Manual' },
      country: body.country ?? 'US',
      regulatoryArea: body.regulatoryArea ?? 'general',
      obligationId: body.obligationId ?? null,
      regulatoryChangeId: body.regulatoryChangeId ?? null,
      status: 'PENDING',
      assignedTo: body.assignedTo ?? null,
      notes: body.notes ?? null,
      autoGenerated: false,
      previousDate: null,
      updateReason: null,
    };

    eventsStore.set(event.id, event);

    logger.info({ operation: 'calendar:create', requestId, eventId: event.id, result: 'success' });
    res.status(201).json(event);
  });

  // -----------------------------------------------------------------------
  // PATCH /calendar/events/:id — update status, assignee, notes
  // -----------------------------------------------------------------------
  router.patch('/calendar/events/:id', (req: Request, res: Response) => {
    const requestId = req.requestId ?? randomUUID();
    const event = eventsStore.get(req.params['id']!);
    if (!event) throw Errors.notFound(requestId, 'CalendarEvent', req.params['id']!);

    const body = req.body;
    const updated: CalendarEvent = {
      ...event,
      ...(body.status ? { status: body.status as CalendarEventStatus } : {}),
      ...(body.assignedTo !== undefined ? { assignedTo: body.assignedTo } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.date ? { date: body.date, daysUntil: daysUntilDate(body.date) } : {}),
      ...(body.date && event.date !== body.date ? { previousDate: event.date, updateReason: body.updateReason ?? 'Manual update' } : {}),
    };

    eventsStore.set(event.id, updated);

    logger.info({ operation: 'calendar:update', requestId, eventId: event.id, result: 'success' });
    res.json(updated);
  });

  // -----------------------------------------------------------------------
  // GET /calendar/export/ical — iCal file download
  // -----------------------------------------------------------------------
  router.get('/calendar/export/ical', (req: Request, res: Response) => {
    const from = req.query['from'] as string | undefined;
    const to = req.query['to'] as string | undefined;
    const clientId = req.query['clientId'] as string | undefined;

    let events = Array.from(eventsStore.values());
    if (from) events = events.filter((e) => e.date >= from);
    if (to) events = events.filter((e) => e.date <= to);
    if (clientId) events = events.filter((e) => e.client.id === clientId);

    const ical = generateIcal(events);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="regwatch-calendar.ics"');
    res.send(ical);
  });

  return router;
}

// ---------------------------------------------------------------------------
// iCal generation
// ---------------------------------------------------------------------------

function generateIcal(events: CalendarEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grant Thornton//RegWatch AI//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:RegWatch AI — Compliance Calendar',
  ];

  for (const event of events) {
    const dtStart = event.date.replace(/-/g, '');
    const uid = `${event.id}@regwatch.grantthornton.com`;
    const typeEmoji = EVENT_TYPE_EMOJI[event.type] ?? '';

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `SUMMARY:${typeEmoji} ${event.title}`,
      `DESCRIPTION:Cliente: ${event.client.name}\\nPaís: ${event.country}\\nÁrea: ${event.regulatoryArea}\\nEstado: ${event.status}`,
      `CATEGORIES:${event.type}`,
      'BEGIN:VALARM',
      'TRIGGER:-P7D',
      'ACTION:DISPLAY',
      `DESCRIPTION:7 días para: ${event.title}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Mañana: ${event.title}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

const EVENT_TYPE_EMOJI: Record<string, string> = {
  DEADLINE: '🔴',
  FILING: '🟠',
  AUDIT: '🟣',
  RENEWAL: '🔵',
  REGULATORY_CHANGE: '🟡',
  REVIEW: '⚪',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split('T')[0]!;
}

function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;
}

function daysUntilDate(dateStr: string): number {
  const target = new Date(dateStr).getTime();
  const now = new Date(todayStr()).getTime();
  return Math.ceil((target - now) / 86_400_000);
}

function recalcDaysUntil(event: CalendarEvent): CalendarEvent {
  return { ...event, daysUntil: daysUntilDate(event.date) };
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seedEvents(): void {
  const clients = [
    { id: 'c1', name: 'EuroTrade GmbH' },
    { id: 'c2', name: 'FinanceCorp AR' },
    { id: 'c3', name: 'TechStart Inc' },
    { id: 'c4', name: 'Banco Pacífico MX' },
    { id: 'c5', name: 'CVM Brasil Holdings' },
  ];

  const seeds: Omit<CalendarEvent, 'id' | 'daysUntil'>[] = [
    // Overdue
    { type: 'DEADLINE', title: 'Reporte trimestral derivados — CNBV', date: dateOffset(-5), client: clients[3]!, country: 'MX', regulatoryArea: 'Financiero', obligationId: null, regulatoryChangeId: null, status: 'OVERDUE', assignedTo: 'María González', notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    // This week
    { type: 'FILING', title: 'Form 13F — SEC Filing', date: dateOffset(2), client: clients[2]!, country: 'US', regulatoryArea: 'Financiero', obligationId: null, regulatoryChangeId: null, status: 'IN_PROGRESS', assignedTo: 'John Smith', notes: 'En preparación', autoGenerated: true, previousDate: null, updateReason: null },
    { type: 'DEADLINE', title: 'IVA mensual — Declaración', date: dateOffset(4), client: clients[0]!, country: 'ES', regulatoryArea: 'Fiscal', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: 'Ana Martínez', notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    { type: 'DEADLINE', title: 'Reporte BCRA — Posición cambiaria', date: dateOffset(6), client: clients[1]!, country: 'AR', regulatoryArea: 'Financiero', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: null, notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    // This month
    { type: 'AUDIT', title: 'Auditoría SOX — Q1 2026', date: dateOffset(12), client: clients[2]!, country: 'US', regulatoryArea: 'Financiero', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: 'John Smith', notes: 'Preparar documentación', autoGenerated: false, previousDate: null, updateReason: null },
    { type: 'RENEWAL', title: 'Renovación licencia broker — CNMV', date: dateOffset(18), client: clients[0]!, country: 'ES', regulatoryArea: 'Financiero', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: 'Ana Martínez', notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    { type: 'REGULATORY_CHANGE', title: 'Vigencia: AI Act — nuevas obligaciones', date: dateOffset(22), client: clients[0]!, country: 'EU', regulatoryArea: 'Datos/GDPR', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: null, notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    { type: 'FILING', title: 'Declaración LGTBI — Informe anual', date: dateOffset(25), client: clients[0]!, country: 'ES', regulatoryArea: 'Laboral', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: null, notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    { type: 'DEADLINE', title: 'FATCA Report — IRS', date: dateOffset(15), client: clients[2]!, country: 'US', regulatoryArea: 'Fiscal', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: 'John Smith', notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    // Next 90 days
    { type: 'DEADLINE', title: 'CVM Instrução 694 — Reporte derivados', date: dateOffset(35), client: clients[4]!, country: 'BR', regulatoryArea: 'Financiero', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: null, notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    { type: 'REVIEW', title: 'Revisión política AML — Anual', date: dateOffset(42), client: clients[1]!, country: 'AR', regulatoryArea: 'Financiero', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: 'María González', notes: null, autoGenerated: false, previousDate: null, updateReason: null },
    { type: 'REGULATORY_CHANGE', title: 'Vigencia: Reforma Tributária IBS/CBS', date: dateOffset(55), client: clients[4]!, country: 'BR', regulatoryArea: 'Fiscal', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: null, notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    { type: 'DEADLINE', title: 'SAT Facturación 4.0 — Migración', date: dateOffset(28), client: clients[3]!, country: 'MX', regulatoryArea: 'Fiscal', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: null, notes: null, autoGenerated: true, previousDate: dateOffset(45), updateReason: 'SAT adelantó deadline (Resolución 2.7.1.3)' },
    { type: 'FILING', title: 'Monotributo Digital — Adhesión', date: dateOffset(60), client: clients[1]!, country: 'AR', regulatoryArea: 'Fiscal', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: null, notes: null, autoGenerated: true, previousDate: null, updateReason: null },
    { type: 'AUDIT', title: 'Auditoría GDPR — Review anual', date: dateOffset(70), client: clients[0]!, country: 'EU', regulatoryArea: 'Datos/GDPR', obligationId: null, regulatoryChangeId: null, status: 'PENDING', assignedTo: null, notes: null, autoGenerated: false, previousDate: null, updateReason: null },
  ];

  for (const seed of seeds) {
    const event: CalendarEvent = {
      ...seed,
      id: randomUUID(),
      daysUntil: daysUntilDate(seed.date),
    };
    eventsStore.set(event.id, event);
  }
}
