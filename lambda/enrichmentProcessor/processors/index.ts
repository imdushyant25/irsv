// File: lambda/enrichmentProcessor/processors/index.ts

import { AgeRuleProcessor } from './AgeRuleProcessor';
import { ChannelRuleProcessor } from './ChannelRuleProcessor';

// Export an array of processor instances
export const ruleProcessors = [
  new AgeRuleProcessor(),
  new ChannelRuleProcessor()
];

// Export processor classes for individual import
export { AgeRuleProcessor, ChannelRuleProcessor };