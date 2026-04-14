"use strict";

const {
  buildHandoffSummary,
  buildLocalOpsReadme,
  buildReadmeTemplate,
  buildReplicationChecklist,
} = require("./bootstrap-docs");
const {
  buildCanonicalProductsTemplate,
  buildLocalOpsEnvExample,
  buildSetupTemplateObject,
} = require("./bootstrap-seeds");

module.exports = {
  buildCanonicalProductsTemplate,
  buildHandoffSummary,
  buildLocalOpsEnvExample,
  buildLocalOpsReadme,
  buildReadmeTemplate,
  buildReplicationChecklist,
  buildSetupTemplateObject,
};
