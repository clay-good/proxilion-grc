/**
 * Shared text extraction utility for scanners
 * Eliminates duplicate text extraction across multiple scanners
 * Memory optimization: Extract once, use everywhere
 */

import { UnifiedAIRequest, Message, ContentPart } from '../types/index.js';

export interface ExtractedText {
  fullText: string;
  messageTexts: string[];
  systemPrompts: string[];
  userMessages: string[];
  assistantMessages: string[];
  toolDescriptions: string[];
}

/**
 * Extract all text content from a UnifiedAIRequest
 * This function is called once per request and the result is shared across all scanners
 */
export function extractTextContent(request: UnifiedAIRequest): ExtractedText {
  const messageTexts: string[] = [];
  const systemPrompts: string[] = [];
  const userMessages: string[] = [];
  const assistantMessages: string[] = [];

  // Extract from messages
  for (const message of request.messages) {
    const text = extractMessageText(message);
    if (text) {
      messageTexts.push(text);

      // Categorize by role
      switch (message.role) {
        case 'system':
          systemPrompts.push(text);
          break;
        case 'user':
          userMessages.push(text);
          break;
        case 'assistant':
          assistantMessages.push(text);
          break;
      }
    }
  }

  // Extract tool descriptions
  const toolDescriptions: string[] = [];
  if (request.tools) {
    for (const tool of request.tools) {
      toolDescriptions.push(`${tool.name}: ${tool.description}`);
    }
  }

  // Combine all text
  const fullText = [
    ...messageTexts,
    ...toolDescriptions,
  ].join('\n');

  return {
    fullText,
    messageTexts,
    systemPrompts,
    userMessages,
    assistantMessages,
    toolDescriptions,
  };
}

/**
 * Extract text from a single message
 */
function extractMessageText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part: ContentPart) => {
        if (part.type === 'text' && part.text) {
          return part.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

/**
 * Cache for extracted text content to avoid re-extraction
 */
export class TextExtractionCache {
  private cache = new WeakMap<UnifiedAIRequest, ExtractedText>();

  get(request: UnifiedAIRequest): ExtractedText {
    let extracted = this.cache.get(request);
    if (!extracted) {
      extracted = extractTextContent(request);
      this.cache.set(request, extracted);
    }
    return extracted;
  }

  clear(): void {
    this.cache = new WeakMap();
  }
}

// Global cache instance
export const textExtractionCache = new TextExtractionCache();
