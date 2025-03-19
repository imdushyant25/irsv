"use strict";
// File: lambda/enrichmentProcessor/processors/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrugLookUpProcessor = exports.ruleProcessors = void 0;
const DrugLookUpProcessor_1 = require("./DrugLookUpProcessor");
Object.defineProperty(exports, "DrugLookUpProcessor", { enumerable: true, get: function () { return DrugLookUpProcessor_1.DrugLookUpProcessor; } });
// Export an array of processor instances
exports.ruleProcessors = [
    new DrugLookUpProcessor_1.DrugLookUpProcessor()
];
//# sourceMappingURL=index.js.map