/**
 * Tests for Azure OpenAI Parser
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AzureOpenAIParser } from '../src/parsers/azure-openai-parser.js';
import { AIServiceProvider } from '../src/types/index.js';

describe('AzureOpenAIParser', () => {
  let parser: AzureOpenAIParser;

  beforeEach(() => {
    parser = new AzureOpenAIParser();
  });

  describe('parseRequest', () => {
    it('should parse basic Azure OpenAI chat request', async () => {
      const request = new Request('https://myresource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-02-01', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' },
          ],
          temperature: 0.7,
          max_tokens: 100,
        }),
      });

      const unified = await parser.parseRequest(request);

      expect(unified.provider).toBe(AIServiceProvider.OPENAI);
      expect(unified.model).toBe('gpt-4');
      expect(unified.messages).toHaveLength(2);
      expect(unified.messages[0].role).toBe('system');
      expect(unified.messages[0].content).toBe('You are a helpful assistant.');
      expect(unified.parameters.temperature).toBe(0.7);
      expect(unified.parameters.maxTokens).toBe(100);
      expect(unified.metadata?.tags?.deployment).toBe('gpt-4');
      expect(unified.metadata?.tags?.apiVersion).toBe('2024-02-01');
    });

    it('should parse Azure OpenAI request with tools', async () => {
      const request = new Request('https://myresource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-02-01', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'What is the weather?' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather information',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                },
              },
            },
          ],
        }),
      });

      const unified = await parser.parseRequest(request);

      expect(unified.tools).toBeDefined();
      expect(unified.tools).toHaveLength(1);
      expect(unified.tools![0].name).toBe('get_weather');
      expect(unified.tools![0].description).toBe('Get weather information');
    });

    it('should parse Azure OpenAI request with multimodal content', async () => {
      const request = new Request('https://myresource.openai.azure.com/openai/deployments/gpt-4-vision/chat/completions?api-version=2024-02-01', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What is in this image?' },
                { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
              ],
            },
          ],
        }),
      });

      const unified = await parser.parseRequest(request);

      expect(unified.messages).toHaveLength(1);
      expect(Array.isArray(unified.messages[0].content)).toBe(true);
      const content = unified.messages[0].content as any[];
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('image');
    });
  });

  describe('parseResponse', () => {
    it('should parse Azure OpenAI chat response', () => {
      const azureResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you today?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      const unified = parser.parseResponse(azureResponse);

      expect(unified.provider).toBe(AIServiceProvider.OPENAI);
      expect(unified.model).toBe('gpt-4');
      expect(unified.content).toBe('Hello! How can I help you today?');
      expect(unified.finishReason).toBe('stop');
      expect(unified.usage?.promptTokens).toBe(10);
      expect(unified.usage?.completionTokens).toBe(20);
      expect(unified.usage?.totalTokens).toBe(30);
      expect(unified.metadata?.id).toBe('chatcmpl-123');
    });

    it('should parse Azure OpenAI response with tool calls', () => {
      const azureResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "San Francisco"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40,
        },
      };

      const unified = parser.parseResponse(azureResponse);

      expect(unified.content).toBe('');
      expect(unified.finishReason).toBe('tool_calls');
      expect(unified.metadata?.toolCalls).toBeDefined();
    });
  });

  describe('toAzureOpenAIRequest', () => {
    it('should convert unified request to Azure OpenAI format', () => {
      const unified = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        messages: [
          { role: 'user' as const, content: 'Hello!' },
        ],
        parameters: {
          temperature: 0.8,
          maxTokens: 150,
          topP: 0.9,
        },
        streaming: false,
        metadata: {
          correlationId: 'test-123',
        },
      };

      const azureRequest = parser.toAzureOpenAIRequest(unified);

      expect(azureRequest.messages).toHaveLength(1);
      expect(azureRequest.messages[0].role).toBe('user');
      expect(azureRequest.messages[0].content).toBe('Hello!');
      expect(azureRequest.temperature).toBe(0.8);
      expect(azureRequest.max_tokens).toBe(150);
      expect(azureRequest.top_p).toBe(0.9);
      expect(azureRequest.stream).toBe(false);
    });
  });

  describe('toAzureOpenAIResponse', () => {
    it('should convert unified response to Azure OpenAI format', () => {
      const unified = {
        provider: AIServiceProvider.OPENAI,
        model: 'gpt-4',
        content: 'Hello! How can I help?',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        metadata: {
          id: 'chatcmpl-789',
          created: 1677652288,
        },
      };

      const azureResponse = parser.toAzureOpenAIResponse(unified);

      expect(azureResponse.id).toBe('chatcmpl-789');
      expect(azureResponse.model).toBe('gpt-4');
      expect(azureResponse.choices[0].message.content).toBe('Hello! How can I help?');
      expect(azureResponse.choices[0].finish_reason).toBe('stop');
      expect(azureResponse.usage.prompt_tokens).toBe(10);
      expect(azureResponse.usage.completion_tokens).toBe(20);
      expect(azureResponse.usage.total_tokens).toBe(30);
    });
  });
});

