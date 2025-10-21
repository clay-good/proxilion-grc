/**
 * Prompt Template Engine
 * 
 * Reusable prompt templates with:
 * - Variable substitution
 * - Conditional logic
 * - Loops and iterations
 * - Template validation
 * - Type checking
 * - Default values
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;              // Template content with {{variables}}
  variables: TemplateVariable[];
  category: string;
  tags: string[];
  author: string;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  rating?: number;              // Average rating (1-5)
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
    enum?: any[];
  };
}

export interface RenderOptions {
  strict?: boolean;             // Throw error on missing variables
  escapeHtml?: boolean;         // Escape HTML in variables
  preserveWhitespace?: boolean; // Preserve whitespace
}

export interface RenderResult {
  success: boolean;
  content?: string;
  errors?: string[];
  warnings?: string[];
  variables: Record<string, any>;
  renderTimeMs: number;
}

export class PromptTemplateEngine {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  // Storage
  private templates: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    // Initialize with common templates
    this.initializeDefaultTemplates();
  }

  /**
   * Register a template
   */
  registerTemplate(template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): PromptTemplate {
    const fullTemplate: PromptTemplate = {
      ...template,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
    };

    this.templates.set(fullTemplate.id, fullTemplate);

    this.logger.info('Template registered', {
      templateId: fullTemplate.id,
      name: fullTemplate.name,
    });

    this.metrics.increment('prompt_template_registered_total', 1, {
      category: fullTemplate.category,
    });

    return fullTemplate;
  }

  /**
   * Render a template with variables
   */
  render(
    templateId: string,
    variables: Record<string, any>,
    options: RenderOptions = {}
  ): RenderResult {
    const startTime = Date.now();
    const template = this.templates.get(templateId);

    if (!template) {
      return {
        success: false,
        errors: [`Template not found: ${templateId}`],
        variables,
        renderTimeMs: Date.now() - startTime,
      };
    }

    // Validate variables
    const validation = this.validateVariables(template, variables, options.strict || false);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        warnings: validation.warnings,
        variables,
        renderTimeMs: Date.now() - startTime,
      };
    }

    // Merge with defaults
    const mergedVariables = this.mergeWithDefaults(template, variables);

    // Render template
    try {
      let content = template.content;

      // Replace variables
      content = this.replaceVariables(content, mergedVariables, options);

      // Process conditionals
      content = this.processConditionals(content, mergedVariables);

      // Process loops
      content = this.processLoops(content, mergedVariables);

      // Clean up whitespace if needed
      if (!options.preserveWhitespace) {
        content = this.cleanWhitespace(content);
      }

      // Update usage count
      template.usageCount++;
      template.updatedAt = Date.now();

      this.metrics.increment('prompt_template_rendered_total', 1, {
        templateId: template.id,
        category: template.category,
      });

      this.metrics.histogram('prompt_template_render_duration_ms', Date.now() - startTime, {
        templateId: template.id,
      });

      return {
        success: true,
        content,
        warnings: validation.warnings,
        variables: mergedVariables,
        renderTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error('Template render failed', error as Error, {
        templateId,
      });

      return {
        success: false,
        errors: [(error as Error).message],
        variables: mergedVariables,
        renderTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate variables against template
   */
  private validateVariables(
    template: PromptTemplate,
    variables: Record<string, any>,
    strict: boolean
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const varDef of template.variables) {
      const value = variables[varDef.name];

      // Check required
      if (varDef.required && value === undefined) {
        if (varDef.defaultValue === undefined) {
          errors.push(`Required variable missing: ${varDef.name}`);
        } else {
          warnings.push(`Using default value for: ${varDef.name}`);
        }
        continue;
      }

      if (value === undefined) continue;

      // Check type
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== varDef.type) {
        errors.push(`Type mismatch for ${varDef.name}: expected ${varDef.type}, got ${actualType}`);
        continue;
      }

      // Validate based on type
      if (varDef.validation) {
        const validation = varDef.validation;

        if (varDef.type === 'string') {
          if (validation.minLength && value.length < validation.minLength) {
            errors.push(`${varDef.name} too short (min: ${validation.minLength})`);
          }
          if (validation.maxLength && value.length > validation.maxLength) {
            errors.push(`${varDef.name} too long (max: ${validation.maxLength})`);
          }
          if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
            errors.push(`${varDef.name} does not match pattern`);
          }
        }

        if (varDef.type === 'number') {
          if (validation.min !== undefined && value < validation.min) {
            errors.push(`${varDef.name} too small (min: ${validation.min})`);
          }
          if (validation.max !== undefined && value > validation.max) {
            errors.push(`${varDef.name} too large (max: ${validation.max})`);
          }
        }

        if (validation.enum && !validation.enum.includes(value)) {
          errors.push(`${varDef.name} must be one of: ${validation.enum.join(', ')}`);
        }
      }
    }

    // Check for extra variables in strict mode
    if (strict) {
      const definedVars = new Set(template.variables.map(v => v.name));
      for (const key of Object.keys(variables)) {
        if (!definedVars.has(key)) {
          warnings.push(`Unknown variable: ${key}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Merge variables with defaults
   */
  private mergeWithDefaults(
    template: PromptTemplate,
    variables: Record<string, any>
  ): Record<string, any> {
    const merged = { ...variables };

    for (const varDef of template.variables) {
      if (merged[varDef.name] === undefined && varDef.defaultValue !== undefined) {
        merged[varDef.name] = varDef.defaultValue;
      }
    }

    return merged;
  }

  /**
   * Replace variables in content
   */
  private replaceVariables(
    content: string,
    variables: Record<string, any>,
    options: RenderOptions
  ): string {
    return content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = variables[varName];
      
      if (value === undefined) {
        return match; // Keep placeholder if variable not found
      }

      let stringValue = String(value);

      // Escape HTML if needed
      if (options.escapeHtml) {
        stringValue = this.escapeHtml(stringValue);
      }

      return stringValue;
    });
  }

  /**
   * Process conditional blocks: {{#if condition}}...{{/if}}
   */
  private processConditionals(content: string, variables: Record<string, any>): string {
    const regex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    return content.replace(regex, (match, condition, block) => {
      const value = variables[condition];
      return value ? block : '';
    });
  }

  /**
   * Process loop blocks: {{#each items}}...{{/each}}
   */
  private processLoops(content: string, variables: Record<string, any>): string {
    const regex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    
    return content.replace(regex, (match, arrayName, block) => {
      const array = variables[arrayName];
      
      if (!Array.isArray(array)) {
        return '';
      }

      return array.map((item, index) => {
        let itemBlock = block;
        
        // Replace {{this}} with item value
        itemBlock = itemBlock.replace(/\{\{this\}\}/g, String(item));
        
        // Replace {{@index}} with index
        itemBlock = itemBlock.replace(/\{\{@index\}\}/g, String(index));
        
        // If item is object, replace {{property}}
        if (typeof item === 'object' && item !== null) {
          for (const [key, value] of Object.entries(item)) {
            itemBlock = itemBlock.replace(
              new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
              String(value)
            );
          }
        }
        
        return itemBlock;
      }).join('');
    });
  }

  /**
   * Clean up extra whitespace
   */
  private cleanWhitespace(content: string): string {
    return content
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove multiple blank lines
      .trim();
  }

  /**
   * Escape HTML
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): PromptTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Get all templates
   */
  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Search templates
   */
  searchTemplates(query: {
    category?: string;
    tags?: string[];
    name?: string;
  }): PromptTemplate[] {
    let results = this.getAllTemplates();

    if (query.category) {
      results = results.filter(t => t.category === query.category);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(t => 
        query.tags!.some(tag => t.tags.includes(tag))
      );
    }

    if (query.name) {
      const lowerQuery = query.name.toLowerCase();
      results = results.filter(t => 
        t.name.toLowerCase().includes(lowerQuery) ||
        t.description.toLowerCase().includes(lowerQuery)
      );
    }

    return results;
  }

  /**
   * Initialize default templates
   */
  private initializeDefaultTemplates(): void {
    // Code generation template
    this.registerTemplate({
      name: 'Code Generation',
      description: 'Generate code in a specific programming language',
      content: `Generate {{language}} code that {{task}}.

Requirements:
{{#each requirements}}
- {{this}}
{{/each}}

{{#if includeTests}}
Include unit tests.
{{/if}}

Return only the code without explanations.`,
      variables: [
        { name: 'language', type: 'string', required: true, description: 'Programming language' },
        { name: 'task', type: 'string', required: true, description: 'Task description' },
        { name: 'requirements', type: 'array', required: false, defaultValue: [] },
        { name: 'includeTests', type: 'boolean', required: false, defaultValue: false },
      ],
      category: 'code',
      tags: ['code', 'generation', 'programming'],
      author: 'system',
    });

    // Summarization template
    this.registerTemplate({
      name: 'Text Summarization',
      description: 'Summarize text to a specific length',
      content: `Summarize the following text in {{maxWords}} words or less:

{{text}}

{{#if format}}
Format: {{format}}
{{/if}}`,
      variables: [
        { name: 'text', type: 'string', required: true, description: 'Text to summarize' },
        { name: 'maxWords', type: 'number', required: true, defaultValue: 100 },
        { name: 'format', type: 'string', required: false, validation: { enum: ['bullet-points', 'paragraph', 'key-points'] } },
      ],
      category: 'text',
      tags: ['summarization', 'text', 'nlp'],
      author: 'system',
    });
  }
}

