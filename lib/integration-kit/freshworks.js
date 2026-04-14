"use strict";

const { resolveFreshsalesApiBase, resolveFreshworksConfig } = require("./freshworks-config");
const {
  buildAuthorizeUrl,
  buildFreshworksDiagnostics,
  resolveFreshworksRedirectUri,
  resolveFreshworksScopes,
} = require("./freshworks-oauth");

module.exports = {
  buildAuthorizeUrl,
  buildFreshworksDiagnostics,
  resolveFreshworksConfig,
  resolveFreshworksRedirectUri,
  resolveFreshworksScopes,
  resolveFreshsalesApiBase,
};
