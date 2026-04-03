# Rust port foundation

This directory contains the first compatibility-first Rust foundation for a drop-in Lawdesk CLI replacement.

## Current milestone

This initial milestone focuses on **harness-first scaffolding**, not full feature parity:

- a Cargo workspace aligned to major upstream seams
- a placeholder CLI crate (`rusty-lawdesk-cli`)
- runtime, command, and tool registry skeleton crates
- a `compat-harness` crate that reads the upstream TypeScript sources in `../src/`
- tests that prove upstream manifests/bootstrap hints can be extracted from the leaked TypeScript codebase

## Workspace layout

```text
rust/
├── Cargo.toml
├── README.md
├── crates/
│   ├── rusty-lawdesk-cli/
│   ├── runtime/
│   ├── commands/
│   ├── tools/
│   └── compat-harness/
└── tests/
```

## How to use

From this directory:

```bash
cargo fmt --all
cargo check --workspace
cargo test --workspace
cargo run -p rusty-lawdesk-cli -- --help
cargo run -p rusty-lawdesk-cli -- dump-manifests
cargo run -p rusty-lawdesk-cli -- bootstrap-plan
```

## Design notes

The shape follows the PRD's harness-first recommendation:

1. Extract observable upstream command/tool/bootstrap facts first.
2. Keep Rust module boundaries recognizable.
3. Grow runtime compatibility behind proof artifacts.
4. Document explicit gaps instead of implying drop-in parity too early.

## Relationship to the root README

The repository root README explains the leaked TypeScript codebase. This document tracks the Rust replacement effort that lives in `rust/`.
