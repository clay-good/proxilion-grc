/**
 * JSON Schema Validator
 * 
 * Validates data against JSON Schema specifications (Draft 7)
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import {
  JSONSchema,
  ValidationResult,
  ValidationError,
  ValidationContext,
  DataType,
} from './schema-types.js';

export class JSONSchemaValidator {
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Validate data against JSON Schema
   */
  validate(
    data: any,
    schema: JSONSchema,
    context: ValidationContext = this.getDefaultContext()
  ): ValidationResult {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const info: ValidationError[] = [];

    try {
      this.validateSchema(data, schema, [], errors, warnings, info, context);

      const duration = Date.now() - startTime;
      const valid = errors.length === 0;

      this.metrics.increment('schema_validation_total');
      if (valid) {
        this.metrics.increment('schema_validation_success_total');
      } else {
        this.metrics.increment('schema_validation_failure_total');
      }
      this.metrics.histogram('schema_validation_duration_ms', duration);

      return {
        valid,
        errors,
        warnings,
        info,
        metadata: {
          validatedAt: Date.now(),
          duration,
        },
      };
    } catch (error) {
      this.logger.error('Schema validation error', error as Error);
      throw error;
    }
  }

  /**
   * Validate data against schema recursively
   */
  private validateSchema(
    data: any,
    schema: JSONSchema,
    path: string[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[],
    context: ValidationContext
  ): void {
    // Handle $ref
    if (schema.$ref) {
      // In a real implementation, resolve $ref from definitions
      return;
    }

    // Validate type
    if (schema.type) {
      this.validateType(data, schema.type, path, errors);
    }

    // Validate based on type
    const dataType = this.getDataType(data);

    if (dataType === 'object' && typeof data === 'object' && data !== null) {
      this.validateObject(data, schema, path, errors, warnings, info, context);
    } else if (dataType === 'array' && Array.isArray(data)) {
      this.validateArray(data, schema, path, errors, warnings, info, context);
    } else if (dataType === 'string' && typeof data === 'string') {
      this.validateString(data, schema, path, errors);
    } else if (dataType === 'number' && typeof data === 'number') {
      this.validateNumber(data, schema, path, errors);
    }

    // Validate enum
    if (schema.enum) {
      this.validateEnum(data, schema.enum, path, errors);
    }

    // Validate const
    if (schema.const !== undefined) {
      this.validateConst(data, schema.const, path, errors);
    }

    // Validate allOf, anyOf, oneOf
    if (schema.allOf) {
      this.validateAllOf(data, schema.allOf, path, errors, warnings, info, context);
    }
    if (schema.anyOf) {
      this.validateAnyOf(data, schema.anyOf, path, errors, warnings, info, context);
    }
    if (schema.oneOf) {
      this.validateOneOf(data, schema.oneOf, path, errors, warnings, info, context);
    }

    // Validate not
    if (schema.not) {
      this.validateNot(data, schema.not, path, errors, warnings, info, context);
    }
  }

  /**
   * Validate data type
   */
  private validateType(data: any, type: DataType | DataType[], path: string[], errors: ValidationError[]): void {
    const dataType = this.getDataType(data);
    const types = Array.isArray(type) ? type : [type];

    if (!types.includes(dataType)) {
      errors.push({
        field: path.join('.') || 'root',
        message: `Expected type ${types.join(' or ')}, got ${dataType}`,
        severity: 'error',
        code: 'TYPE_MISMATCH',
        value: data,
        expected: types,
        path,
      });
    }
  }

  /**
   * Validate object
   */
  private validateObject(
    data: Record<string, any>,
    schema: JSONSchema,
    path: string[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[],
    context: ValidationContext
  ): void {
    // Validate required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in data)) {
          errors.push({
            field: [...path, prop].join('.'),
            message: `Required property '${prop}' is missing`,
            severity: 'error',
            code: 'REQUIRED_PROPERTY_MISSING',
            path: [...path, prop],
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in data) {
          this.validateSchema(
            data[prop],
            propSchema,
            [...path, prop],
            errors,
            warnings,
            info,
            context
          );
        }
      }
    }

    // Validate additional properties
    if (schema.additionalProperties === false && !context.allowAdditionalProperties) {
      const allowedProps = new Set(Object.keys(schema.properties || {}));
      for (const prop of Object.keys(data)) {
        if (!allowedProps.has(prop)) {
          errors.push({
            field: [...path, prop].join('.'),
            message: `Additional property '${prop}' is not allowed`,
            severity: 'error',
            code: 'ADDITIONAL_PROPERTY_NOT_ALLOWED',
            path: [...path, prop],
          });
        }
      }
    }
  }

  /**
   * Validate array
   */
  private validateArray(
    data: any[],
    schema: JSONSchema,
    path: string[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[],
    context: ValidationContext
  ): void {
    // Validate minItems
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({
        field: path.join('.') || 'root',
        message: `Array must have at least ${schema.minItems} items, got ${data.length}`,
        severity: 'error',
        code: 'MIN_ITEMS_VIOLATION',
        value: data.length,
        expected: schema.minItems,
        path,
      });
    }

    // Validate maxItems
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({
        field: path.join('.') || 'root',
        message: `Array must have at most ${schema.maxItems} items, got ${data.length}`,
        severity: 'error',
        code: 'MAX_ITEMS_VIOLATION',
        value: data.length,
        expected: schema.maxItems,
        path,
      });
    }

    // Validate items
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        this.validateSchema(
          data[i],
          schema.items,
          [...path, String(i)],
          errors,
          warnings,
          info,
          context
        );
      }
    }
  }

  /**
   * Validate string
   */
  private validateString(data: string, schema: JSONSchema, path: string[], errors: ValidationError[]): void {
    // Validate minLength
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        field: path.join('.') || 'root',
        message: `String must be at least ${schema.minLength} characters, got ${data.length}`,
        severity: 'error',
        code: 'MIN_LENGTH_VIOLATION',
        value: data.length,
        expected: schema.minLength,
        path,
      });
    }

    // Validate maxLength
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        field: path.join('.') || 'root',
        message: `String must be at most ${schema.maxLength} characters, got ${data.length}`,
        severity: 'error',
        code: 'MAX_LENGTH_VIOLATION',
        value: data.length,
        expected: schema.maxLength,
        path,
      });
    }

    // Validate pattern
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        errors.push({
          field: path.join('.') || 'root',
          message: `String does not match pattern: ${schema.pattern}`,
          severity: 'error',
          code: 'PATTERN_MISMATCH',
          value: data,
          expected: schema.pattern,
          path,
        });
      }
    }
  }

  /**
   * Validate number
   */
  private validateNumber(data: number, schema: JSONSchema, path: string[], errors: ValidationError[]): void {
    // Validate minimum
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        field: path.join('.') || 'root',
        message: `Number must be at least ${schema.minimum}, got ${data}`,
        severity: 'error',
        code: 'MIN_VALUE_VIOLATION',
        value: data,
        expected: schema.minimum,
        path,
      });
    }

    // Validate maximum
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        field: path.join('.') || 'root',
        message: `Number must be at most ${schema.maximum}, got ${data}`,
        severity: 'error',
        code: 'MAX_VALUE_VIOLATION',
        value: data,
        expected: schema.maximum,
        path,
      });
    }
  }

  // Additional validation methods would continue here...
  private validateEnum(data: any, enumValues: any[], path: string[], errors: ValidationError[]): void {
    if (!enumValues.includes(data)) {
      errors.push({
        field: path.join('.') || 'root',
        message: `Value must be one of: ${enumValues.join(', ')}`,
        severity: 'error',
        code: 'ENUM_MISMATCH',
        value: data,
        expected: enumValues,
        path,
      });
    }
  }

  private validateConst(data: any, constValue: any, path: string[], errors: ValidationError[]): void {
    if (data !== constValue) {
      errors.push({
        field: path.join('.') || 'root',
        message: `Value must be exactly: ${JSON.stringify(constValue)}`,
        severity: 'error',
        code: 'CONST_MISMATCH',
        value: data,
        expected: constValue,
        path,
      });
    }
  }

  private validateAllOf(
    data: any,
    schemas: JSONSchema[],
    path: string[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[],
    context: ValidationContext
  ): void {
    for (const schema of schemas) {
      this.validateSchema(data, schema, path, errors, warnings, info, context);
    }
  }

  private validateAnyOf(
    data: any,
    schemas: JSONSchema[],
    path: string[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[],
    context: ValidationContext
  ): void {
    const tempErrors: ValidationError[] = [];
    let valid = false;

    for (const schema of schemas) {
      const schemaErrors: ValidationError[] = [];
      this.validateSchema(data, schema, path, schemaErrors, [], [], context);
      if (schemaErrors.length === 0) {
        valid = true;
        break;
      }
      tempErrors.push(...schemaErrors);
    }

    if (!valid) {
      errors.push(...tempErrors);
    }
  }

  private validateOneOf(
    data: any,
    schemas: JSONSchema[],
    path: string[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[],
    context: ValidationContext
  ): void {
    let validCount = 0;

    for (const schema of schemas) {
      const schemaErrors: ValidationError[] = [];
      this.validateSchema(data, schema, path, schemaErrors, [], [], context);
      if (schemaErrors.length === 0) {
        validCount++;
      }
    }

    if (validCount !== 1) {
      errors.push({
        field: path.join('.') || 'root',
        message: `Data must match exactly one schema, matched ${validCount}`,
        severity: 'error',
        code: 'ONE_OF_VIOLATION',
        path,
      });
    }
  }

  private validateNot(
    data: any,
    schema: JSONSchema,
    path: string[],
    errors: ValidationError[],
    warnings: ValidationError[],
    info: ValidationError[],
    context: ValidationContext
  ): void {
    const schemaErrors: ValidationError[] = [];
    this.validateSchema(data, schema, path, schemaErrors, [], [], context);
    if (schemaErrors.length === 0) {
      errors.push({
        field: path.join('.') || 'root',
        message: 'Data must not match the schema',
        severity: 'error',
        code: 'NOT_VIOLATION',
        path,
      });
    }
  }

  private getDataType(data: any): DataType {
    if (data === null) return 'null';
    if (Array.isArray(data)) return 'array';
    if (typeof data === 'object') return 'object';
    return typeof data as DataType;
  }

  private getDefaultContext(): ValidationContext {
    return {
      strictMode: false,
      allowAdditionalProperties: false,
      coerceTypes: false,
      removeAdditional: false,
      useDefaults: false,
      validateFormats: true,
    };
  }
}

