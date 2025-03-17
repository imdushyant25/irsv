// File: lambda/enrichmentProcessor/processors/index.ts

import { AgeRuleProcessor } from './AgeRuleProcessor';
import { ChannelRuleProcessor } from './ChannelRuleProcessor';
import { DrugLookUpProcessor } from './DrugLookUpProcessor';

// Export an array of processor instances
export const ruleProcessors = [
  new AgeRuleProcessor(),
  new ChannelRuleProcessor(),
  new DrugLookUpProcessor()
];

// Export processor classes for individual import
export { AgeRuleProcessor, ChannelRuleProcessor, DrugLookUpProcessor };