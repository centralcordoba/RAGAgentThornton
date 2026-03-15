// ============================================================================
// FILE: apps/web/lib/api/client.ts
// Type-safe API client for the RegWatch AI backend.
// ============================================================================

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = typeof window !== 'undefined'
    ? sessionStorage.getItem('auth_token')
    : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({
      code: 'UNKNOWN',
      message: res.statusText,
      requestId: 'unknown',
    }));
    throw new ApiError(res.status, body.code, body.message, body.requestId);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const api = {
  // Health
  health: () => request<{ status: string }>('/api/health'),

  // Regulations
  regulations: {
    list: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : '';
      return request<PaginatedResponse>(`/api/regulations${qs}`);
    },
    get: (id: string, clientId?: string) => {
      const qs = clientId ? `?clientId=${clientId}` : '';
      return request<{ regulation: unknown; analysis: unknown }>(`/api/regulations/${id}${qs}`);
    },
  },

  // Clients
  clients: {
    list: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : '';
      return request<PaginatedResponse>(`/api/clients${qs}`);
    },
    create: (data: CreateClientData) =>
      request<unknown>('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
    dashboard: (id: string) =>
      request<DashboardData>(`/api/clients/${id}/dashboard`),
    graph: (id: string, depth = 3) =>
      request<GraphData>(`/api/clients/${id}/graph?depth=${depth}`),
  },

  // Chat
  chat: (data: ChatData) =>
    request<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(data) }),

  // Chat with SSE streaming
  chatStream: (data: ChatData): EventSource => {
    // For SSE we use a custom approach since EventSource only supports GET
    // We POST first, then listen to SSE
    const eventSource = new EventSource(
      `${API_BASE}/api/chat/stream?clientId=${data.clientId}&message=${encodeURIComponent(data.message)}`,
    );
    return eventSource;
  },

  // Alerts
  alerts: {
    list: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : '';
      return request<PaginatedResponse>(`/api/alerts${qs}`);
    },
    acknowledge: (id: string, data: { acknowledgedBy: string; notes?: string }) =>
      request<unknown>(`/api/alerts/${id}/ack`, { method: 'POST', body: JSON.stringify(data) }),
  },

  // Ingestion
  ingest: {
    trigger: (data?: { sources?: string[]; countries?: string[] }) =>
      request<{ jobId: string; status: string }>('/api/ingest/trigger', {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }),
  },
} as const;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface PaginatedResponse {
  readonly data: readonly unknown[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

interface CreateClientData {
  readonly name: string;
  readonly countries: string[];
  readonly companyType: string;
  readonly industries: string[];
  readonly contactEmail: string;
}

interface ChatData {
  readonly clientId: string;
  readonly message: string;
  readonly conversationId?: string | null;
  readonly filters?: Record<string, unknown> | null;
}

interface ChatResponse {
  readonly conversationId: string;
  readonly analysis: {
    readonly answer: string;
    readonly sources: readonly unknown[];
    readonly confidence: number;
    readonly reasoning: string;
  };
  readonly cached: boolean;
}

interface DashboardData {
  readonly clientId: string;
  readonly complianceScore: number;
  readonly totalObligations: number;
  readonly obligationsByStatus: Record<string, number>;
  readonly recentChanges: readonly unknown[];
  readonly pendingAlerts: readonly unknown[];
  readonly upcomingDeadlines: readonly unknown[];
  readonly countries: readonly unknown[];
}

interface GraphData {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly properties: Record<string, unknown>;
}

interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relationship: string;
}
