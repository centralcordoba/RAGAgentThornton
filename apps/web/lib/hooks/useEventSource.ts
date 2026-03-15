// ============================================================================
// FILE: apps/web/lib/hooks/useEventSource.ts
// React hook for SSE (Server-Sent Events) connections.
// Used for real-time alert feed and chat streaming.
// ============================================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseEventSourceOptions {
  readonly url: string;
  readonly enabled?: boolean;
  readonly onMessage?: (event: MessageEvent) => void;
  readonly onError?: (error: Event) => void;
  readonly eventTypes?: readonly string[];
}

interface UseEventSourceReturn {
  readonly connected: boolean;
  readonly lastEvent: SSEEvent | null;
  readonly events: readonly SSEEvent[];
  readonly close: () => void;
}

export interface SSEEvent {
  readonly type: string;
  readonly data: unknown;
  readonly timestamp: Date;
}

export function useEventSource({
  url,
  enabled = true,
  onMessage,
  onError,
  eventTypes = ['message'],
}: UseEventSourceOptions): UseEventSourceReturn {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !url) return;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onerror = (error) => {
      setConnected(false);
      onError?.(error);
    };

    // Listen to specific event types
    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (event: MessageEvent) => {
        let data: unknown;
        try {
          data = JSON.parse(event.data as string);
        } catch {
          data = event.data;
        }

        const sseEvent: SSEEvent = {
          type: eventType,
          data,
          timestamp: new Date(),
        };

        setLastEvent(sseEvent);
        setEvents((prev) => [...prev.slice(-99), sseEvent]); // Keep last 100
        onMessage?.(event);
      });
    }

    // Also listen for 'alert' and 'connected' events
    es.addEventListener('alert', (event: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        data = event.data;
      }

      const sseEvent: SSEEvent = { type: 'alert', data, timestamp: new Date() };
      setLastEvent(sseEvent);
      setEvents((prev) => [...prev.slice(-99), sseEvent]);
    });

    es.addEventListener('connected', () => {
      setConnected(true);
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [url, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { connected, lastEvent, events, close };
}
