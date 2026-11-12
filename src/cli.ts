import * as fs from 'node:fs';
import * as path from 'node:path';
import { ZERO_DEP_SHIM_CATALOG, AstClosureSlicer } from './slicer/ast-closure-slicer.js';
import { TargetVibeProfiler } from './chameleon/target-vibe-profiler.js';
import { MultiSourceIngestor } from './ingest/multi-source-ingestor.js';
import { BenchmarkRunner } from './bench/benchmark-runner.js';

export function runCli(argv: string[]): boolean {
  const args = argv.slice(2);
  if (args.length === 0) {
    return false; // Hand off to MCP stdio server
  }

  const isJson = args.includes('--json');

  // --version / -v
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write('1.0.0\n');
    return true;
  }

  // --help / -h
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return true;
  }

  // --catalog
  if (args.includes('--catalog')) {
    if (isJson) {
      process.stdout.write(JSON.stringify(ZERO_DEP_SHIM_CATALOG, null, 2) + '\n');
    } else {
      printCatalog();
    }
    return true;
  }

  // --bench / --benchmark / bench
  if (args.includes('--bench') || args.includes('--benchmark') || args.includes('bench')) {
    const runner = new BenchmarkRunner();
    const suite = runner.runDeterministicBenchmarks(50);
    if (isJson) {
      process.stdout.write(JSON.stringify(suite, null, 2) + '\n');
    } else {
      process.stdout.write(runner.formatBenchmarkReport(suite) + '\n');
    }
    return true;
  }

  // --profile <dir>
  const profileIdx = args.findIndex((a) => a === '--profile');
  if (profileIdx !== -1) {
    const targetDir = args[profileIdx + 1];
    if (!targetDir || targetDir.startsWith('-')) {
      process.stderr.write('Error: --profile requires a directory path argument.\n');
      process.exit(1);
    }
    const profiler = new TargetVibeProfiler();
    const resolvedPath = path.resolve(process.cwd(), targetDir);
    const profile = profiler.profileTargetVibe({ workspacePath: resolvedPath });
    if (isJson) {
      process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
    } else {
      printProfile(resolvedPath, profile);
    }
    return true;
  }

  // --slice <featureQuery> [--source <path>]
  const sliceIdx = args.findIndex((a) => a === '--slice');
  if (sliceIdx !== -1) {
    const query = args[sliceIdx + 1];
    if (!query || query.startsWith('-')) {
      process.stderr.write('Error: --slice requires a feature query string.\n');
      process.exit(1);
    }
    const sourceIdx = args.findIndex((a) => a === '--source');
    const sourcePath = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
    runSliceCli(query, sourcePath, isJson);
    return true;
  }

  // If unknown flag, return false to let default stdio server handle or warn
  if (args[0]?.startsWith('-')) {
    process.stderr.write(`Unknown CLI option: ${args[0]}. Use --help for usage information.\n`);
    process.exit(1);
  }

  return false;
}

function printHelp(): void {
  const help = `
@kr-pro-labs/clonevibe-mcp — Surgical AST Feature Slicer & Chameleon Code Grafter

USAGE:
  clonevibe-mcp [OPTIONS]

MCP SERVER MODE (DEFAULT):
  clonevibe-mcp                     Start the MCP server over stdio transport

INSPECTION & BENCHMARK SUBCOMMANDS:
  --catalog                         Inspect the Zero-Dependency Micro-Shim Catalog
  --profile <directory>             Profile workspace language, module, indent, and quote vibe
  --slice <query> [--source <dir>]  Surgically locate entrypoints and slice AST closure
  --benchmark, --bench              Execute deterministic performance benchmark suite
  --json                            Emit machine-readable JSON output for subcommands
  --version, -v                     Print version
  --help, -h                        Display this help message

EXAMPLES:
  clonevibe-mcp --catalog
  clonevibe-mcp --profile ./src
  clonevibe-mcp --slice "token rate limiter" --source ./src
  clonevibe-mcp --bench
  clonevibe-mcp --catalog --json
`;
  process.stdout.write(help.trimStart());
}

function printCatalog(): void {
  const lines: string[] = [
    '========================================================================================',
    `  @kr-pro-labs/clonevibe-mcp Zero-Dependency Micro-Shim Catalog (${ZERO_DEP_SHIM_CATALOG.length} shims)`,
    '========================================================================================',
    '',
    '| Shim ID             | Replaced Package | Replaced APIs                               | Languages               |',
    '| :------------------ | :--------------- | :------------------------------------------ | :---------------------- |',
  ];

  for (const s of ZERO_DEP_SHIM_CATALOG) {
    const id = s.shimId.padEnd(19, ' ');
    const pkg = s.packageName.padEnd(16, ' ');
    const apis = s.replacedApis.slice(0, 3).join(', ').padEnd(43, ' ');
    const langs = Object.keys(s.inlineImplementation).join(', ');
    lines.push(`| ${id} | ${pkg} | ${apis} | ${langs} |`);
  }

  lines.push('');
  process.stdout.write(lines.join('\n'));
}

function printProfile(dirPath: string, profile: ReturnType<TargetVibeProfiler['profileTargetVibe']>): void {
  const out = `
Target Workspace Profile: ${dirPath}
--------------------------------------------------
Target Language     : ${profile.targetLanguage}
Module System       : ${profile.moduleSystem}
Naming Style        : ${profile.namingStyle}
Indent Style        : ${profile.indentStyle}
Quote Style         : ${profile.quoteStyle}
Semicolons          : ${profile.semicolons}
Error Idiom         : ${profile.errorHandlingIdiom}
Detected Samples    : ${profile.detectedFrom.join(', ') || 'defaults'}
`;
  process.stdout.write(out);
}

function runSliceCli(query: string, sourcePath: string | undefined, isJson: boolean): void {
  const ingestor = new MultiSourceIngestor();
  const slicer = new AstClosureSlicer();

  let targetUri = sourcePath ? path.resolve(process.cwd(), sourcePath) : process.cwd();
  if (!fs.existsSync(targetUri)) {
    targetUri = process.cwd();
  }

  const snap = ingestor.ingest({ sourceUri: targetUri });
  const candidates = slicer.locateFeatureEntrypoints(snap, query, 5);

  if (candidates.length === 0) {
    if (isJson) {
      process.stdout.write(JSON.stringify({ query, candidates: [], slice: null }, null, 2) + '\n');
    } else {
      process.stdout.write(`No candidate entrypoints found matching query: "${query}"\n`);
    }
    return;
  }

  const topEntrypoint = candidates[0]!.symbol.id;
  const slice = slicer.sliceEngineGraph(snap, [topEntrypoint]);

  if (isJson) {
    process.stdout.write(
      JSON.stringify(
        {
          query,
          topCandidates: candidates,
          slice: {
            sliceId: slice.sliceId,
            keptSymbolsCount: slice.keptSymbols.length,
            prunedSymbolsCount: slice.prunedSymbolsCount,
            boilerplateReductionRatio: slice.boilerplateReductionRatio,
            matchedZeroDepShims: slice.matchedZeroDepShims.map((s) => s.shimId),
            externalDependencies: slice.externalDependencies,
          },
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(`\nFeature Query: "${query}"\n`);
    process.stdout.write(`Top Candidate: ${candidates[0]!.symbol.name} (${candidates[0]!.symbol.filePath})\n`);
    process.stdout.write(`Kept Symbols : ${slice.keptSymbols.length} / ${slice.totalSymbolsCount}\n`);
    process.stdout.write(`Pruned       : ${slice.prunedSymbolsCount} (${slice.boilerplateReductionRatio}% reduction)\n`);
    process.stdout.write(`Inlined Shims: ${slice.matchedZeroDepShims.map((s) => s.shimId).join(', ') || 'none'}\n\n`);
  }
}
