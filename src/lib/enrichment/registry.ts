// File: src/lib/enrichment/registry.ts

import { ClaimRecord } from '@/types/claims';
import { query } from '@/lib/db';

/**
 * Interface defining the result of an enrichment operation
 */
export interface EnrichmentResult {
  success: boolean;
  fields?: Record<string, any>;
  error?: string;
  errorDetails?: any;
}

/**
 * Supported enrichment rule types
 */
export type RuleType = 'DEMOGRAPHIC' | 'PRODUCT';

/**
 * Configuration for rule processors
 */
export interface ProcessorConfig {
  ruleId: string;
  name: string;
  type: RuleType;
  priority: number;
}

/**
 * Database rule definition
 */
export interface RuleDefinition {
  id: string;
  name: string;
  type: RuleType;
  priority: number;
  processor_class: string;
  product_id: string;
}

/**
 * Interface that all enrichment rule processors must implement
 */
export interface EnrichmentRuleProcessor {
  ruleId: string;
  name: string;
  type: RuleType;
  priority: number;
  process(claim: ClaimRecord, parameters: any): Promise<EnrichmentResult>;
  validate(parameters: any): boolean;
}

/**
 * Base class that provides common functionality for rule processors
 */
export abstract class BaseProcessor implements EnrichmentRuleProcessor {
  ruleId: string;
  name: string;
  type: RuleType;
  priority: number;

  constructor(config: ProcessorConfig) {
    this.ruleId = config.ruleId;
    this.name = config.name;
    this.type = config.type;
    this.priority = config.priority;
  }

  abstract process(claim: ClaimRecord, parameters: any): Promise<EnrichmentResult>;
  abstract validate(parameters: any): boolean;
}

/**
 * Registry for managing and instantiating rule processors
 */
export class ProcessorRegistry {
  private static instance: ProcessorRegistry;
  private processors: Map<string, new (config: ProcessorConfig) => EnrichmentRuleProcessor>;

  private constructor() {
    this.processors = new Map();
  }

  /**
   * Get singleton instance of the registry
   */
  static getInstance(): ProcessorRegistry {
    if (!ProcessorRegistry.instance) {
      ProcessorRegistry.instance = new ProcessorRegistry();
    }
    return ProcessorRegistry.instance;
  }

  /**
   * Register a processor class with the registry
   */
  register(className: string, processorClass: new (config: ProcessorConfig) => EnrichmentRuleProcessor) {
    this.processors.set(className, processorClass);
  }

  /**
   * Create a processor instance from a rule definition
   */
  async createProcessor(rule: RuleDefinition): Promise<EnrichmentRuleProcessor | null> {
    const ProcessorClass = this.processors.get(rule.processor_class);
    
    if (!ProcessorClass) {
      console.error(`Processor class ${rule.processor_class} not found in registry`);
      return null;
    }

    try {
      return new ProcessorClass({
        ruleId: rule.id,
        name: rule.name,
        type: rule.type,
        priority: rule.priority
      });
    } catch (error) {
      console.error(`Error creating processor ${rule.processor_class}:`, error);
      return null;
    }
  }

  /**
   * Get all active processors for a specific product
   */
  async getActiveProcessors(productId: string): Promise<EnrichmentRuleProcessor[]> {
    try {
      // Get active rules from database
      const result = await query<RuleDefinition>(`
        SELECT 
          id,
          name,
          type as "type",
          priority,
          processor_class,
          product_id
        FROM enrichment_rules 
        WHERE product_id = $1 
        AND is_active = true
        ORDER BY priority ASC
      `, [productId]);

      // Create processors for each rule
      const processors = await Promise.all(
        result.rows.map(rule => this.createProcessor({
          id: rule.id,
          name: rule.name,
          type: rule.type as RuleType,
          priority: rule.priority,
          processor_class: rule.processor_class,
          product_id: rule.product_id
        }))
      );

      // Filter out any null processors (in case of errors)
      return processors.filter((p): p is EnrichmentRuleProcessor => p !== null);
    } catch (error) {
      console.error('Error getting active processors:', error);
      throw error;
    }
  }

  /**
   * Get list of registered processor class names
   */
  getRegisteredProcessors(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * Check if a processor class is registered
   */
  hasProcessor(className: string): boolean {
    return this.processors.has(className);
  }
}

// Create and export singleton instance
export const processorRegistry = ProcessorRegistry.getInstance();