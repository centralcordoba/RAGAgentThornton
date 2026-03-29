// ============================================================================
// FILE: apps/web/components/chat/ComplianceChat.tsx
// Conversational compliance chat panel.
//
// Features:
//   - Context-aware: knows client if on /clients/[id]
//   - Source chips expandible (RAG documents)
//   - Conversation history in sessionStorage
//   - Suggested questions based on available data
// ============================================================================

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from './ChatMessage';
import type { ChatMessageData, SourceChip } from './ChatMessage';
import { SuggestedQuestions } from './SuggestedQuestions';
import { ChatSkeleton } from '../ui/LoadingSkeleton';
import { useUIStore } from '@/lib/stores/uiStore';
import { getAuthHeaders } from '@/lib/api/devAuth';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceChatProps {
  readonly clientId?: string;
  readonly clientName?: string;
  readonly clientCountries?: readonly string[];
  readonly pendingObligations?: number;
}

interface SSEChatEvent {
  readonly conversationId: string;
  readonly analysis: {
    readonly answer: string;
    readonly sources: readonly SourceChip[];
    readonly confidence: number;
    readonly reasoning: string;
    readonly impactedObligations: readonly string[];
  };
  readonly toolsUsed?: readonly string[];
  readonly cached: boolean;
}

// ---------------------------------------------------------------------------
// Session storage helpers
// ---------------------------------------------------------------------------

function loadHistory(conversationId: string): ChatMessageData[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(`chat:${conversationId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<ChatMessageData & { timestamp: string }>;
    return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function saveHistory(conversationId: string, messages: readonly ChatMessageData[]): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`chat:${conversationId}`, JSON.stringify(messages.slice(-50)));
  } catch {
    // Storage full — silently discard
  }
}

// ---------------------------------------------------------------------------
// ComplianceChat
// ---------------------------------------------------------------------------

export function ComplianceChat({
  clientId,
  clientName,
  clientCountries,
  pendingObligations,
}: ComplianceChatProps) {
  const { chatOpen, chatConversationId, setChatConversationId, closeChat } = useUIStore();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Effective conversation ID
  const convId = chatConversationId ?? `conv-${clientId ?? 'global'}-${Date.now()}`;

  // Load history on mount
  useEffect(() => {
    if (chatOpen) {
      const history = loadHistory(convId);
      if (history.length > 0) {
        setMessages(history);
      }
      inputRef.current?.focus();
    }
  }, [chatOpen, convId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save history when messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveHistory(convId, messages);
    }
  }, [messages, convId]);

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessageData = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Create streaming assistant message placeholder
    const assistantId = `msg-${Date.now()}-assistant`;
    const streamingMsg: ChatMessageData = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, streamingMsg]);

    try {
      abortRef.current = new AbortController();

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          clientId: clientId || null,
          message: text.trim(),
          conversationId: chatConversationId ?? null,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorBody.message ?? `HTTP ${response.status}`);
      }

      const data = await response.json() as SSEChatEvent;
      handleJsonResponse(data, assistantId);

      // Save the conversation ID returned by the API (UUID)
      if (data.conversationId) {
        setChatConversationId(data.conversationId);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;

      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ComplianceChat] Error:', errorMsg, err);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `Error: ${errorMsg}. Verifica que la API este corriendo en ${API_BASE}.`,
                isStreaming: false,
                confidence: 0,
              }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading, clientId, chatConversationId, convId, setChatConversationId]);

  // -------------------------------------------------------------------------
  // JSON response handler
  // -------------------------------------------------------------------------

  function handleJsonResponse(data: SSEChatEvent, assistantId: string): void {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: data.analysis.answer,
              sources: data.analysis.sources,
              confidence: data.analysis.confidence,
              toolsUsed: data.toolsUsed ?? [],
              isStreaming: false,
            }
          : m,
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Handle suggested question
  // -------------------------------------------------------------------------

  const handleSuggestion = useCallback((question: string) => {
    void sendMessage(question);
  }, [sendMessage]);

  // -------------------------------------------------------------------------
  // Keyboard handler
  // -------------------------------------------------------------------------

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!chatOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-brand-700 text-white">
        <div>
          <h2 className="text-sm font-semibold">Asistente de Compliance</h2>
          <p className="text-xs text-brand-200">
            {clientName ? `Contexto: ${clientName}` : 'Consulta general'}
          </p>
        </div>
        <button
          onClick={closeChat}
          className="p-1 rounded hover:bg-brand-700 transition-colors"
          aria-label="Cerrar chat"
        >
          <span className="text-lg">✕</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="text-center py-8">
            <span className="text-4xl">🤖</span>
            <p className="text-sm text-gray-500 mt-3">
              Hola, soy tu asistente de compliance regulatorio.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Preguntame sobre regulaciones, obligaciones o deadlines.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions (shown when conversation is empty or after an answer) */}
      {!isLoading && messages.length < 2 && (
        <SuggestedQuestions
          clientId={clientId ?? null}
          clientName={clientName}
          countries={clientCountries}
          pendingObligations={pendingObligations}
          onSelect={handleSuggestion}
        />
      )}

      {/* Input */}
      <div className="border-t border-gray-200 px-4 py-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta sobre compliance regulatorio..."
            className="input flex-1"
            disabled={isLoading}
          />
          <button
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="btn-primary px-4"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              '→'
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          Las respuestas son generadas por IA y revisadas por profesionales de GT.
          Nunca se fabrican datos regulatorios.
        </p>
      </div>
    </div>
  );
}
