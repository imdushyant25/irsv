"use strict";
// File: lambda/enrichmentProcessor/processors/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelRuleProcessor = exports.AgeRuleProcessor = exports.ruleProcessors = void 0;
const AgeRuleProcessor_1 = require("./AgeRuleProcessor");
Object.defineProperty(exports, "AgeRuleProcessor", { enumerable: true, get: function () { return AgeRuleProcessor_1.AgeRuleProcessor; } });
const ChannelRuleProcessor_1 = require("./ChannelRuleProcessor");
Object.defineProperty(exports, "ChannelRuleProcessor", { enumerable: true, get: function () { return ChannelRuleProcessor_1.ChannelRuleProcessor; } });
// Export an array of processor instances
exports.ruleProcessors = [
    new AgeRuleProcessor_1.AgeRuleProcessor(),
    new ChannelRuleProcessor_1.ChannelRuleProcessor()
];
//# sourceMappingURL=index.js.map