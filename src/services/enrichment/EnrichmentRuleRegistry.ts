// File: src/services/enrichment/EnrichmentRuleRegistry.ts
import { query } from '@/lib/db';
import { EnrichmentRule, EnrichmentRuleProcessor } from '@/types/enrichment';
import { DatabaseError } from '@/lib/errors/database';



export class EnrichmentRuleRegistry {
  private processors: Map<string, EnrichmentRuleProcessor> = new Map();
  private rules: EnrichmentRule[] = [];
  private initialized: boolean = false;

  /**
   * Load all active rules from the database
   */
  public async loadRules(): Promise<void> {
    try {
      const result = await query<EnrichmentRule>(`
        SELECT 
          id, 
          name, 
          type, 
          priority, 
          processor_class as "processorClass", 
          parameters, 
          is_active as "isActive",
          created_by as "createdBy",
          created_at as "createdAt",
          updated_by as "updatedBy",
          updated_at as "updatedAt"
        FROM enrichment_rules 
        WHERE is_active = true 
        ORDER BY priority ASC
      `);

      this.rules = result.rows;
      this.initialized = true;
    } catch (error) {
      throw DatabaseError.fromError(error);
    }
  }

  /**
   * Register a processor implementation with the registry
   */
  public registerProcessor(processor: EnrichmentRuleProcessor): void {
    this.processors.set(processor.ruleId, processor);
  }

  /**
   * Get all active processors in priority order
   */
  public getProcessors(): EnrichmentRuleProcessor[] {
    if (!this.initialized) {
      throw new Error('Rule registry not initialized. Call loadRules() first.');
    }

    // Filter rules that have a registered processor
    const activeRules = this.rules.filter(rule => 
      rule.isActive && this.processors.has(rule.id)
    );

    if (activeRules.length === 0) {
        console.warn(`No active rules found. Total rules: ${this.rules.length}, Registered processors: ${this.processors.size}`);
        // List all available processors
        console.log('Registered processor IDs:', Array.from(this.processors.keys()));
        // List all rules
        console.log('Available rules:', this.rules.map(r => ({id: r.id, name: r.name, isActive: r.isActive})));
    }

    // Return processors in priority order
    return activeRules
      .map(rule => this.processors.get(rule.id)!)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get a specific rule by ID
   */
  public getRuleById(ruleId: string): EnrichmentRule | undefined {
    return this.rules.find(rule => rule.id === ruleId);
  }

  /**
   * Get a specific processor by ID
   */
  public getProcessorById(ruleId: string): EnrichmentRuleProcessor | undefined {
    return this.processors.get(ruleId);
  }

  /**
   * Check if the registry is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
 * Get the count of registered processors
 */
    public getProcessorCount(): number {
    return this.processors.size;
  } 

}

// Create a singleton instance
export const enrichmentRuleRegistry = new EnrichmentRuleRegistry();