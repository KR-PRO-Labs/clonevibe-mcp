# Architecture Map — `@kr-pro-labs/clonevibe-mcp`

## Directory & Module Index (O(1) Navigation)

| File Path | Domain Role | Key Exported Symbols |
| :--- | :--- | :--- |
| `src/types/domain.ts` | Canonical Domain Contracts | `ReferenceSnapshot`, `SymbolNode`, `EngineSliceResult`, `TargetVibeProfile`, `ChameleonGraftResult`, `ParityVerificationReport`, `GraftPatchResult`, `PreviewGraftPatchInput` |
| `src/ingest/multi-source-ingestor.ts` | Multi-Source Ingestion & Bundle Normalization | `MultiSourceIngestor` (`ingest`, `classifySourceKind`, `normalizeMinifiedBundle`) |
| `src/slicer/polyglot-symbol-extractor.ts` | Polyglot Top-Level AST & Call Graph Extractor | `PolyglotSymbolExtractor` (`extractFromSnapshot`, `extractFromFile`, `extractExternalImports`) |
| `src/slicer/ast-closure-slicer.ts` | Transitive Closure Slicer & 8-Package Zero-Dep Shim Catalog | `AstClosureSlicer` (`locateFeatureEntrypoints`, `sliceEngineGraph`), `ZERO_DEP_SHIM_CATALOG` (`lodash`, `uuid`, `axios`, `chalk`, `lru-cache`, `semver`, `crc-32`, `eventemitter3`) |
| `src/chameleon/target-vibe-profiler.ts` | Host Workspace Convention Profiler | `TargetVibeProfiler` (`profileTargetVibe`) |
| `src/chameleon/zero-dep-graft-synthesizer.ts` | Zero-Dep Inliner & Cross-Language Synthesizer | `ZeroDepGraftSynthesizer` (`synthesizeChameleonGraft`, `convertIdentifierCase`) |
| `src/chameleon/graft-patch-generator.ts` | Non-Destructive Unified Diff & AST Patch Engine | `GraftPatchGenerator` (`generatePatch`, `getPatch`) |
| `src/parity/golden-parity-verifier.ts` | Deterministic Golden I/O Parity Verifier | `GoldenParityVerifier` (`verifyEngineParity`) |
| `src/server.ts` | MCP Server, 7-Tool Engine, 2 Resources & 3 Prompts Dispatcher | `CloneVibeEngine`, `createCloneVibeMcpServer` |
| `src/index.ts` | CLI Entrypoint & Public SDK Barrel | `main` (StdioServerTransport) |
| `tests/clonevibe.test.ts` | E2E Mechanical Verification Suite | 10 comprehensive tests covering all 7 MCP tools, 8 micro-shims, 3 prompts, polyglot slicing, and patch generation |
