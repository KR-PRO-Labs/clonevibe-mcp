# Architecture Map — `@kr-pro-labs/clonevibe-mcp`

## Directory & Module Index (O(1) Navigation)

| File Path | Domain Role | Key Exported Symbols |
| :--- | :--- | :--- |
| `src/types/domain.ts` | Canonical Domain Contracts | `ReferenceSnapshot`, `SymbolNode`, `EngineSliceResult`, `TargetVibeProfile`, `ChameleonGraftResult`, `ParityVerificationReport`, `GraftPatchResult`, `PreviewGraftPatchInput`, `BenchmarkSuiteResult`, `BenchmarkItemResult`, `PolyfillTranspileOptions` |
| `src/ingest/multi-source-ingestor.ts` | Multi-Source Ingestion & Bundle Normalization | `MultiSourceIngestor` (`ingest`, `classifySourceKind`, `normalizeMinifiedBundle`) |
| `src/slicer/polyglot-symbol-extractor.ts` | Polyglot Top-Level AST & Call Graph Extractor | `PolyglotSymbolExtractor` (`extractFromSnapshot`, `extractFromFile`, `extractExternalImports`) |
| `src/slicer/ast-closure-slicer.ts` | Transitive Closure Slicer & 10-Package Zero-Dep Shim Catalog | `AstClosureSlicer` (`locateFeatureEntrypoints`, `sliceEngineGraph`), `ZERO_DEP_SHIM_CATALOG` (`lodash`, `uuid`, `axios`, `chalk`, `lru-cache`, `semver`, `crc-32`, `eventemitter3`, `base64`, `limiter`) |
| `src/chameleon/target-vibe-profiler.ts` | Host Workspace Convention Profiler | `TargetVibeProfiler` (`profileTargetVibe`) |
| `src/chameleon/zero-dep-graft-synthesizer.ts` | Zero-Dep Inliner & Cross-Language Synthesizer | `ZeroDepGraftSynthesizer` (`synthesizeChameleonGraft`, `convertIdentifierCase`) |
| `src/chameleon/polyfill-transpiler.ts` | Auto-Polyfill Transpiler & Language Boundary Hardener | `AutoPolyfillTranspiler` (`consolidateGoModule`, `consolidatePythonModule`, `consolidateRustModule`, `transpileAstCallExpressions`) |
| `src/chameleon/graft-patch-generator.ts` | Non-Destructive Unified Diff & AST Patch Engine | `GraftPatchGenerator` (`generatePatch`, `getPatch`) |
| `src/parity/golden-parity-verifier.ts` | Deterministic Golden I/O Parity Verifier | `GoldenParityVerifier` (`verifyEngineParity`) |
| `src/bench/benchmark-runner.ts` | Deterministic Continuous Performance Benchmark Runner | `BenchmarkRunner` (`runDeterministicBenchmarks`, `formatBenchmarkReport`) |
| `src/cli.ts` | Interactive CLI Inspection & Benchmark Subcommands | `runCli` (`--catalog`, `--profile`, `--slice`, `--bench`, `--version`, `--help`) |
| `src/server.ts` | MCP Server, 7-Tool Engine, 2 Resources & 3 Prompts Dispatcher | `CloneVibeEngine`, `createCloneVibeMcpServer` |
| `src/index.ts` | CLI Entrypoint & Public SDK Barrel | `main` (StdioServerTransport / CLI router) |
| `tests/clonevibe.test.ts` | E2E Mechanical Verification Suite | 12 comprehensive tests covering all 7 MCP tools, 10 micro-shims, 3 prompts, auto-polyfill transpiler, benchmark harness, and interactive CLI |
