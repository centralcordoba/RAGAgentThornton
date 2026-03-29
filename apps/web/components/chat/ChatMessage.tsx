// ============================================================================
// FILE: apps/web/components/chat/ChatMessage.tsx
// Single chat message bubble — user or assistant with source chips.
// Supports basic markdown: **bold**, *italic*, bullet lists, numbered lists.
// ============================================================================

'use client';

import { useState } from 'react';
import { Badge } from '../ui/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessageData {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: Date;
  readonly sources?: readonly SourceChip[];
  readonly confidence?: number;
  readonly toolsUsed?: readonly string[];
  readonly isStreaming?: boolean;
}

export interface SourceChip {
  readonly documentId: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly relevanceScore: number;
  readonly snippet?: string;
}

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

export function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm ${
          isUser ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600'
        }`}
        role="img"
        aria-label={isUser ? 'Usuario' : 'Asistente'}
      >
        {isUser ? '👤' : '🤖'}
      </div>

      {/* Message body */}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-brand-700 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          }`}
        >
          {message.isStreaming ? (
            <span>
              {message.content || 'Analizando...'}
              <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse" />
            </span>
          ) : (
            <FormattedContent content={message.content} />
          )}
        </div>

        {/* Metadata row */}
        {!isUser && !message.isStreaming && message.content && (
          <div className="flex items-center gap-2 mt-1.5 px-1">
            {message.confidence !== undefined && message.confidence > 0 && (
              <ConfidenceBadge value={message.confidence} />
            )}
            <span className="text-[10px] text-gray-300">
              {message.timestamp.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 px-1">
            {message.sources.map((source) => (
              <SourceTag key={source.documentId} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence badge with color coding
// ---------------------------------------------------------------------------

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70
    ? 'text-green-600'
    : pct >= 50
      ? 'text-amber-600'
      : 'text-gray-400';

  const label = pct >= 70
    ? 'Alta confianza'
    : pct >= 50
      ? 'Confianza media'
      : 'Baja confianza';

  return (
    <span className={`text-[10px] ${color}`} title={label}>
      {label} ({pct}%)
    </span>
  );
}

// ---------------------------------------------------------------------------
// Source tag — expandible chip
// ---------------------------------------------------------------------------

function SourceTag({ source }: { source: SourceChip }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full
                   bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
        aria-label={`Fuente: ${source.title}`}
      >
        <span>📄</span>
        <span className="max-w-[180px] truncate">{source.title}</span>
      </button>

      {expanded && (
        <div className="absolute z-10 bottom-full left-0 mb-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
          <p className="font-semibold text-gray-900 mb-1">{source.title}</p>
          {source.snippet && (
            <p className="text-gray-500 mb-2 line-clamp-3">{source.snippet}</p>
          )}
          {source.sourceUrl && (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Ver documento fuente →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatted content — renders markdown-like syntax
// Supports: **bold**, *italic*, numbered lists, bullet lists, [doc_ref]
// ---------------------------------------------------------------------------

function FormattedContent({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;

        // Numbered list items: "1. text"
        const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (numMatch) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-gray-400 flex-shrink-0 w-4 text-right">{numMatch[1]}.</span>
              <span><InlineFormatted text={numMatch[2]!} /></span>
            </div>
          );
        }

        // Bullet list items: "- text"
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-gray-400 flex-shrink-0">·</span>
              <span><InlineFormatted text={trimmed.slice(2)} /></span>
            </div>
          );
        }

        return <p key={i}><InlineFormatted text={trimmed} /></p>;
      })}
    </div>
  );
}

/** Renders inline formatting: **bold**, *italic*, [doc_ref], `code` */
function InlineFormatted({ text }: { text: string }) {
  // Split by inline patterns: **bold**, *italic*, [ref], `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]|`[^`]+`)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={i} className="italic">{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('[') && part.endsWith(']')) {
          return <Badge key={i} variant="info" size="sm">{part.slice(1, -1)}</Badge>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="bg-gray-200 px-1 rounded text-xs">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
