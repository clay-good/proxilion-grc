/**
 * Tests for AWS Bedrock Parser
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AWSBedrockParser } from '../src/parsers/aws-bedrock-parser.js';
import { AIServiceProvider } from '../src/types/index.js';

describe('AWSBedrockParser', () => {
  let parser: AWSBedrockParser;

  beforeEach(() => {
    parser = new AWSBedrockParser();
  });

  describe('Claude Models', () => {
    it('should parse Claude request', async () => {
      const request = new Request('https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-v2/invoke', {
        method: 'POST',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          messages: [
            { role: 'user', content: 'Hello!' },
          ],
          max_tokens: 100,
          temperature: 0.7,
        }),
      });

      const unified = await parser.parseRequest(request, 'anthropic.claude-v2');

      expect(unified.provider).toBe(AIServiceProvider.ANTHROPIC);
      expect(unified.model).toBe('anthropic.claude-v2');
      expect(unified.messages).toHaveLength(1);
      expect(unified.messages[0].content).toBe('Hello!');
      expect(unified.parameters.maxTokens).toBe(100);
      expect(unified.parameters.temperature).toBe(0.7);
    });

    it('should parse Claude request with system message', async () => {
      const request = new Request('https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-v2/invoke', {
        method: 'POST',
        body: JSON.stringify({
          system: 'You are a helpful assistant.',
          messages: [
            { role: 'user', content: 'Hello!' },
          ],
          max_tokens: 100,
        }),
      });

      const unified = await parser.parseRequest(request, 'anthropic.claude-v2');

      expect(unified.messages).toHaveLength(2);
      expect(unified.messages[0].role).toBe('system');
      expect(unified.messages[0].content).toBe('You are a helpful assistant.');
    });

    it('should parse Claude response', () => {
      const bedrockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello! How can I help you?' },
        ],
        model: 'claude-v2',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      const unified = parser.parseResponse(bedrockResponse, 'anthropic.claude-v2');

      expect(unified.provider).toBe(AIServiceProvider.ANTHROPIC);
      expect(unified.content).toBe('Hello! How can I help you?');
      expect(unified.finishReason).toBe('end_turn');
      expect(unified.usage?.promptTokens).toBe(10);
      expect(unified.usage?.completionTokens).toBe(20);
    });

    it('should convert unified request to Claude format', () => {
      const unified = {
        provider: AIServiceProvider.ANTHROPIC,
        model: 'claude-v2',
        messages: [
          { role: 'system' as const, content: 'You are helpful.' },
          { role: 'user' as const, content: 'Hello!' },
        ],
        parameters: {
          maxTokens: 150,
          temperature: 0.8,
        },
        streaming: false,
        metadata: {
          correlationId: 'test-123',
        },
      };

      const bedrockRequest = parser.toBedrockClaudeRequest(unified);

      expect(bedrockRequest.system).toBe('You are helpful.');
      expect(bedrockRequest.messages).toHaveLength(1);
      expect(bedrockRequest.messages[0].content).toBe('Hello!');
      expect(bedrockRequest.max_tokens).toBe(150);
      expect(bedrockRequest.temperature).toBe(0.8);
    });
  });

  describe('Titan Models', () => {
    it('should parse Titan request', async () => {
      const request = new Request('https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.titan-text-express-v1/invoke', {
        method: 'POST',
        body: JSON.stringify({
          inputText: 'Hello, world!',
          textGenerationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxTokenCount: 100,
          },
        }),
      });

      const unified = await parser.parseRequest(request, 'amazon.titan-text-express-v1');

      expect(unified.provider).toBe(AIServiceProvider.CUSTOM);
      expect(unified.model).toBe('amazon.titan-text-express-v1');
      expect(unified.messages).toHaveLength(1);
      expect(unified.messages[0].content).toBe('Hello, world!');
      expect(unified.parameters.temperature).toBe(0.7);
      expect(unified.parameters.maxTokens).toBe(100);
    });

    it('should parse Titan response', () => {
      const bedrockResponse = {
        inputTextTokenCount: 5,
        results: [
          {
            tokenCount: 15,
            outputText: 'Hello! How can I assist you today?',
            completionReason: 'FINISH',
          },
        ],
      };

      const unified = parser.parseResponse(bedrockResponse, 'amazon.titan-text-express-v1');

      expect(unified.provider).toBe(AIServiceProvider.CUSTOM);
      expect(unified.content).toBe('Hello! How can I assist you today?');
      expect(unified.finishReason).toBe('FINISH');
      expect(unified.usage?.promptTokens).toBe(5);
      expect(unified.usage?.completionTokens).toBe(15);
      expect(unified.usage?.totalTokens).toBe(20);
    });
  });
});

