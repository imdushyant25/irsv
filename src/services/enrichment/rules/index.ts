// File: src/services/enrichment/rules/index.ts
import { AgeRulesProcessor } from './AgeRulesProcessor';
import { ChannelRuleProcessor } from './ChannelRuleProcessor';
import { enrichmentRuleRegistry } from '../EnrichmentRuleRegistry';

/**
 * Register all available rule processors with the registry
 */
export function registerRuleProcessors() {
  // Create and register the Age Rules Processor
  const ageRulesProcessor = new AgeRulesProcessor();
  enrichmentRuleRegistry.registerProcessor(ageRulesProcessor);

  // Create and register the Channel Rules Processor
  const channelRulesProcessor = new ChannelRuleProcessor();
  enrichmentRuleRegistry.registerProcessor(channelRulesProcessor);
  
  // Log successful registration
  console.log(`Registered ${enrichmentRuleRegistry.getProcessorCount()} enrichment rule processors`);
}