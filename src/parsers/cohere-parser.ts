/**
 * Cohere Parser
 * 
 * Parses requests to Cohere API:
 * - Command models (command, command-light, command-r, command-r-plus)
 * - Chat API
 * - Generate API
 * - Embed API
 */

import { AIProvider, UnifiedAIRequest, ContentPart, Message, Tool } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import crypto from 'crypto';

export interface CohereChatRequest {
  message: string;
  model?: string;
  chat_history?: CohereChatMessage[];
  conversation_id?: string;
  temperature?: number;
  max_tokens?: number;
  k?: number;
  p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: CohereTool[];
  tool_results?: CohereToolResult[];
}

export interface CohereChatMessage {
  role: 'USER' | 'CHATBOT' | 'SYSTEM';
  message: string;
}

export interface CohereTool {
  name: string;
  description: string;
  parameter_definitions: Record<string, CohereParameter>;
}

export interface CohereParameter {
  description: string;
  type: string;
  required?: boolean;
}

export interface CohereToolResult {
  call: {
    name: string;
    parameters: Record<string, any>;
  };
  outputs: Array<Record<string, any>>;
}

export interface CohereGenerateRequest {
  prompt: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  k?: number;
  p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

export class CohereParser {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Check if request is for Cohere
   */
  canParse(url: string): boolean {
    return url.includes('api.cohere.ai') || url.includes('cohere.com');
  }

  /**
   * Parse Cohere request
   */
  async parse(request: Request): Promise<UnifiedAIRequest> {
    const url = new URL(request.url);
    const body = await request.json();

    // Determine endpoint type
    if (url.pathname.includes('/chat')) {
      return this.parseChatRequest(body as CohereChatRequest);
    } else if (url.pathname.includes('/generate')) {
      return this.parseGenerateRequest(body as CohereGenerateRequest);
    } else {
      throw new Error(`Unsupported Cohere endpoint: ${url.pathname}`);
    }
  }

  /**
   * Parse Cohere chat request
   */
  private parseChatRequest(cohereRequest: CohereChatRequest): UnifiedAIRequest {
    const messages: Array<{
      role: string;
      content: string | ContentPart[];
    }> = [];

    // Add chat history
    if (cohereRequest.chat_history) {
      for (const msg of cohereRequest.chat_history) {
        messages.push({
          role: this.convertRole(msg.role),
          content: msg.message,
        });
      }
    }

    // Add current message
    messages.push({
      role: 'user',
      content: cohereRequest.message,
    });

    // Add tool results as assistant messages if present
    if (cohereRequest.tool_results) {
      for (const toolResult of cohereRequest.tool_results) {
        // Convert tool result to text content
        messages.push({
          role: 'assistant',
          content: `Tool result: ${JSON.stringify(toolResult.outputs)}`,
        });
      }
    }

    return {
      provider: 'cohere' as AIProvider,
      model: cohereRequest.model || 'command',
      messages: messages as any as Message[],
      parameters: {
        temperature: cohereRequest.temperature,
        maxTokens: cohereRequest.max_tokens,
        topK: cohereRequest.k,
        topP: cohereRequest.p,
        stopSequences: cohereRequest.stop_sequences,
      },
      tools: cohereRequest.tools ? (this.convertTools(cohereRequest.tools) as any as Tool[]) : undefined,
      streaming: cohereRequest.stream || false,
      metadata: {
        correlationId: crypto.randomUUID(),
      },
    };
  }

  /**
   * Parse Cohere generate request
   */
  private parseGenerateRequest(cohereRequest: CohereGenerateRequest): UnifiedAIRequest {
    return {
      provider: 'cohere' as AIProvider,
      model: cohereRequest.model || 'command',
      messages: [
        {
          role: 'user',
          content: cohereRequest.prompt,
        },
      ],
      parameters: {
        temperature: cohereRequest.temperature,
        maxTokens: cohereRequest.max_tokens,
        topK: cohereRequest.k,
        topP: cohereRequest.p,
        stopSequences: cohereRequest.stop_sequences,
      },
      streaming: cohereRequest.stream || false,
      metadata: {
        correlationId: crypto.randomUUID(),
      },
    };
  }

  /**
   * Convert Cohere role to unified role
   */
  private convertRole(role: CohereChatMessage['role']): string {
    const roleMap: Record<CohereChatMessage['role'], string> = {
      USER: 'user',
      CHATBOT: 'assistant',
      SYSTEM: 'system',
    };
    return roleMap[role] || 'user';
  }

  /**
   * Convert Cohere tools to unified format
   */
  private convertTools(tools: CohereTool[]): Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }> {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: this.convertParameters(tool.parameter_definitions),
          required: this.getRequiredParameters(tool.parameter_definitions),
        },
      },
    }));
  }

  /**
   * Convert Cohere parameters to JSON Schema format
   */
  private convertParameters(
    params: Record<string, CohereParameter>
  ): Record<string, any> {
    const properties: Record<string, any> = {};

    for (const [name, param] of Object.entries(params)) {
      properties[name] = {
        type: param.type,
        description: param.description,
      };
    }

    return properties;
  }

  /**
   * Get required parameters
   */
  private getRequiredParameters(params: Record<string, CohereParameter>): string[] {
    return Object.entries(params)
      .filter(([_, param]) => param.required)
      .map(([name, _]) => name);
  }

  /**
   * Extract all text content from request
   */
  extractText(request: UnifiedAIRequest): string[] {
    const texts: string[] = [];

    for (const message of request.messages) {
      if (typeof message.content === 'string') {
        texts.push(message.content);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            texts.push(part.text);
          }
        }
      }
    }

    return texts;
  }

  /**
   * Get model information
   */
  getModelInfo(model: string): {
    family: string;
    capabilities: string[];
    contextWindow: number;
  } {
    // Command R+ models
    if (model.includes('command-r-plus')) {
      return {
        family: 'command-r',
        capabilities: ['text', 'function-calling', 'rag'],
        contextWindow: 128000,
      };
    }

    // Command R models
    if (model.includes('command-r')) {
      return {
        family: 'command-r',
        capabilities: ['text', 'function-calling', 'rag'],
        contextWindow: 128000,
      };
    }

    // Command models
    if (model.includes('command')) {
      return {
        family: 'command',
        capabilities: ['text', 'function-calling'],
        contextWindow: model.includes('light') ? 4096 : 8192,
      };
    }

    // Default
    return {
      family: 'unknown',
      capabilities: ['text'],
      contextWindow: 4096,
    };
  }

  /**
   * Validate request
   */
  validate(request: UnifiedAIRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if messages exist
    if (!request.messages || request.messages.length === 0) {
      errors.push('Messages array is required and cannot be empty');
    }

    // Check message roles
    for (const message of request.messages) {
      if (!['user', 'assistant', 'system'].includes(message.role)) {
        errors.push(`Invalid message role: ${message.role}`);
      }
    }

    // Check temperature range
    if (
      request.parameters.temperature !== undefined &&
      (request.parameters.temperature < 0 || request.parameters.temperature > 5)
    ) {
      errors.push('Temperature must be between 0 and 5');
    }

    // Check top_p range
    if (
      request.parameters.topP !== undefined &&
      (request.parameters.topP < 0 || request.parameters.topP > 1)
    ) {
      errors.push('top_p must be between 0 and 1');
    }

    // Check top_k range
    if (
      request.parameters.topK !== undefined &&
      request.parameters.topK < 0
    ) {
      errors.push('top_k must be non-negative');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get supported models
   */
  getSupportedModels(): string[] {
    return [
      'command',
      'command-light',
      'command-nightly',
      'command-light-nightly',
      'command-r',
      'command-r-plus',
    ];
  }
}

