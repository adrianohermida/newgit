"use strict";

const path = require("path");

function buildLocalOpsScript(command) {
  return [
    '$ErrorActionPreference = "Stop"',
    'Set-Location -LiteralPath (Resolve-Path "$PSScriptRoot\\..\\..\\..")',
    `npm run ${command}`,
    "",
  ].join("\n");
}

function buildLocalOpsCmd(command) {
  return [
    "@echo off",
    'cd /d "%~dp0\\..\\..\\.."',
    `npm run ${command}`,
    "",
  ].join("\n");
}

function buildLocalOpsFiles(localOpsDir) {
  return [
    { path: path.join(localOpsDir, "run-validate.ps1"), content: buildLocalOpsScript("integration:validate") },
    { path: path.join(localOpsDir, "run-bootstrap.ps1"), content: buildLocalOpsScript("integration:bootstrap") },
    { path: path.join(localOpsDir, "run-go.ps1"), content: buildLocalOpsScript("integration:go") },
    { path: path.join(localOpsDir, "run-sync.ps1"), content: buildLocalOpsScript("integration:sync") },
    { path: path.join(localOpsDir, "run-ops.ps1"), content: buildLocalOpsScript("integration:ops") },
    { path: path.join(localOpsDir, "run-validate.cmd"), content: buildLocalOpsCmd("integration:validate") },
    { path: path.join(localOpsDir, "run-bootstrap.cmd"), content: buildLocalOpsCmd("integration:bootstrap") },
    { path: path.join(localOpsDir, "run-go.cmd"), content: buildLocalOpsCmd("integration:go") },
    { path: path.join(localOpsDir, "run-sync.cmd"), content: buildLocalOpsCmd("integration:sync") },
    { path: path.join(localOpsDir, "run-ops.cmd"), content: buildLocalOpsCmd("integration:ops") },
  ];
}

module.exports = {
  buildLocalOpsFiles,
};
