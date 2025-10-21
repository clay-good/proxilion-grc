/**
 * AWS Bedrock API Parser
 * Parses AWS Bedrock API requests and responses for Claude, Titan, and other models
 */

import { AIServiceProvider, UnifiedAIRequest, UnifiedAIResponse, Message, Tool, ContentPart } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import crypto from 'crypto';

export interface BedrockClaudeRequest {
  anthropic_version?: string;
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image?: { format: string; source: { bytes: string } } }>;
  }>;
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
}

export interface BedrockTitanRequest {
  inputText: string;
  textGenerationConfig?: {
    temperature?: number;
    topP?: number;
    maxTokenCount?: number;
    stopSequences?: string[];
  };
}

export interface BedrockClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
    tool_use?: {
      id: string;
      name: string;
      input: Record<string, unknown>;
    };
  }>;
  model: string;
  stop_reason: string;
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface BedrockTitanResponse {
  inputTextTokenCount: number;
  results: Array<{
    tokenCount: number;
    outputText: string;
    completionReason: string;
  }>;
}

/**
 * AWS Bedrock Parser
 */
export class AWSBedrockParser {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Detect model type from model ID
   */
  private detectModelType(modelId: string): 'claude' | 'titan' | 'unknown' {
    if (modelId.includes('claude')) return 'claude';
    if (modelId.includes('titan')) return 'titan';
    return 'unknown';
  }

  /**
   * Parse AWS Bedrock request to unified format
   */
  async parseRequest(request: Request, modelId: string): Promise<UnifiedAIRequest> {
    try {
      const modelType = this.detectModelType(modelId);
      const bodyText = await request.text();
      const body = JSON.parse(bodyText);

      if (modelType === 'claude') {
        return this.parseClaudeRequest(body, modelId);
      } else if (modelType === 'titan') {
        return this.parseTitanRequest(body, modelId);
      }

      throw new Error(`Unsupported Bedrock model type: ${modelId}`);
    } catch (error) {
      this.logger.error('Failed to parse Bedrock request', error instanceof Error ? error : undefined);
      throw new Error('Invalid Bedrock request format');
    }
  }

  /**
   * Parse Claude request
   */
  private parseClaudeRequest(body: BedrockClaudeRequest, modelId: string): UnifiedAIRequest {
    const messages: Message[] = [];

    // Add system message if present
    if (body.system) {
      messages.push({
        role: 'system',
        content: body.system,
      });
    }

    // Convert messages
    body.messages.forEach((msg) => {
      if (typeof msg.content === 'string') {
        messages.push({
          role: msg.role as 'system' | 'user' | 'assistant' | 'function' | 'tool',
          content: msg.content,
        });
      } else {
        // Multimodal content
        const parts: ContentPart[] = msg.content.map((part) => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text || '' };
          } else if (part.type === 'image') {
            return {
              type: 'image',
              imageData: part.image?.source.bytes,
              mimeType: part.image?.format,
            };
          }
          return { type: 'text', text: '' };
        });
        messages.push({
          role: msg.role as 'system' | 'user' | 'assistant' | 'function' | 'tool',
          content: parts,
        });
      }
    });

    // Convert tools
    const tools: Tool[] | undefined = body.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    }));

    return {
      provider: AIServiceProvider.ANTHROPIC, // Claude models
      model: modelId,
      messages: messages as any as Message[],
      parameters: {
        temperature: body.temperature,
        maxTokens: body.max_tokens,
        topP: body.top_p,
        topK: body.top_k,
        stopSequences: body.stop_sequences,
      },
      streaming: body.stream || false,
      tools: tools as any as Tool[],
      metadata: {
        correlationId: crypto.randomUUID(),
        tags: {
          anthropicVersion: body.anthropic_version || '',
          provider: 'aws-bedrock',
        },
      },
    };
  }

  /**
   * Parse Titan request
   */
  private parseTitanRequest(body: BedrockTitanRequest, modelId: string): UnifiedAIRequest {
    return {
      provider: AIServiceProvider.CUSTOM, // Titan is AWS-specific
      model: modelId,
      messages: [
        {
          role: 'user',
          content: body.inputText,
        },
      ] as any as Message[],
      parameters: {
        temperature: body.textGenerationConfig?.temperature,
        maxTokens: body.textGenerationConfig?.maxTokenCount,
        topP: body.textGenerationConfig?.topP,
        stopSequences: body.textGenerationConfig?.stopSequences,
      },
      streaming: false,
      metadata: {
        correlationId: crypto.randomUUID(),
        tags: {
          provider: 'aws-bedrock',
        },
      },
    };
  }

  /**
   * Parse AWS Bedrock response to unified format
   */
  parseResponse(response: BedrockClaudeResponse | BedrockTitanResponse, modelId: string): UnifiedAIResponse {
    try {
      const modelType = this.detectModelType(modelId);

      if (modelType === 'claude') {
        return this.parseClaudeResponse(response as BedrockClaudeResponse);
      } else if (modelType === 'titan') {
        return this.parseTitanResponse(response as BedrockTitanResponse, modelId);
      }

      throw new Error(`Unsupported Bedrock model type: ${modelId}`);
    } catch (error) {
      this.logger.error('Failed to parse Bedrock response', error instanceof Error ? error : undefined);
      throw new Error('Invalid Bedrock response format');
    }
  }

  /**
   * Parse Claude response
   */
  private parseClaudeResponse(response: BedrockClaudeResponse): UnifiedAIResponse {
    // Extract text content
    const textContent = response.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    // Extract tool calls
    const toolCalls = response.content
      .filter((c) => c.type === 'tool_use')
      .map((c) => c.tool_use);

    return {
      provider: AIServiceProvider.ANTHROPIC,
      model: response.model,
      content: textContent,
      finishReason: response.stop_reason,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      metadata: {
        id: response.id,
        toolCalls,
        stopSequence: response.stop_sequence,
      },
    };
  }

  /**
   * Parse Titan response
   */
  private parseTitanResponse(response: BedrockTitanResponse, modelId: string): UnifiedAIResponse {
    const result = response.results[0];

    return {
      provider: AIServiceProvider.CUSTOM,
      model: modelId,
      content: result.outputText,
      finishReason: result.completionReason,
      usage: {
        promptTokens: response.inputTextTokenCount,
        completionTokens: result.tokenCount,
        totalTokens: response.inputTextTokenCount + result.tokenCount,
      },
    };
  }

  /**
   * Convert unified request to Bedrock Claude format
   */
  toBedrockClaudeRequest(request: UnifiedAIRequest): BedrockClaudeRequest {
    const messages: BedrockClaudeRequest['messages'] = [];
    let system: string | undefined;

    request.messages.forEach((msg) => {
      if (msg.role === 'system') {
        system = typeof msg.content === 'string' ? msg.content : '';
      } else {
        if (typeof msg.content === 'string') {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        } else {
          // Multimodal content
          const content = (msg.content as ContentPart[]).map((part) => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            } else if (part.type === 'image') {
              return {
                type: 'image',
                image: {
                  format: part.mimeType || 'image/jpeg',
                  source: { bytes: part.imageData || '' },
                },
              };
            }
            return { type: 'text', text: '' };
          });
          messages.push({
            role: msg.role,
            content,
          });
        }
      }
    });

    const tools = request.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));

    return {
      anthropic_version: 'bedrock-2023-05-31',
      messages,
      system,
      max_tokens: request.parameters.maxTokens || 1024,
      temperature: request.parameters.temperature,
      top_p: request.parameters.topP,
      top_k: request.parameters.topK,
      stop_sequences: request.parameters.stopSequences,
      stream: request.streaming,
      tools,
    };
  }
}

