/**
 * Validation System Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JSONSchemaValidator } from '../src/validation/json-schema-validator.js';
import { SchemaRegistry } from '../src/validation/schema-registry.js';
import { ValidationMiddleware } from '../src/validation/validation-middleware.js';
import {
  JSONSchema,
  SchemaDefinition,
  SchemaMapping,
  ValidationContext,
} from '../src/validation/schema-types.js';
import { UnifiedAIRequest, UnifiedAIResponse } from '../src/types/index.js';

describe('JSON Schema Validator', () => {
  let validator: JSONSchemaValidator;

  beforeEach(() => {
    validator = new JSONSchemaValidator();
  });

  describe('Type Validation', () => {
    it('should validate string type', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = validator.validate('hello', schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid string type', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = validator.validate(123, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('TYPE_MISMATCH');
    });

    it('should validate number type', () => {
      const schema: JSONSchema = { type: 'number' };
      const result = validator.validate(42, schema);
      expect(result.valid).toBe(true);
    });

    it('should validate boolean type', () => {
      const schema: JSONSchema = { type: 'boolean' };
      const result = validator.validate(true, schema);
      expect(result.valid).toBe(true);
    });

    it('should validate array type', () => {
      const schema: JSONSchema = { type: 'array' };
      const result = validator.validate([1, 2, 3], schema);
      expect(result.valid).toBe(true);
    });

    it('should validate object type', () => {
      const schema: JSONSchema = { type: 'object' };
      const result = validator.validate({ key: 'value' }, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe('String Validation', () => {
    it('should validate minLength', () => {
      const schema: JSONSchema = { type: 'string', minLength: 5 };
      const result = validator.validate('hello', schema);
      expect(result.valid).toBe(true);
    });

    it('should reject string shorter than minLength', () => {
      const schema: JSONSchema = { type: 'string', minLength: 10 };
      const result = validator.validate('hello', schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MIN_LENGTH_VIOLATION');
    });

    it('should validate maxLength', () => {
      const schema: JSONSchema = { type: 'string', maxLength: 10 };
      const result = validator.validate('hello', schema);
      expect(result.valid).toBe(true);
    });

    it('should reject string longer than maxLength', () => {
      const schema: JSONSchema = { type: 'string', maxLength: 3 };
      const result = validator.validate('hello', schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MAX_LENGTH_VIOLATION');
    });

    it('should validate pattern', () => {
      const schema: JSONSchema = { type: 'string', pattern: '^[a-z]+$' };
      const result = validator.validate('hello', schema);
      expect(result.valid).toBe(true);
    });

    it('should reject string not matching pattern', () => {
      const schema: JSONSchema = { type: 'string', pattern: '^[0-9]+$' };
      const result = validator.validate('hello', schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('PATTERN_MISMATCH');
    });
  });

  describe('Number Validation', () => {
    it('should validate minimum', () => {
      const schema: JSONSchema = { type: 'number', minimum: 0 };
      const result = validator.validate(5, schema);
      expect(result.valid).toBe(true);
    });

    it('should reject number below minimum', () => {
      const schema: JSONSchema = { type: 'number', minimum: 10 };
      const result = validator.validate(5, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MIN_VALUE_VIOLATION');
    });

    it('should validate maximum', () => {
      const schema: JSONSchema = { type: 'number', maximum: 100 };
      const result = validator.validate(50, schema);
      expect(result.valid).toBe(true);
    });

    it('should reject number above maximum', () => {
      const schema: JSONSchema = { type: 'number', maximum: 10 };
      const result = validator.validate(50, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MAX_VALUE_VIOLATION');
    });
  });

  describe('Array Validation', () => {
    it('should validate minItems', () => {
      const schema: JSONSchema = { type: 'array', minItems: 2 };
      const result = validator.validate([1, 2, 3], schema);
      expect(result.valid).toBe(true);
    });

    it('should reject array with fewer items than minItems', () => {
      const schema: JSONSchema = { type: 'array', minItems: 5 };
      const result = validator.validate([1, 2], schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MIN_ITEMS_VIOLATION');
    });

    it('should validate maxItems', () => {
      const schema: JSONSchema = { type: 'array', maxItems: 5 };
      const result = validator.validate([1, 2, 3], schema);
      expect(result.valid).toBe(true);
    });

    it('should reject array with more items than maxItems', () => {
      const schema: JSONSchema = { type: 'array', maxItems: 2 };
      const result = validator.validate([1, 2, 3], schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MAX_ITEMS_VIOLATION');
    });

    it('should validate array items', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'number' },
      };
      const result = validator.validate([1, 2, 3], schema);
      expect(result.valid).toBe(true);
    });

    it('should reject array with invalid items', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'number' },
      };
      const result = validator.validate([1, 'two', 3], schema);
      expect(result.valid).toBe(false);
    });
  });

  describe('Object Validation', () => {
    it('should validate required properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };
      const result = validator.validate({ name: 'John', age: 30 }, schema);
      expect(result.valid).toBe(true);
    });

    it('should reject object missing required properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };
      const result = validator.validate({ name: 'John' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('REQUIRED_PROPERTY_MISSING');
    });

    it('should validate nested properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['name'],
          },
        },
      };
      const result = validator.validate(
        { user: { name: 'John', email: 'john@example.com' } },
        schema
      );
      expect(result.valid).toBe(true);
    });

    it('should reject additional properties when not allowed', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };
      const result = validator.validate({ name: 'John', age: 30 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('ADDITIONAL_PROPERTY_NOT_ALLOWED');
    });
  });

  describe('Enum Validation', () => {
    it('should validate enum values', () => {
      const schema: JSONSchema = {
        type: 'string',
        enum: ['red', 'green', 'blue'],
      };
      const result = validator.validate('red', schema);
      expect(result.valid).toBe(true);
    });

    it('should reject values not in enum', () => {
      const schema: JSONSchema = {
        type: 'string',
        enum: ['red', 'green', 'blue'],
      };
      const result = validator.validate('yellow', schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('ENUM_MISMATCH');
    });
  });

  describe('Const Validation', () => {
    it('should validate const value', () => {
      const schema: JSONSchema = { const: 'fixed-value' };
      const result = validator.validate('fixed-value', schema);
      expect(result.valid).toBe(true);
    });

    it('should reject value not matching const', () => {
      const schema: JSONSchema = { const: 'fixed-value' };
      const result = validator.validate('other-value', schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('CONST_MISMATCH');
    });
  });
});

describe('Schema Registry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  it('should register a schema', () => {
    const schema: Omit<SchemaDefinition, 'createdAt' | 'updatedAt'> = {
      id: 'test-schema',
      name: 'Test Schema',
      version: '1.0.0',
      type: 'json-schema',
      schema: { type: 'object' },
      enabled: true,
      metadata: {},
    };

    const registered = registry.registerSchema(schema);
    expect(registered.id).toBe('test-schema');
    expect(registered.createdAt).toBeDefined();
  });

  it('should get schema by ID', () => {
    const schema: Omit<SchemaDefinition, 'createdAt' | 'updatedAt'> = {
      id: 'test-schema',
      name: 'Test Schema',
      version: '1.0.0',
      type: 'json-schema',
      schema: { type: 'object' },
      enabled: true,
      metadata: {},
    };

    registry.registerSchema(schema);
    const retrieved = registry.getSchema('test-schema');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-schema');
  });

  it('should update schema', () => {
    const schema: Omit<SchemaDefinition, 'createdAt' | 'updatedAt'> = {
      id: 'test-schema',
      name: 'Test Schema',
      version: '1.0.0',
      type: 'json-schema',
      schema: { type: 'object' },
      enabled: true,
      metadata: {},
    };

    registry.registerSchema(schema);
    const updated = registry.updateSchema('test-schema', { version: '1.1.0' });
    expect(updated).toBe(true);

    const retrieved = registry.getSchema('test-schema');
    expect(retrieved?.version).toBe('1.1.0');
  });

  it('should delete schema', () => {
    const schema: Omit<SchemaDefinition, 'createdAt' | 'updatedAt'> = {
      id: 'test-schema',
      name: 'Test Schema',
      version: '1.0.0',
      type: 'json-schema',
      schema: { type: 'object' },
      enabled: true,
      metadata: {},
    };

    registry.registerSchema(schema);
    const deleted = registry.deleteSchema('test-schema');
    expect(deleted).toBe(true);

    const retrieved = registry.getSchema('test-schema');
    expect(retrieved).toBeUndefined();
  });

  it('should list all schemas', () => {
    registry.registerSchema({
      id: 'schema-1',
      name: 'Schema 1',
      version: '1.0.0',
      type: 'json-schema',
      schema: { type: 'object' },
      enabled: true,
      metadata: {},
    });

    registry.registerSchema({
      id: 'schema-2',
      name: 'Schema 2',
      version: '1.0.0',
      type: 'json-schema',
      schema: { type: 'object' },
      enabled: true,
      metadata: {},
    });

    const schemas = registry.listSchemas();
    expect(schemas).toHaveLength(2);
  });
});

describe('Validation Middleware', () => {
  let registry: SchemaRegistry;
  let middleware: ValidationMiddleware;

  beforeEach(() => {
    registry = new SchemaRegistry();
    middleware = new ValidationMiddleware(registry);
  });

  it('should pass validation when no schema is registered', async () => {
    const request: UnifiedAIRequest = {
      provider: 'openai',
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      metadata: {
        correlationId: 'test-123',
        timestamp: Date.now(),
        endpoint: '/v1/chat/completions',
      },
    };

    const result = await middleware.validateRequest(request);
    expect(result.valid).toBe(true);
  });

  it('should get validation statistics', () => {
    const stats = middleware.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalValidations).toBe(0);
  });
});

