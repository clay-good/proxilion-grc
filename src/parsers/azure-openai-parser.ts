/**
 * Azure OpenAI API Parser
 * Parses Azure OpenAI API requests and responses
 */

import { AIServiceProvider, UnifiedAIRequest, UnifiedAIResponse, Message, Tool, ContentPart } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import crypto from 'crypto';

export interface AzureOpenAIRequest {
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    name?: string;
    tool_call_id?: string;
  }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: Array<{
    type: string;
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?: string | { type: string; function: { name: string } };
  response_format?: { type: string };
  seed?: number;
  user?: string;
}

export interface AzureOpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Azure OpenAI Parser
 */
export class AzureOpenAIParser {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Parse Azure OpenAI request to unified format
   */
  async parseRequest(request: Request): Promise<UnifiedAIRequest> {
    try {
      const url = new URL(request.url);

      // Extract deployment name from URL path
      // Azure OpenAI URL format: https://{resource}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version={version}
      const pathParts = url.pathname.split('/');
      const deploymentIndex = pathParts.indexOf('deployments');
      const deployment = deploymentIndex >= 0 && deploymentIndex + 1 < pathParts.length
        ? pathParts[deploymentIndex + 1]
        : 'unknown';

      const body = await request.text();
      const azureRequest = JSON.parse(body) as AzureOpenAIRequest;

      // Convert messages
      const messages: Message[] = azureRequest.messages.map((msg) => {
        if (typeof msg.content === 'string') {
          return {
            role: msg.role as 'system' | 'user' | 'assistant' | 'function' | 'tool',
            content: msg.content,
            name: msg.name,
            toolCallId: msg.tool_call_id,
          };
        } else {
          // Multimodal content
          const parts: ContentPart[] = msg.content.map((part) => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text || '' };
            } else if (part.type === 'image_url') {
              return { type: 'image', imageUrl: part.image_url?.url };
            }
            return { type: 'text', text: '' };
          });
          return {
            role: msg.role as 'system' | 'user' | 'assistant' | 'function' | 'tool',
            content: parts,
            name: msg.name,
            toolCallId: msg.tool_call_id,
          };
        }
      });

      // Convert tools
      const tools: Tool[] | undefined = azureRequest.tools?.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description || '',
        parameters: tool.function.parameters || {},
      }));

      return {
        provider: AIServiceProvider.OPENAI, // Azure OpenAI uses OpenAI models
        model: azureRequest.model || deployment,
        messages: messages as any as Message[],
        parameters: {
          temperature: azureRequest.temperature,
          maxTokens: azureRequest.max_tokens,
          topP: azureRequest.top_p,
          frequencyPenalty: azureRequest.frequency_penalty,
          presencePenalty: azureRequest.presence_penalty,
          stopSequences: Array.isArray(azureRequest.stop) ? azureRequest.stop : azureRequest.stop ? [azureRequest.stop] : undefined,
        },
        streaming: azureRequest.stream || false,
        tools: tools as any as Tool[],
        metadata: {
          correlationId: crypto.randomUUID(),
          tags: {
            deployment,
            apiVersion: url.searchParams.get('api-version') || 'unknown',
            user: azureRequest.user || '',
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to parse Azure OpenAI request', error instanceof Error ? error : undefined);
      throw new Error('Invalid Azure OpenAI request format');
    }
  }

  /**
   * Parse Azure OpenAI response to unified format
   */
  parseResponse(response: AzureOpenAIResponse): UnifiedAIResponse {
    try {
      const choice = response.choices[0];
      const content = choice.message.content || '';

      return {
        provider: AIServiceProvider.OPENAI,
        model: response.model,
        content,
        finishReason: choice.finish_reason,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        },
        metadata: {
          id: response.id,
          created: response.created,
          toolCalls: choice.message.tool_calls,
        },
      };
    } catch (error) {
      this.logger.error('Failed to parse Azure OpenAI response', error instanceof Error ? error : undefined);
      throw new Error('Invalid Azure OpenAI response format');
    }
  }

  /**
   * Convert unified request back to Azure OpenAI format
   */
  toAzureOpenAIRequest(request: UnifiedAIRequest): AzureOpenAIRequest {
    const messages = request.messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
          name: msg.name,
          tool_call_id: msg.toolCallId,
        };
      } else {
        // Multimodal content
        const content = (msg.content as ContentPart[]).map((part) => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          } else if (part.type === 'image') {
            return { type: 'image_url', image_url: { url: part.imageUrl || '' } };
          }
          return { type: 'text', text: '' };
        });
        return {
          role: msg.role,
          content,
          name: msg.name,
          tool_call_id: msg.toolCallId,
        };
      }
    });

    const tools = request.tools?.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    return {
      messages,
      model: request.model,
      temperature: request.parameters.temperature,
      max_tokens: request.parameters.maxTokens,
      top_p: request.parameters.topP,
      frequency_penalty: request.parameters.frequencyPenalty,
      presence_penalty: request.parameters.presencePenalty,
      stop: request.parameters.stopSequences,
      stream: request.streaming,
      tools,
    };
  }

  /**
   * Convert unified response back to Azure OpenAI format
   */
  toAzureOpenAIResponse(response: UnifiedAIResponse): AzureOpenAIResponse {
    return {
      id: (response.metadata?.id as string) || crypto.randomUUID(),
      object: 'chat.completion',
      created: (response.metadata?.created as number) || Date.now(),
      model: response.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.content,
            tool_calls: response.metadata?.toolCalls as any,
          },
          finish_reason: response.finishReason || 'stop',
        },
      ],
      usage: {
        prompt_tokens: response.usage?.promptTokens || 0,
        completion_tokens: response.usage?.completionTokens || 0,
        total_tokens: response.usage?.totalTokens || 0,
      },
    };
  }
}

