/**
 * Workflow Template Manager
 * 
 * Manages reusable workflow templates with parameters and examples.
 */

import { Logger } from '../utils/logger.js';
import {
  WorkflowTemplate,
  WorkflowDefinition,
  TemplateParameter,
  TemplateExample,
} from './workflow-types.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowTemplateManager {
  private logger: Logger;
  private templates: Map<string, WorkflowTemplate>;

  constructor() {
    this.logger = new Logger();
    this.templates = new Map();
    this.loadDefaultTemplates();
  }

  /**
   * Load default workflow templates
   */
  private loadDefaultTemplates(): void {
    // Template 1: Content Summarization Pipeline
    this.addTemplate({
      id: 'content-summarization',
      name: 'Content Summarization Pipeline',
      description: 'Extract content, summarize it, and generate key points',
      category: 'content',
      workflow: {
        id: 'content-summarization-workflow',
        name: 'Content Summarization',
        version: '1.0.0',
        entryPoint: 'extract',
        steps: [
          {
            id: 'extract',
            name: 'Extract Content',
            type: 'ai_request',
            config: {
              prompt: 'Extract the main content from: {{url}}',
              model: 'gpt-4',
              extractFields: ['content'],
            },
          },
          {
            id: 'summarize',
            name: 'Summarize Content',
            type: 'ai_request',
            dependsOn: ['extract'],
            config: {
              prompt: 'Summarize the following content in {{length}} words:\n\n{{extract.content}}',
              model: 'gpt-4',
              extractFields: ['summary'],
            },
          },
          {
            id: 'key-points',
            name: 'Extract Key Points',
            type: 'ai_request',
            dependsOn: ['extract'],
            config: {
              prompt: 'Extract {{num_points}} key points from:\n\n{{extract.content}}',
              model: 'gpt-3.5-turbo',
              extractFields: ['points'],
            },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      parameters: [
        {
          name: 'url',
          type: 'string',
          description: 'URL of content to summarize',
          required: true,
        },
        {
          name: 'length',
          type: 'number',
          description: 'Summary length in words',
          required: false,
          default: 100,
        },
        {
          name: 'num_points',
          type: 'number',
          description: 'Number of key points to extract',
          required: false,
          default: 5,
        },
      ],
      examples: [
        {
          name: 'Summarize blog post',
          parameters: {
            url: 'https://example.com/blog/post',
            length: 150,
            num_points: 3,
          },
        },
      ],
      tags: ['content', 'summarization', 'extraction'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Template 2: Multi-Language Translation
    this.addTemplate({
      id: 'multi-language-translation',
      name: 'Multi-Language Translation',
      description: 'Translate content into multiple languages in parallel',
      category: 'translation',
      workflow: {
        id: 'translation-workflow',
        name: 'Multi-Language Translation',
        version: '1.0.0',
        entryPoint: 'translate-parallel',
        steps: [
          {
            id: 'translate-parallel',
            name: 'Translate to Multiple Languages',
            type: 'parallel',
            config: {
              steps: ['translate-es', 'translate-fr', 'translate-de'],
              waitForAll: true,
            },
          },
          {
            id: 'translate-es',
            name: 'Translate to Spanish',
            type: 'ai_request',
            config: {
              prompt: 'Translate to Spanish:\n\n{{text}}',
              model: 'gpt-4',
            },
          },
          {
            id: 'translate-fr',
            name: 'Translate to French',
            type: 'ai_request',
            config: {
              prompt: 'Translate to French:\n\n{{text}}',
              model: 'gpt-4',
            },
          },
          {
            id: 'translate-de',
            name: 'Translate to German',
            type: 'ai_request',
            config: {
              prompt: 'Translate to German:\n\n{{text}}',
              model: 'gpt-4',
            },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      parameters: [
        {
          name: 'text',
          type: 'string',
          description: 'Text to translate',
          required: true,
        },
      ],
      examples: [
        {
          name: 'Translate greeting',
          parameters: {
            text: 'Hello, how are you?',
          },
        },
      ],
      tags: ['translation', 'multilingual', 'parallel'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Template 3: Content Quality Check
    this.addTemplate({
      id: 'content-quality-check',
      name: 'Content Quality Check',
      description: 'Analyze content quality with conditional improvements',
      category: 'quality',
      workflow: {
        id: 'quality-check-workflow',
        name: 'Content Quality Check',
        version: '1.0.0',
        entryPoint: 'analyze',
        steps: [
          {
            id: 'analyze',
            name: 'Analyze Content Quality',
            type: 'ai_request',
            config: {
              prompt: 'Analyze the quality of this content and rate it 1-10:\n\n{{content}}',
              model: 'gpt-4',
              extractFields: ['score', 'issues'],
            },
          },
          {
            id: 'check-quality',
            name: 'Check if Improvement Needed',
            type: 'condition',
            dependsOn: ['analyze'],
            config: {
              condition: {
                variable: 'analyze.score',
                operator: 'lt',
                value: 7,
              },
              thenSteps: ['improve'],
              elseSteps: ['approve'],
            },
          },
          {
            id: 'improve',
            name: 'Improve Content',
            type: 'ai_request',
            config: {
              prompt: 'Improve this content based on these issues: {{analyze.issues}}\n\nContent:\n{{content}}',
              model: 'gpt-4',
            },
          },
          {
            id: 'approve',
            name: 'Approve Content',
            type: 'transform',
            config: {
              input: 'content',
              transformations: [],
              output: 'approved_content',
            },
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      parameters: [
        {
          name: 'content',
          type: 'string',
          description: 'Content to check',
          required: true,
        },
      ],
      examples: [
        {
          name: 'Check article quality',
          parameters: {
            content: 'This is a sample article...',
          },
        },
      ],
      tags: ['quality', 'content', 'conditional'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    this.logger.info('Loaded default workflow templates', {
      count: this.templates.size,
    });
  }

  /**
   * Add a template
   */
  addTemplate(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
    this.logger.info('Added workflow template', {
      id: template.id,
      name: template.name,
    });
  }

  /**
   * Get a template by ID
   */
  getTemplate(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * List all templates
   */
  listTemplates(category?: string): WorkflowTemplate[] {
    const templates = Array.from(this.templates.values());
    if (category) {
      return templates.filter(t => t.category === category);
    }
    return templates;
  }

  /**
   * Search templates by tags
   */
  searchByTags(tags: string[]): WorkflowTemplate[] {
    return Array.from(this.templates.values()).filter(template => {
      if (!template.tags) return false;
      return tags.some(tag => template.tags!.includes(tag));
    });
  }

  /**
   * Instantiate a template with parameters
   */
  instantiate(templateId: string, parameters: Record<string, any>): WorkflowDefinition {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate parameters
    this.validateParameters(template.parameters, parameters);

    // Create workflow instance
    const workflow: WorkflowDefinition = {
      ...template.workflow,
      id: uuidv4(),
      variables: {
        ...template.workflow.variables,
        ...parameters,
      },
      metadata: {
        ...template.workflow.metadata,
        templateId,
        instantiatedAt: Date.now(),
      },
    };

    this.logger.info('Instantiated workflow from template', {
      templateId,
      workflowId: workflow.id,
    });

    return workflow;
  }

  /**
   * Validate template parameters
   */
  private validateParameters(
    paramDefs: TemplateParameter[],
    params: Record<string, any>
  ): void {
    for (const paramDef of paramDefs) {
      const value = params[paramDef.name];

      // Check required
      if (paramDef.required && value === undefined) {
        throw new Error(`Required parameter missing: ${paramDef.name}`);
      }

      // Use default if not provided
      if (value === undefined && paramDef.default !== undefined) {
        params[paramDef.name] = paramDef.default;
        continue;
      }

      // Type check
      if (value !== undefined) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== paramDef.type) {
          throw new Error(
            `Parameter ${paramDef.name} has wrong type: expected ${paramDef.type}, got ${actualType}`
          );
        }

        // Validation rules
        if (paramDef.validation) {
          this.validateValue(paramDef.name, value, paramDef.validation);
        }
      }
    }
  }

  /**
   * Validate parameter value
   */
  private validateValue(name: string, value: any, validation: any): void {
    if (validation.min !== undefined && value < validation.min) {
      throw new Error(`Parameter ${name} is below minimum: ${validation.min}`);
    }

    if (validation.max !== undefined && value > validation.max) {
      throw new Error(`Parameter ${name} is above maximum: ${validation.max}`);
    }

    if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
      throw new Error(`Parameter ${name} does not match pattern: ${validation.pattern}`);
    }

    if (validation.enum && !validation.enum.includes(value)) {
      throw new Error(`Parameter ${name} is not in allowed values: ${validation.enum.join(', ')}`);
    }
  }

  /**
   * Delete a template
   */
  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * Get template statistics
   */
  getStats(): {
    totalTemplates: number;
    byCategory: Record<string, number>;
    byTags: Record<string, number>;
  } {
    const templates = Array.from(this.templates.values());
    const byCategory: Record<string, number> = {};
    const byTags: Record<string, number> = {};

    for (const template of templates) {
      byCategory[template.category] = (byCategory[template.category] || 0) + 1;

      if (template.tags) {
        for (const tag of template.tags) {
          byTags[tag] = (byTags[tag] || 0) + 1;
        }
      }
    }

    return {
      totalTemplates: templates.length,
      byCategory,
      byTags,
    };
  }
}

