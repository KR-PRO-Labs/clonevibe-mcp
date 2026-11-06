# Architecture Map — `@kr-pro-labs/clonevibe-mcp`

## Directory & Module Index (O(1) Navigation)

| File Path | Domain Role | Key Exported Symbols |
| :--- | :--- | :--- |
| `src/types/domain.ts` | Canonical Domain Contracts | `ReferenceSnapshot`, `SymbolNode`, `EngineSliceResult`, `TargetVibeProfile`, `ChameleonGraftResult`, `ParityVerificationReport` |
| `src/ingest/multi-source-ingestor.ts` | Multi-Source Ingestion & Bundle Normalization | `MultiSourceIngestor` (`ingest`, `classifySourceKind`, `normalizeMinifiedBundle`) |
| `src/slicer/polyglot-symbol-extractor.ts` | Polyglot Top-Level AST & Call Graph Extractor | `PolyglotSymbolExtractor` (`extractFromSnapshot`, `extractFromFile`, `extractExternalImports`) |
| `src/slicer/ast-closure-slicer.ts` | Transitive Closure Slicer & Zero-Dep Shim Catalog | `AstClosureSlicer` (`locateFeatureEntrypoints`, `sliceEngineGraph`), `ZERO_DEP_SHIM_CATALOG` |
| `src/chameleon/target-vibe-profiler.ts` | Host Workspace Convention Profiler | `TargetVibeProfiler` (`profileTargetVibe`) |
| `src/chameleon/zero-dep-graft-synthesizer.ts` | Zero-Dep Inliner & Cross-Language Synthesizer | `ZeroDepGraftSynthesizer` (`synthesizeChameleonGraft`, `convertIdentifierCase`) |
| `src/parity/golden-parity-verifier.ts` | Deterministic Golden I/O Parity Verifier | `GoldenParityVerifier` (`verifyEngineParity`) |
| `src/server.ts` | MCP Server & Tool/Resource Dispatcher | `CloneVibeEngine`, `createCloneVibeMcpServer` |
| `src/index.ts` | CLI Entrypoint & Public SDK Barrel | `main` (StdioServerTransport) |
| `tests/clonevibe.test.ts` | E2E Mechanical Verification Suite | Vitest suite covering all 6 tools, polyglot slicing, zero-dep grafting, and parity checks |
