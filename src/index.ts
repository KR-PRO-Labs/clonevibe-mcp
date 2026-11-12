#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCloneVibeMcpServer, CloneVibeEngine } from './server.js';

export * from './types/domain.js';
export * from './ingest/multi-source-ingestor.js';
export * from './slicer/polyglot-symbol-extractor.js';
export * from './slicer/ast-closure-slicer.js';
export * from './chameleon/target-vibe-profiler.js';
export * from './chameleon/zero-dep-graft-synthesizer.js';
export * from './chameleon/polyfill-transpiler.js';
export * from './chameleon/graft-patch-generator.js';
export * from './parity/golden-parity-verifier.js';
export * from './bench/benchmark-runner.js';
export * from './cli.js';
export { createCloneVibeMcpServer, CloneVibeEngine };

async function main(): Promise<void> {
  const { runCli } = await import('./cli.js');
  if (runCli(process.argv)) {
    return;
  }

  const { server } = createCloneVibeMcpServer();
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    try {
      await server.close();
    } catch {
      // ignore close errors on shutdown
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await server.connect(transport);
}

const isMainModule =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('index.ts'));

if (isMainModule && process.env['CLONEVIBE_NO_AUTOSTART'] !== '1') {
  main().catch((err) => {
    process.stderr.write(`[clonevibe-mcp] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
