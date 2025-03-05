// File: src/types/mapping.ts

export interface StandardField {
    id: string;
    productId: string;
    fieldName: string;
    displayName: string;
    description?: string;
    dataType: FieldDataType;
    requirementLevel: RequirementLevel;
    validationRules?: ValidationRule[];
    isActive: boolean;
    displayOrder: number;
  }
  
  export interface MappingTemplate {
    id: string;
    templateName: string;
    fileId?: string;
    opportunityId: string;
    productId: string;
    isActive: boolean;
    createdBy: string;
    createdAt: Date;
    updatedBy?: string;
    updatedAt?: Date;
  }
  
  export interface TemplateMapping {
    id: string;
    templateId: string;
    sourceColumn: string;
    standardFieldId: string;
    transformationRule?: TransformationRule;
  }
  
  export enum FieldDataType {
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    DATE = 'DATE',
    BOOLEAN = 'BOOLEAN',
    ENUM = 'ENUM'
  }
  
  export enum RequirementLevel {
    CRITICAL = 'CRITICAL',
    REQUIRED = 'REQUIRED',
    RECOMMENDED = 'RECOMMENDED',
    OPTIONAL = 'OPTIONAL'
  }
  
  export interface ValidationRule {
    type: ValidationRuleType;
    params: Record<string, any>;
  }
  
  export enum ValidationRuleType {
    MIN_LENGTH = 'MIN_LENGTH',
    MAX_LENGTH = 'MAX_LENGTH',
    PATTERN = 'PATTERN',
    MIN_VALUE = 'MIN_VALUE',
    MAX_VALUE = 'MAX_VALUE',
    ENUM_VALUES = 'ENUM_VALUES',
    DATE_FORMAT = 'DATE_FORMAT',
    CUSTOM = 'CUSTOM'
  }
  
  export interface TransformationRule {
    type: TransformationType;
    params: Record<string, any>;
  }
  
  export enum TransformationType {
    TRIM = 'TRIM',
    UPPERCASE = 'UPPERCASE',
    LOWERCASE = 'LOWERCASE',
    DATE_FORMAT = 'DATE_FORMAT',
    NUMBER_FORMAT = 'NUMBER_FORMAT',
    REPLACE = 'REPLACE',
    CUSTOM = 'CUSTOM'
  }