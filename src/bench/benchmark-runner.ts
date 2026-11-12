import * as os from 'node:os';
import { MultiSourceIngestor } from '../ingest/multi-source-ingestor.js';
import { PolyglotSymbolExtractor } from '../slicer/polyglot-symbol-extractor.js';
import { AstClosureSlicer } from '../slicer/ast-closure-slicer.js';
import { TargetVibeProfiler } from '../chameleon/target-vibe-profiler.js';
import { ZeroDepGraftSynthesizer } from '../chameleon/zero-dep-graft-synthesizer.js';
import { GoldenParityVerifier } from '../parity/golden-parity-verifier.js';
import { GraftPatchGenerator } from '../chameleon/graft-patch-generator.js';
import type { BenchmarkItemResult, BenchmarkSuiteResult } from '../types/domain.js';

export class BenchmarkRunner {
  private readonly ingestor = new MultiSourceIngestor();
  private readonly extractor = new PolyglotSymbolExtractor();
  private readonly slicer = new AstClosureSlicer();
  private readonly profiler = new TargetVibeProfiler();
  private readonly synthesizer = new ZeroDepGraftSynthesizer();
  private readonly verifier = new GoldenParityVerifier();
  private readonly patchGen = new GraftPatchGenerator();

  public runDeterministicBenchmarks(iterations: number = 50): BenchmarkSuiteResult {
    const totalStart = performance.now();
    const results: BenchmarkItemResult[] = [];

    // Benchmark 1: Ingestion & Bundle Normalization
    {
      const minifiedBundle =
        'export function calcTotal(items){return items.reduce((a,b)=>a+b,0);}export function filterActive(arr){return arr.filter(x=>x.active);}export function unusedHelper(){return null;}';
      const start = performance.now();
      let totalBytesProcessed = 0;
      for (let i = 0; i < iterations; i++) {
        const snap = this.ingestor.ingest({
          sourceUri: `bundle:bench_${i}.min.js`,
          bundleCode: minifiedBundle,
          bundleLanguage: 'javascript',
        });
        totalBytesProcessed += snap.metadata?.totalBytes ?? minifiedBundle.length;
      }
      const durationMs = Math.max(0.1, performance.now() - start);
      const opsPerSec = Math.round((iterations / (durationMs / 1000)));
      const throughputMbPerSec = Number(((totalBytesProcessed / (1024 * 1024)) / (durationMs / 1000)).toFixed(2));
      results.push({
        name: 'Multi-Source Ingestion & Bundle Normalization',
        operations: iterations,
        durationMs: Number(durationMs.toFixed(2)),
        opsPerSec,
        throughputMbPerSec,
        status: 'passed',
      });
    }

    // Benchmark 2: Polyglot AST Symbol Extraction
    {
      const sampleTsCode = [
        "import { cloneDeep } from 'lodash';",
        "import { v4 as uuidv4 } from 'uuid';",
        'export interface Item { id: string; val: number; }',
        'export function processItem(item: Item): Item {',
        '  const copy = cloneDeep(item);',
        '  copy.id = uuidv4();',
        '  return copy;',
        '}',
        'export function batchProcess(items: Item[]): Item[] {',
        '  return items.map((x) => processItem(x));',
        '}',
      ].join('\n');

      const snap = this.ingestor.ingest({
        sourceUri: 'bench:polyglot.ts',
        inlineFiles: [{ relativePath: 'src/items.ts', language: 'typescript', content: sampleTsCode }],
      });

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        this.extractor.extractFromSnapshot(snap);
      }
      const durationMs = Math.max(0.1, performance.now() - start);
      const opsPerSec = Math.round((iterations / (durationMs / 1000)));
      results.push({
        name: 'Polyglot AST Symbol & Edge Extraction',
        operations: iterations,
        durationMs: Number(durationMs.toFixed(2)),
        opsPerSec,
        status: 'passed',
      });
    }

    // Benchmark 3: Transitive AST Closure Slicing & Pruning
    {
      const snap = this.ingestor.ingest({
        sourceUri: 'bench:graph.ts',
        inlineFiles: [
          {
            relativePath: 'src/math.ts',
            language: 'typescript',
            content: [
              "import { cloneDeep } from 'lodash';",
              'export function leafNode(v: number): number { return v * 2; }',
              'export function middleNode(v: number): number { return cloneDeep(leafNode(v)); }',
              'export function rootEntrypoint(v: number): number { return middleNode(v) + 1; }',
              'export function deadCodeUnused(): string { return "UNUSED"; }',
            ].join('\n'),
          },
        ],
      });

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        this.slicer.sliceEngineGraph(snap, ['rootEntrypoint']);
      }
      const durationMs = Math.max(0.1, performance.now() - start);
      const opsPerSec = Math.round((iterations / (durationMs / 1000)));
      results.push({
        name: 'Transitive AST Closure Slicing & Pruning',
        operations: iterations,
        durationMs: Number(durationMs.toFixed(2)),
        opsPerSec,
        status: 'passed',
      });
    }

    // Benchmark 4: Target Vibe Convention Profiling
    {
      const sampleCode = 'export const add = (a: number, b: number): number => a + b;\n';
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        this.profiler.profileTargetVibe({ sampleCode, explicitLanguage: 'typescript' });
      }
      const durationMs = Math.max(0.1, performance.now() - start);
      const opsPerSec = Math.round((iterations / (durationMs / 1000)));
      results.push({
        name: 'Target Vibe Convention Profiling',
        operations: iterations,
        durationMs: Number(durationMs.toFixed(2)),
        opsPerSec,
        status: 'passed',
      });
    }

    // Benchmark 5: Chameleon Zero-Dep Graft Synthesis & Polyfill Transpilation
    {
      const snap = this.ingestor.ingest({
        sourceUri: 'bench:graft.ts',
        inlineFiles: [
          {
            relativePath: 'src/calc.ts',
            language: 'typescript',
            content: [
              "import { cloneDeep } from 'lodash';",
              'export function calculate(val: number): number { return cloneDeep(val * 10); }',
            ].join('\n'),
          },
        ],
      });
      const slice = this.slicer.sliceEngineGraph(snap, ['calculate']);
      const profile = this.profiler.profileTargetVibe({ explicitLanguage: 'python' });

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        this.synthesizer.synthesizeChameleonGraft(slice, profile, `Engine_${i}`);
      }
      const durationMs = Math.max(0.1, performance.now() - start);
      const opsPerSec = Math.round((iterations / (durationMs / 1000)));
      results.push({
        name: 'Chameleon Zero-Dep Graft & Polyfill Transpilation',
        operations: iterations,
        durationMs: Number(durationMs.toFixed(2)),
        opsPerSec,
        status: 'passed',
      });
    }

    // Benchmark 6: Deterministic Golden Parity Verification
    {
      const snap = this.ingestor.ingest({
        sourceUri: 'bench:parity.ts',
        inlineFiles: [
          {
            relativePath: 'src/parity.ts',
            language: 'typescript',
            content: 'export function square(n: number): number { return n * n; }',
          },
        ],
      });
      const slice = this.slicer.sliceEngineGraph(snap, ['square']);
      const profile = this.profiler.profileTargetVibe({ explicitLanguage: 'typescript' });
      const graft = this.synthesizer.synthesizeChameleonGraft(slice, profile, 'SquareEngine');

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        this.verifier.verifyEngineParity(slice, graft);
      }
      const durationMs = Math.max(0.1, performance.now() - start);
      const opsPerSec = Math.round((iterations / (durationMs / 1000)));
      results.push({
        name: 'Deterministic Golden Parity Vector Verification',
        operations: iterations,
        durationMs: Number(durationMs.toFixed(2)),
        opsPerSec,
        status: 'passed',
      });
    }

    // Benchmark 7: Unified Diff Patch Generation
    {
      const snap = this.ingestor.ingest({
        sourceUri: 'bench:patch.ts',
        inlineFiles: [
          {
            relativePath: 'src/mod.ts',
            language: 'typescript',
            content: 'export function addOne(x: number): number { return x + 1; }',
          },
        ],
      });
      const slice = this.slicer.sliceEngineGraph(snap, ['addOne']);
      const profile = this.profiler.profileTargetVibe({ explicitLanguage: 'typescript' });
      const graft = this.synthesizer.synthesizeChameleonGraft(slice, profile, 'AddOneEngine');

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        this.patchGen.generatePatch(graft, {
          graftId: graft.graftId,
          targetFilePath: 'src/index.ts',
          targetFileContent: 'export const base = 100;\n',
          integrationStrategy: 'append',
        });
      }
      const durationMs = Math.max(0.1, performance.now() - start);
      const opsPerSec = Math.round((iterations / (durationMs / 1000)));
      results.push({
        name: 'Unified Diff AST Integration Patch Generation',
        operations: iterations,
        durationMs: Number(durationMs.toFixed(2)),
        opsPerSec,
        status: 'passed',
      });
    }

    const totalDurationMs = Number((performance.now() - totalStart).toFixed(2));
    const totalOperations = results.reduce((acc, r) => acc + r.operations, 0);

    return {
      suiteName: '@kr-pro-labs/clonevibe-mcp Deterministic Performance Benchmark',
      totalDurationMs,
      totalOperations,
      results,
      environment: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
      },
    };
  }

  public formatBenchmarkReport(suite: BenchmarkSuiteResult): string {
    const lines: string[] = [
      '========================================================================================',
      `  ${suite.suiteName}`,
      `  Node ${suite.environment.nodeVersion} | ${suite.environment.platform} ${suite.environment.arch} (${suite.environment.cpus} CPUs)`,
      `  Total: ${suite.totalOperations} operations across ${suite.results.length} stages in ${suite.totalDurationMs} ms`,
      '========================================================================================',
      '',
      '| Benchmark Stage                                    | Ops | Elapsed (ms) | Throughput (ops/s) | Status |',
      '| :------------------------------------------------- | --: | -----------: | -----------------: | :----: |',
    ];

    for (const r of suite.results) {
      const stage = r.name.padEnd(50, ' ');
      const ops = String(r.operations).padStart(3, ' ');
      const elapsed = String(r.durationMs).padStart(12, ' ');
      const opsPerSec = String(r.opsPerSec).padStart(18, ' ');
      const status = `[${r.status.toUpperCase()}]`;
      lines.push(`| ${stage} | ${ops} | ${elapsed} | ${opsPerSec} | ${status} |`);
    }

    lines.push('');
    return lines.join('\n');
  }
}
