import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CloneVibeEngine,
  createCloneVibeMcpServer,
  MultiSourceIngestor,
  PolyglotSymbolExtractor,
  AstClosureSlicer,
  TargetVibeProfiler,
  ZeroDepGraftSynthesizer,
  GoldenParityVerifier,
} from '../src/index.js';

describe('@kr-pro-labs/clonevibe-mcp End-to-End Verification Suite', () => {
  it('1. MultiSourceIngestor classifies sources, normalizes minified bundles, and hydrates registry specs', () => {
    const ingestor = new MultiSourceIngestor();

    expect(ingestor.classifySourceKind('https://github.com/KR-PRO-Labs/clonevibe-mcp')).toBe('github');
    expect(ingestor.classifySourceKind('npm:lodash@4.17.21')).toBe('npm');
    expect(ingestor.classifySourceKind('pypi:tiktoken')).toBe('pypi');
    expect(ingestor.classifySourceKind('cargo:ripgrep')).toBe('cargo');
    expect(ingestor.classifySourceKind('https://cdn.example.com/app.min.js')).toBe('bundle');

    const minifiedBundle =
      'export function clampVal(x,min,max){return Math.max(min,Math.min(max,x));}export function scaleRange(v){return clampVal(v*2,0,100);}export function unusedBanner(){return "NOOP";}';
    const bundleSnap = ingestor.ingest({
      sourceUri: 'bundle:app.min.js',
      bundleCode: minifiedBundle,
      bundleLanguage: 'javascript',
    });

    expect(bundleSnap.sourceKind).toBe('bundle');
    expect(bundleSnap.metadata?.normalizedBundle).toBe(true);
    expect(bundleSnap.files[0]?.lineCount).toBeGreaterThan(5);

    const npmSnap = ingestor.ingest({ sourceUri: 'npm:backoff-engine@1.2.0' });
    expect(npmSnap.sourceKind).toBe('npm');
    expect(npmSnap.files.length).toBeGreaterThan(0);

    const pypiSnap = ingestor.ingest({ sourceUri: 'pypi:token-stream' });
    expect(pypiSnap.sourceKind).toBe('pypi');
    expect(pypiSnap.files[0]?.language).toBe('python');

    const cargoSnap = ingestor.ingest({ sourceUri: 'cargo:rolling-window' });
    expect(cargoSnap.sourceKind).toBe('cargo');
    expect(cargoSnap.files[0]?.language).toBe('rust');
  });

  it('2. PolyglotSymbolExtractor extracts functions, structs, types, call edges, and external imports across TS, Python, Rust, and Go', () => {
    const ingestor = new MultiSourceIngestor();
    const extractor = new PolyglotSymbolExtractor();

    const snap = ingestor.ingest({
      sourceUri: 'github:polyglot/reference',
      inlineFiles: [
        {
          relativePath: 'src/table.ts',
          language: 'typescript',
          content: [
            "import { cloneDeep } from 'lodash';",
            "import { v4 as uuidv4 } from 'uuid';",
            '',
            'export interface TableCell {',
            '  value: string;',
            '}',
            '',
            'export function normalizeCell(raw: string): TableCell {',
            '  return cloneDeep({ value: raw.trim() });',
            '}',
            '',
            'export function parseMarkdownRow(line: string): TableCell[] {',
            '  const id = uuidv4();',
            '  void id;',
            '  return line.split("|").map((part) => normalizeCell(part));',
            '}',
          ].join('\n'),
        },
        {
          relativePath: 'src/tokenizer.py',
          language: 'python',
          content: [
            'import hashlib',
            'import requests',
            '',
            'def clean_token(raw: str) -> str:',
            '    return raw.strip().lower()',
            '',
            'def tokenize_sentence(text: str) -> list[str]:',
            '    return [clean_token(tok) for tok in text.split(" ") if tok]',
          ].join('\n'),
        },
        {
          relativePath: 'src/window.rs',
          language: 'rust',
          content: [
            'use serde::Serialize;',
            '',
            'pub struct WindowSpec {',
            '    pub size: usize,',
            '}',
            '',
            'pub fn clamp_size(size: usize) -> usize {',
            '    if size == 0 { 1 } else { size }',
            '}',
            '',
            'pub fn build_window(size: usize) -> WindowSpec {',
            '    WindowSpec { size: clamp_size(size) }',
            '}',
          ].join('\n'),
        },
        {
          relativePath: 'src/hasher.go',
          language: 'go',
          content: [
            'package hasher',
            '',
            'import "github.com/cespare/xxhash/v2"',
            '',
            'type DigestConfig struct {',
            '    Seed uint64',
            '}',
            '',
            'func NormalizePrefix(raw string) string {',
            '    return raw',
            '}',
            '',
            'func ComputeDigest(raw string) string {',
            '    return NormalizePrefix(raw)',
            '}',
          ].join('\n'),
        },
      ],
    });

    const symbols = extractor.extractFromSnapshot(snap);
    const byName = new Map(symbols.map((s) => [s.name, s]));

    expect(byName.get('parseMarkdownRow')?.calls).toContain('normalizeCell');
    expect(byName.get('parseMarkdownRow')?.calls).toContain('TableCell');
    expect(byName.get('parseMarkdownRow')?.externalImports).toEqual(['lodash', 'uuid']);

    expect(byName.get('tokenize_sentence')?.language).toBe('python');
    expect(byName.get('tokenize_sentence')?.calls).toContain('clean_token');
    expect(byName.get('tokenize_sentence')?.externalImports).toContain('requests');

    expect(byName.get('build_window')?.language).toBe('rust');
    expect(byName.get('build_window')?.calls).toContain('clamp_size');
    expect(byName.get('build_window')?.calls).toContain('WindowSpec');

    expect(byName.get('ComputeDigest')?.language).toBe('go');
    expect(byName.get('ComputeDigest')?.calls).toContain('NormalizePrefix');
  });

  it('3. AstClosureSlicer prunes >85% unrelated boilerplate while preserving transitive dependencies and matching Zero-Dep shims', () => {
    const ingestor = new MultiSourceIngestor();
    const slicer = new AstClosureSlicer();

    // Create 17 unrelated bloated functions + 3 connected core engine symbols (20 total -> 85% reduction)
    const bloatedHelpers = Array.from({ length: 17 }, (_, idx) =>
      [
        `export function unrelatedBloatModule${idx + 1}(input: string): string {`,
        `  return "BLOAT_${idx + 1}:" + input;`,
        `}`,
      ].join('\n'),
    ).join('\n\n');

    const coreFile = [
      "import { cloneDeep } from 'lodash';",
      "import { v4 as uuidv4 } from 'uuid';",
      '',
      'export interface MarkdownAstTable {',
      '  id: string;',
      '  headers: string[];',
      '  rows: string[][];',
      '}',
      '',
      'export function splitMarkdownCells(rowLine: string): string[] {',
      '  return rowLine',
      '    .trim()',
      '    .replace(/^\\||\\|$/g, "")',
      '    .split("|")',
      '    .map((cell) => cell.trim());',
      '}',
      '',
      'export function parseMarkdownTableEngine(markdown: string): MarkdownAstTable {',
      '  const lines = markdown.trim().split(/\\r?\\n/).filter(Boolean);',
      '  const headers = lines[0] ? splitMarkdownCells(lines[0]) : [];',
      '  const rows = lines.slice(2).map((line) => splitMarkdownCells(line));',
      '  return cloneDeep({ id: uuidv4(), headers, rows });',
      '}',
    ].join('\n');

    const snapshot = ingestor.ingest({
      sourceUri: 'github:mega-org/monolith-repo',
      inlineFiles: [
        { relativePath: 'src/core/markdown-table.ts', content: coreFile, language: 'typescript' },
        { relativePath: 'src/legacy/bloat.ts', content: bloatedHelpers, language: 'typescript' },
      ],
    });

    const ranked = slicer.locateFeatureEntrypoints(snapshot, 'parse markdown table engine', 3);
    expect(ranked[0]?.symbol.name).toBe('parseMarkdownTableEngine');

    const slice = slicer.sliceEngineGraph(snapshot, [ranked[0]!.symbol.id]);
    expect(slice.totalSymbolsCount).toBe(20);
    expect(slice.keptSymbols.map((s) => s.name)).toEqual([
      'MarkdownAstTable',
      'splitMarkdownCells',
      'parseMarkdownTableEngine',
    ]);
    expect(slice.prunedSymbolsCount).toBe(17);
    expect(slice.boilerplateReductionRatio).toBe(85);
    expect(slice.externalDependencies).toEqual(['lodash', 'uuid']);
    expect(slice.matchedZeroDepShims.map((s) => s.shimId)).toEqual(['shim_deep_clone', 'shim_uuid_v4']);
  });

  it('4. TargetVibeProfiler accurately profiles TypeScript ESM, Python, and local workspace conventions', () => {
    const profiler = new TargetVibeProfiler();

    const tsProfile = profiler.profileTargetVibe({
      sampleCode: [
        'export function computeDelta(inputValue: string): string {',
        '  const normalizedValue = inputValue.trim();',
        '  return normalizedValue;',
        '}',
      ].join('\n'),
      explicitLanguage: 'typescript',
    });
    expect(tsProfile.targetLanguage).toBe('typescript');
    expect(tsProfile.namingStyle).toBe('camelCase');
    expect(tsProfile.indentStyle).toBe('2-spaces');
    expect(tsProfile.semicolons).toBe(true);

    const pyProfile = profiler.profileTargetVibe({
      sampleCode: [
        'def compute_signal_ratio(raw_items: list[int]) -> float:',
        '    if not raw_items:',
        '        return 0.0',
        '    return sum(raw_items) / len(raw_items)',
      ].join('\n'),
    });
    expect(pyProfile.targetLanguage).toBe('python');
    expect(pyProfile.moduleSystem).toBe('python-module');
    expect(pyProfile.namingStyle).toBe('snake_case');
    expect(pyProfile.indentStyle).toBe('4-spaces');
    expect(pyProfile.semicolons).toBe(false);

    const localSelfProfile = profiler.profileTargetVibe({
      workspacePath: path.resolve(import.meta.dirname, '..'),
    });
    expect(localSelfProfile.targetLanguage).toBe('typescript');
    expect(localSelfProfile.moduleSystem).toBe('esm');
  });

  it('5. ZeroDepGraftSynthesizer & GoldenParityVerifier execute full 6-tool pipeline with 0 external dependencies and 100% parity', () => {
    const engine = new CloneVibeEngine();

    const snapshot = engine.ingestReference({
      sourceUri: 'npm:retry-scheduler@2.0.0',
    });
    expect(snapshot.snapshotId).toMatch(/^snap_npm_/);

    const candidates = engine.locateFeatureEntrypoints({
      snapshotId: snapshot.snapshotId,
      featureQuery: 'executeEnginePipeline backoff schedule',
      maxResults: 3,
    });
    expect(candidates.length).toBeGreaterThan(0);

    const slice = engine.sliceEngineGraph({
      snapshotId: snapshot.snapshotId,
      entrypointIds: ['executeEnginePipeline'],
    });
    expect(slice.keptSymbols.length).toBe(4);
    expect(slice.prunedSymbolsCount).toBe(1);

    // Synthesize into TypeScript ESM with snake_case convention
    const tsGraft = engine.synthesizeChameleonGraft({
      sliceId: slice.sliceId,
      engineName: 'RetryBackoffEngine',
      targetProfile: {
        targetLanguage: 'typescript',
        moduleSystem: 'esm',
        namingStyle: 'snake_case',
        indentStyle: '2-spaces',
        quoteStyle: 'single',
        semicolons: true,
        errorHandlingIdiom: 'try-catch-typed',
      },
    });

    expect(tsGraft.externalDepCount).toBe(0);
    expect(tsGraft.inlinedShims).toEqual(['shim_deep_clone', 'shim_uuid_v4']);
    expect(tsGraft.adaptedCode).toContain('function cloneDeep');
    expect(tsGraft.adaptedCode).toContain('function uuidv4');
    expect(tsGraft.adaptedCode).toContain('execute_engine_pipeline');
    expect(tsGraft.adaptedCode).not.toContain("from 'lodash'");
    expect(tsGraft.adaptedCode).not.toContain("from 'uuid'");

    const parityReport = engine.verifyEngineParity({
      sliceId: slice.sliceId,
      graftId: tsGraft.graftId,
      customVectors: [
        {
          id: 'vec_custom_retry_3',
          category: 'deterministic-seed',
          description: '3 retries with 50ms base delay',
          inputPayload: { rawInput: '  hello   world ', config: { maxRetries: 3, baseDelayMs: 50 } },
        },
      ],
    });

    expect(parityReport.verified).toBe(true);
    expect(parityReport.parityScore).toBe(100);
    expect(parityReport.zeroExternalDepsConfirmed).toBe(true);
    expect(parityReport.goldenVectors.length).toBe(6);
    expect(parityReport.generatedTestSuite).toContain('RetryBackoffEngine Golden 1:1 Parity Suite');

    // Verify Unicode Golden Vector preserves real UTF-8 CJK/Emoji characters (no ?? mojibake)
    const unicodeVec = parityReport.goldenVectors.find((v) => v.id === 'vec_unicode_payload');
    expect(JSON.stringify(unicodeVec?.inputPayload)).toContain('한글 Vibe 코딩 🚀');

    // Also test cross-language graft into Python
    const pyGraft = engine.synthesizeChameleonGraft({
      sliceId: slice.sliceId,
      engineName: 'RetryBackoffEngine',
      sampleCode: 'def example_fn():\n    return True\n',
    });
    expect(pyGraft.targetProfile.targetLanguage).toBe('python');
    expect(pyGraft.recommendedFilePath).toBe('src/grafted/retry_backoff_engine.py');
    const pyParity = engine.verifyEngineParity({
      sliceId: slice.sliceId,
      graftId: pyGraft.graftId,
    });
    expect(pyParity.verified).toBe(true);
    expect(pyParity.generatedTestFilePath).toBe('tests/test_retry_backoff_engine.py');
  });

  it('6. MCP Server invokeTool dispatcher, Rust/Go/CommonJS synthesis, and edge-case error handling behave deterministically', () => {
    const { server, engine } = createCloneVibeMcpServer();
    expect(server).toBeDefined();

    // Test empty file edge case
    const emptySnap = engine.invokeTool('ingest_reference', {
      sourceUri: 'local:empty',
      inlineFiles: [{ relativePath: 'src/empty.ts', content: '', language: 'typescript' }],
    }) as { files: Array<{ lineCount: number; byteSize: number }>; snapshotId: string };
    expect(emptySnap.files[0]?.lineCount).toBe(0);
    expect(emptySnap.files[0]?.byteSize).toBe(0);

    // Test CommonJS + Rust + Go graft synthesis via invokeTool
    const snap = engine.invokeTool('ingest_reference', {
      sourceUri: 'cargo:window-engine',
    }) as { snapshotId: string };
    const ranked = engine.invokeTool('locate_feature_entrypoints', {
      snapshotId: snap.snapshotId,
      featureQuery: 'compute_window_delta',
    }) as Array<{ symbol: { id: string } }>;
    expect(ranked.length).toBeGreaterThan(0);

    const slice = engine.invokeTool('slice_engine_graph', {
      snapshotId: snap.snapshotId,
      entrypointIds: [ranked[0]!.symbol.id],
    }) as { sliceId: string };

    const goProfile = engine.invokeTool('profile_target_vibe', {
      explicitLanguage: 'go',
      sampleCode: 'package main\nfunc Main() {}\n',
    });
    const goGraft = engine.invokeTool('synthesize_chameleon_graft', {
      sliceId: slice.sliceId,
      engineName: 'WindowDelta',
      targetProfile: goProfile,
    }) as { graftId: string; recommendedFilePath: string };
    expect(goGraft.recommendedFilePath).toBe('internal/grafted/window_delta.go');

    const goParity = engine.invokeTool('verify_engine_parity', {
      sliceId: slice.sliceId,
      graftId: goGraft.graftId,
    }) as { verified: boolean; generatedTestFilePath: string };
    expect(goParity.verified).toBe(true);
    expect(goParity.generatedTestFilePath).toBe('internal/grafted/window_delta_test.go');

    expect(() =>
      engine.invokeTool('locate_feature_entrypoints', {
        snapshotId: 'snap_nonexistent',
        featureQuery: 'test',
      }),
    ).toThrow(/Snapshot not found/);

    expect(() =>
      engine.invokeTool('synthesize_chameleon_graft', {
        sliceId: 'slice_nonexistent',
      }),
    ).toThrow(/Engine slice not found/);

    expect(() =>
      engine.invokeTool('verify_engine_parity', {
        sliceId: slice.sliceId,
        graftId: 'graft_nonexistent',
      }),
    ).toThrow(/Chameleon graft not found/);

    expect(() => engine.invokeTool('unknown_tool_xyz', {})).toThrow(/Unknown clonevibe-mcp tool/);
  });

  it('7. Lexer-aware comment/string brace balancing, dead-import isolation, gzip stdlib, and quote escaping', () => {
    const ingestor = new MultiSourceIngestor();
    const extractor = new PolyglotSymbolExtractor();
    const slicer = new AstClosureSlicer();
    const synthesizer = new ZeroDepGraftSynthesizer();

    // Python gzip stdlib check
    expect(extractor.extractExternalImports('import gzip\nimport os\nimport requests\n', 'python')).toEqual([
      'requests',
    ]);

    const trickyTsFile = [
      "import { cloneDeep } from 'lodash';",
      "import chalk from 'chalk';",
      '',
      '/*',
      'export function fakeCommentedOutFunction() {',
      '  return "should not be extracted {";',
      '}',
      '*/',
      '',
      'export function parseBraceToken(raw: string): string {',
      '  // Unbalanced opening brace in comment: {',
      '  /* Unbalanced closing brace in block comment: } */',
      '  if (raw.includes("}")) {',
      "    return \"don't panic\";",
      '  }',
      '  // Note: replaces legacyBannerPrinter without calling it',
      '  const tpl = `template with unbalanced { brace`;',
      '  void tpl;',
      '  return cloneDeep(raw.trim());',
      '}',
      '',
      'export function legacyBannerPrinter(msg: string): string {',
      '  return chalk.green(msg);',
      '}',
    ].join('\n');

    const snap = ingestor.ingest({
      sourceUri: 'local:tricky-braces',
      inlineFiles: [{ relativePath: 'src/tricky.ts', content: trickyTsFile, language: 'typescript' }],
    });

    const symbols = extractor.extractFromSnapshot(snap);
    expect(symbols.map((s) => s.name)).toEqual(['parseBraceToken', 'legacyBannerPrinter']);

    const parseNode = symbols.find((s) => s.name === 'parseBraceToken')!;
    expect(parseNode.startLine).toBe(10);
    expect(parseNode.endLine).toBe(20);
    // Comment mentioning legacyBannerPrinter must NOT create a call edge
    expect(parseNode.calls).toEqual([]);
    // Only lodash is used by parseBraceToken; chalk is only used by legacyBannerPrinter
    expect(parseNode.externalImports).toEqual(['lodash']);

    const slice = slicer.sliceEngineGraph(snap, ['parseBraceToken']);
    expect(slice.keptSymbols.map((s) => s.name)).toEqual(['parseBraceToken']);
    expect(slice.externalDependencies).toEqual(['lodash']);
    expect(slice.matchedZeroDepShims.map((s) => s.shimId)).toEqual(['shim_deep_clone']);

    const graft = synthesizer.synthesizeChameleonGraft(
      slice,
      {
        targetLanguage: 'typescript',
        moduleSystem: 'esm',
        namingStyle: 'camelCase',
        indentStyle: '2-spaces',
        quoteStyle: 'single',
        semicolons: true,
        errorHandlingIdiom: 'try-catch-typed',
        detectedFrom: ['test'],
      },
      'BraceParserEngine',
    );
    // Inner apostrophe in "don't panic" must be escaped when converted to single quotes
    expect(graft.adaptedCode).toContain("'don\\'t panic'");
    expect(graft.adaptedCode).not.toContain('ansiColor');
  });

  it('8. Full MCP JSON-RPC Protocol Transport (ListTools, CallTool, ListResources, ReadResource)', async () => {
    const { server } = createCloneVibeMcpServer();
    const client = new Client({ name: 'clonevibe-test-client', version: '1.0.0' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const toolsList = await client.listTools();
    expect(toolsList.tools.map((t) => t.name)).toEqual([
      'ingest_reference',
      'locate_feature_entrypoints',
      'slice_engine_graph',
      'profile_target_vibe',
      'synthesize_chameleon_graft',
      'verify_engine_parity',
    ]);

    const resourcesList = await client.listResources();
    expect(resourcesList.resources.map((r) => r.uri)).toEqual([
      'clonevibe://catalog/zero-dep-shims',
      'clonevibe://guide/chameleon-workflow',
    ]);

    const shimCatalogRes = await client.readResource({ uri: 'clonevibe://catalog/zero-dep-shims' });
    expect(String(shimCatalogRes.contents[0]?.text)).toContain('shim_deep_clone');

    const ingestCall = await client.callTool({
      name: 'ingest_reference',
      arguments: { sourceUri: 'npm:retry-scheduler@2.0.0' },
    });
    expect(ingestCall.isError).toBeFalsy();
    const firstBlock = (ingestCall.content as Array<{ type: string; text: string }>)[0];
    const snapPayload = JSON.parse(firstBlock?.text ?? '{}') as { snapshotId: string };
    expect(snapPayload.snapshotId).toMatch(/^snap_npm_/);

    const errCall = await client.callTool({
      name: 'locate_feature_entrypoints',
      arguments: { snapshotId: 'snap_missing_id', featureQuery: 'backoff' },
    });
    expect(errCall.isError).toBe(true);

    await client.close();
    await server.close();
  });
});
