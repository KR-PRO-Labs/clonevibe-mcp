import * as crypto from 'node:crypto';
import type {
  CallGraphEdge,
  EngineSliceResult,
  EntrypointCandidate,
  ReferenceSnapshot,
  SymbolNode,
  ZeroDepShimSpec,
} from '../types/domain.js';
import { PolyglotSymbolExtractor } from './polyglot-symbol-extractor.js';

export const ZERO_DEP_SHIM_CATALOG: ZeroDepShimSpec[] = [
  {
    shimId: 'shim_deep_clone',
    packageName: 'lodash',
    replacedApis: ['cloneDeep', 'lodash.clonedeep', 'lodash-es'],
    description: 'Zero-dependency structural deep clone using native structuredClone with recursive fallback.',
    inlineImplementation: {
      typescript: [
        'function cloneDeep<T>(value: T): T {',
        '  if (typeof globalThis.structuredClone === "function") {',
        '    return globalThis.structuredClone(value);',
        '  }',
        '  if (value === null || typeof value !== "object") return value;',
        '  if (Array.isArray(value)) return value.map((item) => cloneDeep(item)) as unknown as T;',
        '  const out: Record<string, unknown> = {};',
        '  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {',
        '    out[k] = cloneDeep(v);',
        '  }',
        '  return out as T;',
        '}',
      ].join('\n'),
      javascript: [
        'function cloneDeep(value) {',
        '  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);',
        '  return JSON.parse(JSON.stringify(value));',
        '}',
      ].join('\n'),
      python: [
        'import copy as _std_copy',
        'def clone_deep(value):',
        '    return _std_copy.deepcopy(value)',
      ].join('\n'),
      rust: [
        'fn clone_deep<T: Clone>(value: &T) -> T {',
        '    value.clone()',
        '}',
      ].join('\n'),
      go: [
        'func cloneDeep[T any](value T) T {',
        '    return value',
        '}',
      ].join('\n'),
    },
  },
  {
    shimId: 'shim_uuid_v4',
    packageName: 'uuid',
    replacedApis: ['v4', 'uuidv4', 'nanoid'],
    description: 'Zero-dependency RFC 4122 v4 UUID generator backed by Web/Node crypto.randomUUID.',
    inlineImplementation: {
      typescript: [
        'function uuidv4(): string {',
        '  if (typeof globalThis.crypto?.randomUUID === "function") {',
        '    return globalThis.crypto.randomUUID();',
        '  }',
        '  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {',
        '    const r = (Math.random() * 16) | 0;',
        '    const v = c === "x" ? r : (r & 0x3) | 0x8;',
        '    return v.toString(16);',
        '  });',
        '}',
      ].join('\n'),
      javascript: [
        'function uuidv4() {',
        '  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();',
        '  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {',
        '    const r = (Math.random() * 16) | 0;',
        '    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);',
        '  });',
        '}',
      ].join('\n'),
      python: [
        'import uuid as _std_uuid',
        'def uuid_v4() -> str:',
        '    return str(_std_uuid.uuid4())',
      ].join('\n'),
      rust: [
        'fn uuid_v4_deterministic(seed: u64) -> String {',
        '    format!("{:08x}-0000-4000-8000-{:012x}", (seed >> 32) as u32, seed & 0xffffffffffff)',
        '}',
      ].join('\n'),
      go: [
        'func uuidV4Deterministic(seed uint64) string {',
        '    return "00000000-0000-4000-8000-000000000001"',
        '}',
      ].join('\n'),
    },
  },
  {
    shimId: 'shim_http_fetch',
    packageName: 'axios',
    replacedApis: ['axios', 'node-fetch', 'ky', 'got', 'requests', 'httpx'],
    description: 'Zero-dependency native fetch wrapper with timeout and JSON parsing.',
    inlineImplementation: {
      typescript: [
        'async function nativeJsonFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {',
        '  const response = await globalThis.fetch(url, init);',
        '  if (!response.ok) {',
        '    throw new Error(`HTTP ${response.status}: ${response.statusText}`);',
        '  }',
        '  return (await response.json()) as T;',
        '}',
      ].join('\n'),
      javascript: [
        'async function nativeJsonFetch(url, init) {',
        '  const response = await globalThis.fetch(url, init);',
        '  if (!response.ok) throw new Error("HTTP " + response.status);',
        '  return await response.json();',
        '}',
      ].join('\n'),
      python: [
        'import json as _std_json',
        'import urllib.request as _std_req',
        'def native_json_fetch(url: str) -> dict:',
        '    with _std_req.urlopen(url, timeout=10) as resp:',
        '        return _std_json.loads(resp.read().decode("utf-8"))',
      ].join('\n'),
      rust: [
        'fn native_json_fetch_stub(url: &str) -> Result<String, String> {',
        '    Ok(format!("{{\"url\":\"{}\"}}", url))',
        '}',
      ].join('\n'),
      go: [
        'func nativeJsonFetchStub(url string) (string, error) {',
        '    return url, nil',
        '}',
      ].join('\n'),
    },
  },
  {
    shimId: 'shim_ansi_color',
    packageName: 'chalk',
    replacedApis: ['chalk', 'kleur', 'picocolors', 'colorette'],
    description: 'Zero-dependency ANSI terminal formatter.',
    inlineImplementation: {
      typescript: [
        'const ansiColor = {',
        '  bold: (s: string): string => `\x1b[1m${s}\x1b[22m`,',
        '  green: (s: string): string => `\x1b[32m${s}\x1b[39m`,',
        '  red: (s: string): string => `\x1b[31m${s}\x1b[39m`,',
        '  yellow: (s: string): string => `\x1b[33m${s}\x1b[39m`,',
        '};',
      ].join('\n'),
      javascript: [
        'const ansiColor = {',
        '  bold: (s) => "\x1b[1m" + s + "\x1b[22m",',
        '  green: (s) => "\x1b[32m" + s + "\x1b[39m",',
        '  red: (s) => "\x1b[31m" + s + "\x1b[39m",',
        '};',
      ].join('\n'),
      python: [
        'def ansi_green(text: str) -> str:',
        '    return f"\x1b[32m{text}\x1b[39m"',
      ].join('\n'),
      rust: [
        'fn ansi_green(text: &str) -> String {',
        '    format!("\x1b[32m{}\x1b[39m", text)',
        '}',
      ].join('\n'),
      go: [
        'func ansiGreen(text string) string {',
        '    return "\x1b[32m" + text + "\x1b[39m"',
        '}',
      ].join('\n'),
    },
  },
];

export interface SliceOptions {
  maxDepth?: number;
  includeTypes?: boolean;
}

export class AstClosureSlicer {
  private readonly extractor = new PolyglotSymbolExtractor();
  private readonly slices = new Map<string, EngineSliceResult>();

  public locateFeatureEntrypoints(
    snapshot: ReferenceSnapshot,
    featureQuery: string,
    maxResults: number = 5,
  ): EntrypointCandidate[] {
    const symbols = this.extractor.extractFromSnapshot(snapshot);
    const queryTokens = this.tokenizeQuery(featureQuery);

    const incomingCounts = new Map<string, number>();
    for (const sym of symbols) {
      for (const targetName of sym.calls) {
        incomingCounts.set(targetName, (incomingCounts.get(targetName) ?? 0) + 1);
      }
    }

    const candidates: EntrypointCandidate[] = symbols.map((symbol) => {
      const symbolTokens = this.tokenizeQuery(symbol.name + ' ' + symbol.filePath);
      const matchedKeywords: string[] = [];
      let keywordScore = 0;

      for (const qTok of queryTokens) {
        if (symbol.name.toLowerCase().includes(qTok)) {
          keywordScore += 30;
          matchedKeywords.push(qTok);
        } else if (symbolTokens.includes(qTok)) {
          keywordScore += 20;
          matchedKeywords.push(qTok);
        } else if (symbol.sourceCode.toLowerCase().includes(qTok)) {
          keywordScore += 10;
          matchedKeywords.push(qTok);
        }
      }

      const outgoing = symbol.calls.length;
      const incoming = incomingCounts.get(symbol.name) ?? 0;
      const centralityScore = outgoing * 8 + incoming * 4;
      const exportBonus = symbol.exported ? 15 : 0;
      const kindBonus = symbol.kind === 'function' || symbol.kind === 'class' ? 10 : 2;
      const totalScore = keywordScore + centralityScore + exportBonus + kindBonus;

      return {
        symbol,
        score: totalScore,
        matchedKeywords: Array.from(new Set(matchedKeywords)),
        centralityScore,
        rationale:
          matchedKeywords.length > 0
            ? `Matched feature tokens [${matchedKeywords.join(', ')}] with call centrality ${centralityScore}`
            : `Ranked by structural centrality (${centralityScore}) and export visibility`,
      };
    });

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.symbol.id.localeCompare(b.symbol.id);
    });

    return candidates.slice(0, Math.max(1, maxResults));
  }

  public sliceEngineGraph(
    snapshot: ReferenceSnapshot,
    entrypointIds: string[],
    options: SliceOptions = {},
  ): EngineSliceResult {
    const maxDepth = options.maxDepth ?? 8;
    const includeTypes = options.includeTypes ?? true;
    const allSymbols = this.extractor.extractFromSnapshot(snapshot);

    const byId = new Map<string, SymbolNode>();
    const byName = new Map<string, SymbolNode[]>();
    for (const sym of allSymbols) {
      byId.set(sym.id, sym);
      const list = byName.get(sym.name) ?? [];
      list.push(sym);
      byName.set(sym.name, list);
    }

    const startNodes: SymbolNode[] = [];
    for (const rawId of entrypointIds) {
      const exact = byId.get(rawId);
      if (exact) {
        startNodes.push(exact);
        continue;
      }
      const byShortName = byName.get(rawId);
      if (byShortName && byShortName.length > 0) {
        startNodes.push(...byShortName);
      }
    }

    if (startNodes.length === 0 && allSymbols.length > 0) {
      const topCandidate = this.locateFeatureEntrypoints(snapshot, entrypointIds.join(' '), 1)[0];
      if (topCandidate) {
        startNodes.push(topCandidate.symbol);
      }
    }

    const visitedIds = new Set<string>();
    const keptSymbols: SymbolNode[] = [];
    const callGraphEdges: CallGraphEdge[] = [];
    const queue: Array<{ node: SymbolNode; depth: number }> = [];

    for (const start of startNodes) {
      if (!visitedIds.has(start.id)) {
        visitedIds.add(start.id);
        queue.push({ node: start, depth: 0 });
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      keptSymbols.push(current.node);

      if (current.depth >= maxDepth) {
        continue;
      }

      for (const calleeName of current.node.calls) {
        const targets = byName.get(calleeName) ?? [];
        for (const target of targets) {
          if (!includeTypes && (target.kind === 'interface' || target.kind === 'type')) {
            continue;
          }
          callGraphEdges.push({
            fromSymbolId: current.node.id,
            toSymbolId: target.id,
            callName: calleeName,
          });
          if (!visitedIds.has(target.id)) {
            visitedIds.add(target.id);
            queue.push({ node: target, depth: current.depth + 1 });
          }
        }
      }
    }

    // Order keptSymbols so types/helpers appear before callers when in the same file
    keptSymbols.sort((a, b) => {
      const typeOrderA = a.kind === 'interface' || a.kind === 'type' || a.kind === 'struct' ? 0 : 1;
      const typeOrderB = b.kind === 'interface' || b.kind === 'type' || b.kind === 'struct' ? 0 : 1;
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
      if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
      return a.startLine - b.startLine;
    });

    const totalSymbolsCount = allSymbols.length;
    const prunedSymbolsCount = Math.max(0, totalSymbolsCount - keptSymbols.length);
    const boilerplateReductionRatio =
      totalSymbolsCount === 0
        ? 0
        : Number(((prunedSymbolsCount / totalSymbolsCount) * 100).toFixed(2));

    const externalDepSet = new Set<string>();
    for (const sym of keptSymbols) {
      for (const dep of sym.externalImports) {
        externalDepSet.add(dep);
      }
    }
    const externalDependencies = Array.from(externalDepSet).sort();

    const matchedZeroDepShims = ZERO_DEP_SHIM_CATALOG.filter((shim) =>
      externalDependencies.some(
        (dep) =>
          dep === shim.packageName ||
          shim.replacedApis.includes(dep) ||
          dep.startsWith(shim.packageName + '/'),
      ),
    );

    const sliceHash = crypto
      .createHash('sha256')
      .update(snapshot.snapshotId + ':' + keptSymbols.map((s) => s.id).join(','))
      .digest('hex')
      .slice(0, 12);
    const sliceId = `slice_${sliceHash}`;

    const result: EngineSliceResult = {
      sliceId,
      snapshotId: snapshot.snapshotId,
      entrypointIds: startNodes.map((s) => s.id),
      keptSymbols,
      prunedSymbolsCount,
      totalSymbolsCount,
      boilerplateReductionRatio,
      externalDependencies,
      matchedZeroDepShims,
      callGraphEdges,
    };

    this.slices.set(sliceId, result);
    return result;
  }

  public getSlice(sliceId: string): EngineSliceResult | undefined {
    return this.slices.get(sliceId);
  }

  private tokenizeQuery(text: string): string[] {
    const expanded = text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[/_.-]+/g, ' ')
      .toLowerCase();
    return expanded
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
  }
}
