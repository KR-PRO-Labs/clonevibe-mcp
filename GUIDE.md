# GUIDE.md ? @kr-pro-labs/clonevibe-mcp Workspace Guide

## 1. Overview
`@kr-pro-labs/clonevibe-mcp` is a Model Context Protocol (MCP) server engineered for **surgical AST feature slicing, zero-dependency Chameleon code grafting, and 1:1 Golden I/O parity verification** during Vibe Coding.

- **Organization**: [`KR-PRO-Labs`](https://github.com/KR-PRO-Labs/clonevibe-mcp)
- **Maintainer**: Julian Vane ([`@goooem`](https://github.com/goooem) / [`@m09876678`](https://gitlab.com/m09876678) / [`@fsareawr`](https://huggingface.co/fsareawr))
- **Runtime**: Node.js >= 20 (TypeScript 5.7+ Strict ESM, `module: "NodeNext"`)

## 2. Core Commands
```bash
npm install          # Install dependencies
npm run typecheck    # Strict TypeScript check (tsc --noEmit)
npm test             # Run Vitest unit & E2E parity suite
npm run build        # Compile TypeScript to dist/
npm start            # Launch MCP stdio server (dist/index.js)
```

## 3. 6-Stage Pipeline
1. **`ingest_reference`** (`src/ingest/multi-source-ingestor.ts`): Hydrate GitHub URLs, local repos, registry specs (`npm:`, `pypi:`, `cargo:`), or minified JS bundles into an indexed `ReferenceSnapshot`.
2. **`locate_feature_entrypoints`** (`src/slicer/ast-closure-slicer.ts`): Score and rank candidate symbols matching natural-language feature queries.
3. **`slice_engine_graph`** (`src/slicer/ast-closure-slicer.ts`): Compute the minimal transitive AST call/type closure and map external imports to inline zero-dep shims.
4. **`profile_target_vibe`** (`src/chameleon/target-vibe-profiler.ts`): Detect target workspace language, module system, identifier casing, quotes, indentation, and error idiom.
5. **`synthesize_chameleon_graft`** (`src/chameleon/zero-dep-graft-synthesizer.ts`): Synthesize a zero-dependency code module and Clean-Room Algorithmic Blueprint matching the host project's conventions.
6. **`verify_engine_parity`** (`src/parity/golden-parity-verifier.ts`): Run deterministic Golden I/O vectors to prove 1:1 parity and emit a runnable host test suite.
