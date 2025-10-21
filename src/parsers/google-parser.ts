/**
 * Google Vertex AI Parser
 * 
 * Parses requests to Google's Vertex AI API:
 * - Gemini models (gemini-pro, gemini-pro-vision)
 * - PaLM 2 models
 * - Text generation
 * - Chat completion
 * - Multimodal content
 */

import { AIProvider, UnifiedAIRequest, ContentPart, Message, Tool } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import crypto from 'crypto';

export interface GoogleRequest {
  contents: GoogleContent[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: GoogleSafetySetting[];
  tools?: GoogleTool[];
}

export interface GoogleContent {
  role: 'user' | 'model';
  parts: GooglePart[];
}

export interface GooglePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
}

export interface GoogleSafetySetting {
  category: string;
  threshold: string;
}

export interface GoogleTool {
  functionDeclarations: GoogleFunctionDeclaration[];
}

export interface GoogleFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export class GoogleParser {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Check if request is for Google Vertex AI
   */
  canParse(url: string): boolean {
    return (
      url.includes('googleapis.com') ||
      url.includes('generativelanguage.googleapis.com') ||
      url.includes('aiplatform.googleapis.com')
    );
  }

  /**
   * Parse Google Vertex AI request
   */
  async parse(request: Request): Promise<UnifiedAIRequest> {
    const url = new URL(request.url);
    const body = await request.json();

    // Extract model from URL
    // Format: /v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent
    const pathParts = url.pathname.split('/');
    const modelIndex = pathParts.findIndex((part) => part === 'models');
    let model = 'gemini-pro';

    if (modelIndex !== -1 && modelIndex + 1 < pathParts.length) {
      const modelPart = pathParts[modelIndex + 1];
      model = modelPart.split(':')[0]; // Remove :generateContent suffix
    }

    const googleRequest = body as GoogleRequest;

    // Convert to unified format
    const messages = this.convertMessages(googleRequest.contents);
    const parameters = this.convertParameters(googleRequest.generationConfig);
    const tools = this.convertTools(googleRequest.tools);

    return {
      provider: 'google' as AIProvider,
      model,
      messages: messages as any as Message[],
      parameters,
      tools: tools.length > 0 ? (tools as any as Tool[]) : undefined,
      streaming: url.pathname.includes('streamGenerateContent'),
      metadata: {
        correlationId: crypto.randomUUID(),
      },
    };
  }

  /**
   * Convert Google contents to unified messages
   */
  private convertMessages(contents: GoogleContent[]): Array<{
    role: string;
    content: string | ContentPart[];
  }> {
    return contents.map((content) => {
      // Map Google roles to unified roles
      const role = content.role === 'model' ? 'assistant' : content.role;

      // Convert parts to content
      if (content.parts.length === 1 && content.parts[0].text) {
        // Simple text message
        return {
          role,
          content: content.parts[0].text,
        };
      } else {
        // Multimodal message
        const contentParts = content.parts.map((part) => {
          if (part.text) {
            return { type: 'text' as const, text: part.text };
          } else if (part.inlineData) {
            return {
              type: 'image' as const,
              imageUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            };
          } else if (part.fileData) {
            return {
              type: 'image' as const,
              imageUrl: part.fileData.fileUri,
            };
          } else {
            return { type: 'text' as const, text: '' };
          }
        });

        return {
          role,
          content: contentParts as ContentPart[],
        };
      }
    });
  }

  /**
   * Convert Google generation config to unified parameters
   */
  private convertParameters(config?: GoogleRequest['generationConfig']): Record<string, any> {
    if (!config) {
      return {};
    }

    return {
      temperature: config.temperature,
      top_p: config.topP,
      top_k: config.topK,
      max_tokens: config.maxOutputTokens,
      stop: config.stopSequences,
    };
  }

  /**
   * Convert Google tools to unified format
   */
  private convertTools(tools?: GoogleTool[]): Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }> {
    if (!tools || tools.length === 0) {
      return [];
    }

    const unifiedTools: Array<{
      type: string;
      function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
      };
    }> = [];

    for (const tool of tools) {
      for (const func of tool.functionDeclarations) {
        unifiedTools.push({
          type: 'function',
          function: {
            name: func.name,
            description: func.description,
            parameters: func.parameters,
          },
        });
      }
    }

    return unifiedTools;
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
    // Gemini models
    if (model.startsWith('gemini-')) {
      return {
        family: 'gemini',
        capabilities: ['text', 'vision', 'function-calling'],
        contextWindow: model.includes('1.5') ? 1000000 : 32000,
      };
    }

    // PaLM 2 models
    if (model.startsWith('text-bison') || model.startsWith('chat-bison')) {
      return {
        family: 'palm2',
        capabilities: ['text'],
        contextWindow: 8192,
      };
    }

    // Default
    return {
      family: 'unknown',
      capabilities: ['text'],
      contextWindow: 8192,
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
      (request.parameters.temperature < 0 || request.parameters.temperature > 2)
    ) {
      errors.push('Temperature must be between 0 and 2');
    }

    // Check topP range
    if (
      request.parameters.topP !== undefined &&
      (request.parameters.topP < 0 || request.parameters.topP > 1)
    ) {
      errors.push('topP must be between 0 and 1');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

