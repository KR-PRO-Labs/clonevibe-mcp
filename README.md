# @kr-pro-labs/clonevibe-mcp

[**English**](./README.md) | [**한국어 (Korean)**](./README.ko.md)

[![CI](https://github.com/KR-PRO-Labs/clonevibe-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/KR-PRO-Labs/clonevibe-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0.4-7c3aed)](https://modelcontextprotocol.io/)

**Surgical AST Feature Slicer, Zero-Dependency Chameleon Code Grafter, 1:1 Golden Parity Verifier & Workspace Patch Engine for Vibe Coding.**

During Vibe Coding, engineers frequently discover a specific algorithm, table parser, retry scheduler, physics routine, or state machine buried inside a massive external reference (a 50,000-line GitHub repository, an `npm:`/`pypi:`/`cargo:` package, or a minified JS bundle). Cloning the entire repository or installing bloated dependency trees pollutes your project.

**`clonevibe-mcp`** extracts **only** the minimal transitive AST closure of the target feature, replaces third-party dependencies with lightweight zero-dependency inline micro-shims, adapts the code to your host project's language and style conventions, mechanically proves 1:1 behavioral equivalence via Golden I/O vectors, and generates non-destructive unified diff patches for instant workspace integration.

---

## Architecture Pipeline

```mermaid
flowchart LR
    A["Reference Input\n(GitHub / Local / npm: / pypi: / cargo: / JS Bundle)"] --> B["1. ingest_reference\nMultiSourceIngestor"]
    B --> C["2. locate_feature_entrypoints\nSymbol & Centrality Ranker"]
    C --> D["3. slice_engine_graph\nTransitive AST Closure Slicer"]
    E["4. profile_target_vibe\nChameleon Style Scanner"] --> F["5. synthesize_chameleon_graft\nZero-Dep Inliner & Code Synthesizer"]
    D --> F
    F --> G["6. verify_engine_parity\n1:1 Golden I/O Parity Verifier"]
    F --> H["7. preview_graft_patch\nWorkspace Unified Diff & AST Splicer"]
```

---

## Key Capabilities

- **All-in-One Multi-Source Ingestion**: Ingests local codebases, GitHub URLs, package registry specs (`npm:`, `pypi:`, `cargo:`), inline file maps, and single-line minified JS bundles (with automatic token-aware structural formatting).
- **Polyglot Transitive AST Closure Slicing**: Extracts top-level functions, classes, structs, interfaces, and call edges across **TypeScript, JavaScript, Python, Rust, and Go**, pruning 80%–98% of unrelated repository boilerplate.
- **10-Package Zero-Dependency Micro-Shim Catalog**: Automatically replaces external imports (`lodash`, `uuid`, `axios`, `chalk`, `lru-cache`, `semver`, `crc-32`, `eventemitter3`, `base64`, `limiter`) with self-contained standard-library inline primitives (`externalDepCount === 0`).
- **Auto-Polyfill Transpiler & Language Boundary Hardener**: Automatically transpiles external library call expressions into inline shims, consolidates Go package import headers into clean single blocks, deduplicates Python standard library fallbacks with `from __future__ import annotations`, and encapsulates Rust module namespaces (`pub mod zero_dep_shims`).
- **Chameleon Style & Cross-Language Assimilation**: Profiles your workspace (`camelCase` vs `snake_case` vs `PascalCase`, `esm` vs `commonjs`, quotes, indentation, error handling) and synthesizes drop-in modules and Clean-Room Algorithmic Blueprints.
- **1:1 Golden Parity Verification**: Executes empty, numeric boundary, Unicode/CJK, malformed, and deterministic seed Golden Vectors and emits a ready-to-run host unit test file (`vitest`, `pytest`, `cargo test`, or `go test`).
- **Non-Destructive Workspace Patching**: Generates clean unified diff previews with automatic shim deduplication and supports `append`, `prepend`, and `smart-replace-symbol` strategies.
- **Full MCP Protocol Compliance**: Implements MCP Tools, Resources, and Prompts (`surgical_slice_feature`, `audit_zero_dep_graft`, `explain_algorithmic_blueprint`).
- **Interactive CLI Inspection & Deterministic Benchmark Suite**: Subcommands (`--catalog`, `--profile <dir>`, `--slice <query>`, `--bench`) delivering over 3,000 operations/sec with zero external dependencies.

---

## Interactive CLI Subcommands

```bash
# Print zero-dependency micro-shim catalog (TS, JS, Python, Rust, Go)
node ./dist/index.js --catalog

# Profile a target workspace directory conventions
node ./dist/index.js --profile ./src

# Surgically slice candidate entrypoints for a feature query
node ./dist/index.js --slice "rate limiter" --source ./src

# Execute 7-stage deterministic continuous performance benchmark
node ./dist/index.js --bench

# Machine-readable JSON output
node ./dist/index.js --catalog --json
```

---

## Quick Start & MCP Client Configuration

### Install & Build from Source
```bash
git clone https://github.com/KR-PRO-Labs/clonevibe-mcp.git
cd clonevibe-mcp
npm install
npm run build
npm test
```

### Claude Desktop / Cursor / Windsurf / Antigravity (`mcp_config.json`)
```json
{
  "mcpServers": {
    "clonevibe-mcp": {
      "command": "npx",
      "args": ["-y", "@kr-pro-labs/clonevibe-mcp"]
    }
  }
}
```

---

## MCP Tools Reference

| Tool Name | Description |
| :--- | :--- |
| `ingest_reference` | Hydrates a GitHub URL, local directory, registry spec (`npm:`, `pypi:`, `cargo:`), inline file map, or minified JS bundle into a `ReferenceSnapshot`. |
| `locate_feature_entrypoints` | Scores and ranks symbols in a snapshot against natural-language feature queries and call centrality. |
| `slice_engine_graph` | Computes the minimal transitive AST call/type closure from entrypoint symbols and matches zero-dep shims. |
| `profile_target_vibe` | Inspects a target workspace or code sample to detect language, module system, casing, quotes, indentation, and error-handling idiom. |
| `synthesize_chameleon_graft` | Generates a zero-dependency adapted code module and Clean-Room Algorithmic Blueprint in the target language. |
| `verify_engine_parity` | Verifies 1:1 Golden I/O parity, confirms zero external dependencies, and outputs a runnable test suite. |
| `preview_graft_patch` | Generates a unified diff preview for integrating the graft into a host workspace file with automatic shim deduplication. |

## MCP Prompts

- `surgical_slice_feature` — Guided 7-stage runbook from reference source to unified diff patch preview.
- `audit_zero_dep_graft` — Automated purity audit verifying 0 external runtime package imports.
- `explain_algorithmic_blueprint` — Walkthrough of state transitions, pure signatures, complexity bounds, and invariants.

## MCP Resources

- `clonevibe://catalog/zero-dep-shims` — JSON catalog of 10 zero-dependency inline shims across TypeScript, JavaScript, Python, Rust, and Go (`lodash`, `uuid`, `axios`, `chalk`, `lru-cache`, `semver`, `crc-32`, `eventemitter3`, `base64`, `limiter`).
- `clonevibe://guide/chameleon-workflow` — Markdown guide for executing the 7-stage surgical grafting & patch workflow.

---

## License

MIT © [KR-PRO-Labs](https://github.com/KR-PRO-Labs) & [Julian Vane (`@goooem`)](https://github.com/goooem)
