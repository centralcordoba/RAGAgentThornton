// ============================================================================
// FILE: apps/web/components/chat/ChatMessage.tsx
// Single chat message bubble — user or assistant with source chips.
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
          isUser ? 'bg-brand-800 text-white' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {isUser ? '👤' : '🤖'}
      </div>

      {/* Message body */}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-xl px-4 py-2.5 text-sm ${
            isUser
              ? 'bg-brand-800 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          }`}
        >
          {message.isStreaming ? (
            <span>
              {message.content}
              <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse" />
            </span>
          ) : (
            <FormattedContent content={message.content} />
          )}
        </div>

        {/* Metadata row */}
        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-2 mt-1.5 px-1">
            {message.confidence !== undefined && (
              <span className="text-[10px] text-gray-400">
                Confianza: {(message.confidence * 100).toFixed(0)}%
              </span>
            )}
            {message.toolsUsed && message.toolsUsed.length > 0 && (
              <span className="text-[10px] text-gray-400">
                Tools: {message.toolsUsed.join(', ')}
              </span>
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
      >
        <span>📄</span>
        <span className="max-w-[120px] truncate">{source.title}</span>
        <span className="text-blue-400">{(source.relevanceScore * 100).toFixed(0)}%</span>
      </button>

      {expanded && (
        <div className="absolute z-10 bottom-full left-0 mb-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
          <p className="font-semibold text-gray-900 mb-1">{source.title}</p>
          <p className="text-gray-500 mb-2">
            Relevancia: {(source.relevanceScore * 100).toFixed(0)}% · ID: {source.documentId}
          </p>
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
// Formatted content — renders [doc_id] references as inline badges
// ---------------------------------------------------------------------------

function FormattedContent({ content }: { content: string }) {
  // Split content by [doc_id] references
  const parts = content.split(/(\[[^\]]+\])/g);

  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          const ref = part.slice(1, -1);
          return (
            <Badge key={i} variant="info" size="sm">
              {ref}
            </Badge>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
