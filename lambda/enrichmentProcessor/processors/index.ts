// File: lambda/enrichmentProcessor/processors/index.ts

import { DrugLookUpProcessor } from './DrugLookUpProcessor';

// Export an array of processor instances
export const ruleProcessors = [
  new DrugLookUpProcessor()
];

// Export processor classes for individual import
export { DrugLookUpProcessor };