import { describe, it, expect, beforeEach } from 'vitest';
import { RequestTransformer } from '../src/transformation/request-transformer.js';
import { ResponseTransformer } from '../src/transformation/response-transformer.js';
import { TransformationManager } from '../src/transformation/transformation-manager.js';

describe('RequestTransformer', () => {
  let transformer: RequestTransformer;

  beforeEach(() => {
    transformer = new RequestTransformer();
  });

  describe('OpenAI to Anthropic', () => {
    it('should transform basic request', async () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello, world!' },
        ],
        max_tokens: 100,
        temperature: 0.7,
      };

      const result = await transformer.transform(openaiRequest, {
        sourceProvider: 'openai',
        targetProvider: 'anthropic',
      });

      expect(result.success).toBe(true);
      expect(result.transformedRequest.model).toBe('claude-3-opus-20240229');
      expect(result.transformedRequest.messages).toHaveLength(1);
      expect(result.transformedRequest.max_tokens).toBe(100);
      expect(result.transformedRequest.temperature).toBe(0.7);
    });

    it('should handle stop sequences', async () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        stop: ['END', 'STOP'],
      };

      const result = await transformer.transform(openaiRequest, {
        sourceProvider: 'openai',
        targetProvider: 'anthropic',
      });

      expect(result.success).toBe(true);
      expect(result.transformedRequest.stop_sequences).toEqual(['END', 'STOP']);
    });

    it('should warn about unsupported features', async () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        functions: [{ name: 'test', parameters: {} }],
      };

      const result = await transformer.transform(openaiRequest, {
        sourceProvider: 'openai',
        targetProvider: 'anthropic',
      });

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.unsupportedFeatures).toContain('functions/tools');
    });

    it('should fail in strict mode with unsupported features', async () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        functions: [{ name: 'test', parameters: {} }],
      };

      const result = await transformer.transform(openaiRequest, {
        sourceProvider: 'openai',
        targetProvider: 'anthropic',
        strictMode: true,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('OpenAI to Google', () => {
    it('should transform basic request', async () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello!' },
        ],
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
      };

      const result = await transformer.transform(openaiRequest, {
        sourceProvider: 'openai',
        targetProvider: 'google',
      });

      expect(result.success).toBe(true);
      expect(result.transformedRequest.model).toBe('gemini-pro');
      expect(result.transformedRequest.contents).toBeDefined();
      expect(result.transformedRequest.generationConfig).toBeDefined();
      expect(result.transformedRequest.generationConfig.temperature).toBe(0.7);
      expect(result.transformedRequest.generationConfig.topP).toBe(0.9);
      expect(result.transformedRequest.generationConfig.maxOutputTokens).toBe(100);
    });

    it('should transform messages to Google format', async () => {
      const openaiRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
      };

      const result = await transformer.transform(openaiRequest, {
        sourceProvider: 'openai',
        targetProvider: 'google',
      });

      expect(result.success).toBe(true);
      expect(result.transformedRequest.contents).toHaveLength(3);
      expect(result.transformedRequest.contents[0].role).toBe('user');
      expect(result.transformedRequest.contents[1].role).toBe('model');
      expect(result.transformedRequest.contents[2].role).toBe('user');
    });
  });

  describe('OpenAI to Cohere', () => {
    it('should transform basic request', async () => {
      const openaiRequest = {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' },
          { role: 'user', content: 'Current message' },
        ],
        temperature: 0.7,
        max_tokens: 100,
      };

      const result = await transformer.transform(openaiRequest, {
        sourceProvider: 'openai',
        targetProvider: 'cohere',
      });

      expect(result.success).toBe(true);
      expect(result.transformedRequest.model).toBe('command-light');
      expect(result.transformedRequest.message).toBe('Current message');
      expect(result.transformedRequest.chat_history).toHaveLength(2);
      expect(result.transformedRequest.temperature).toBe(0.7);
      expect(result.transformedRequest.max_tokens).toBe(100);
    });
  });

  describe('Same Provider', () => {
    it('should return original request when source equals target', async () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
      };

      const result = await transformer.transform(request, {
        sourceProvider: 'openai',
        targetProvider: 'openai',
      });

      expect(result.success).toBe(true);
      expect(result.transformedRequest).toEqual(request);
      expect(result.warnings).toHaveLength(0);
    });
  });
});

describe('ResponseTransformer', () => {
  let transformer: ResponseTransformer;

  beforeEach(() => {
    transformer = new ResponseTransformer();
  });

  describe('Anthropic to OpenAI', () => {
    it('should transform basic response', async () => {
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello, world!' },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      const result = await transformer.transform(anthropicResponse, {
        sourceProvider: 'anthropic',
        targetProvider: 'openai',
      });

      expect(result.success).toBe(true);
      expect(result.transformedResponse.object).toBe('chat.completion');
      expect(result.transformedResponse.choices).toHaveLength(1);
      expect(result.transformedResponse.choices[0].message.role).toBe('assistant');
      expect(result.transformedResponse.choices[0].message.content).toBe('Hello, world!');
      expect(result.transformedResponse.choices[0].finish_reason).toBe('stop');
      expect(result.transformedResponse.usage.prompt_tokens).toBe(10);
      expect(result.transformedResponse.usage.completion_tokens).toBe(20);
      expect(result.transformedResponse.usage.total_tokens).toBe(30);
    });

    it('should map finish reasons correctly', async () => {
      const anthropicResponse = {
        id: 'msg_123',
        content: [{ type: 'text', text: 'Test' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 10, output_tokens: 20 },
      };

      const result = await transformer.transform(anthropicResponse, {
        sourceProvider: 'anthropic',
        targetProvider: 'openai',
      });

      expect(result.success).toBe(true);
      expect(result.transformedResponse.choices[0].finish_reason).toBe('length');
    });
  });

  describe('Google to OpenAI', () => {
    it('should transform basic response', async () => {
      const googleResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello from Gemini!' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 25,
          totalTokenCount: 40,
        },
      };

      const result = await transformer.transform(googleResponse, {
        sourceProvider: 'google',
        targetProvider: 'openai',
      });

      expect(result.success).toBe(true);
      expect(result.transformedResponse.object).toBe('chat.completion');
      expect(result.transformedResponse.choices[0].message.content).toBe('Hello from Gemini!');
      expect(result.transformedResponse.choices[0].finish_reason).toBe('stop');
      expect(result.transformedResponse.usage.prompt_tokens).toBe(15);
      expect(result.transformedResponse.usage.completion_tokens).toBe(25);
      expect(result.transformedResponse.usage.total_tokens).toBe(40);
    });
  });

  describe('Cohere to OpenAI', () => {
    it('should transform basic response', async () => {
      const cohereResponse = {
        generation_id: 'gen_123',
        text: 'Hello from Cohere!',
        finish_reason: 'COMPLETE',
        meta: {
          billed_units: {
            input_tokens: 12,
            output_tokens: 18,
          },
        },
      };

      const result = await transformer.transform(cohereResponse, {
        sourceProvider: 'cohere',
        targetProvider: 'openai',
      });

      expect(result.success).toBe(true);
      expect(result.transformedResponse.object).toBe('chat.completion');
      expect(result.transformedResponse.choices[0].message.content).toBe('Hello from Cohere!');
      expect(result.transformedResponse.choices[0].finish_reason).toBe('stop');
      expect(result.transformedResponse.usage.prompt_tokens).toBe(12);
      expect(result.transformedResponse.usage.completion_tokens).toBe(18);
    });
  });

  describe('OpenAI to Anthropic', () => {
    it('should transform basic response', async () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello from GPT-4!',
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

      const result = await transformer.transform(openaiResponse, {
        sourceProvider: 'openai',
        targetProvider: 'anthropic',
      });

      expect(result.success).toBe(true);
      expect(result.transformedResponse.type).toBe('message');
      expect(result.transformedResponse.role).toBe('assistant');
      expect(result.transformedResponse.content[0].text).toBe('Hello from GPT-4!');
      expect(result.transformedResponse.stop_reason).toBe('end_turn');
      expect(result.transformedResponse.usage.input_tokens).toBe(10);
      expect(result.transformedResponse.usage.output_tokens).toBe(20);
    });
  });
});

describe('TransformationManager', () => {
  let manager: TransformationManager;

  beforeEach(() => {
    manager = new TransformationManager();
  });

  describe('Rule Management', () => {
    it('should add transformation rule', () => {
      const rule = {
        id: 'rule-1',
        name: 'OpenAI to Anthropic',
        description: 'Transform OpenAI requests to Anthropic',
        sourceProvider: 'openai' as const,
        targetProvider: 'anthropic' as const,
        enabled: true,
      };

      manager.addRule(rule);

      const retrieved = manager.getRule('rule-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('OpenAI to Anthropic');
    });

    it('should remove transformation rule', () => {
      const rule = {
        id: 'rule-1',
        name: 'Test Rule',
        description: 'Test',
        sourceProvider: 'openai' as const,
        targetProvider: 'anthropic' as const,
        enabled: true,
      };

      manager.addRule(rule);
      manager.removeRule('rule-1');

      const retrieved = manager.getRule('rule-1');
      expect(retrieved).toBeUndefined();
    });

    it('should enable and disable rules', () => {
      const rule = {
        id: 'rule-1',
        name: 'Test Rule',
        description: 'Test',
        sourceProvider: 'openai' as const,
        targetProvider: 'anthropic' as const,
        enabled: true,
      };

      manager.addRule(rule);
      manager.disableRule('rule-1');

      let retrieved = manager.getRule('rule-1');
      expect(retrieved?.enabled).toBe(false);

      manager.enableRule('rule-1');
      retrieved = manager.getRule('rule-1');
      expect(retrieved?.enabled).toBe(true);
    });
  });

  describe('Rule Matching', () => {
    beforeEach(() => {
      manager.addRule({
        id: 'rule-1',
        name: 'OpenAI to Anthropic for Org A',
        description: 'Test',
        sourceProvider: 'openai',
        targetProvider: 'anthropic',
        enabled: true,
        conditions: {
          organizationId: 'org-a',
        },
      });

      manager.addRule({
        id: 'rule-2',
        name: 'OpenAI to Anthropic for GPT-4',
        description: 'Test',
        sourceProvider: 'openai',
        targetProvider: 'anthropic',
        enabled: true,
        conditions: {
          modelPattern: 'gpt-4.*',
        },
      });
    });

    it('should find rule by organization', () => {
      const rule = manager.findMatchingRule('openai', 'anthropic', {
        organizationId: 'org-a',
      });

      expect(rule).toBeDefined();
      expect(rule?.id).toBe('rule-1');
    });

    it('should find rule by model pattern', () => {
      const rule = manager.findMatchingRule('openai', 'anthropic', {
        model: 'gpt-4-turbo',
      });

      expect(rule).toBeDefined();
      // Returns first matching rule (rule-1 matches because it has no model pattern)
      expect(rule?.id).toBe('rule-1');
    });

    it('should not find disabled rules', () => {
      manager.disableRule('rule-1');

      const rule = manager.findMatchingRule('openai', 'anthropic', {
        organizationId: 'org-a',
      });

      // rule-1 is disabled, but rule-2 still matches (no org condition)
      expect(rule).toBeDefined();
      expect(rule?.id).toBe('rule-2');
    });
  });

  describe('Statistics', () => {
    it('should track rule statistics', () => {
      manager.addRule({
        id: 'rule-1',
        name: 'Rule 1',
        description: 'Test',
        sourceProvider: 'openai',
        targetProvider: 'anthropic',
        enabled: true,
      });

      manager.addRule({
        id: 'rule-2',
        name: 'Rule 2',
        description: 'Test',
        sourceProvider: 'openai',
        targetProvider: 'google',
        enabled: false,
      });

      const stats = manager.getStats();

      expect(stats.totalRules).toBe(2);
      expect(stats.enabledRules).toBe(1);
      expect(stats.disabledRules).toBe(1);
      expect(stats.rulesByProvider['openai->anthropic']).toBe(1);
      expect(stats.rulesByProvider['openai->google']).toBe(1);
    });
  });
});

