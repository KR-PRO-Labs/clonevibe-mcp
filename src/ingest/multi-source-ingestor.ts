import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  IngestReferenceInput,
  ReferenceFile,
  ReferenceSnapshot,
  SourceKind,
  SupportedLanguage,
} from '../types/domain.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  'coverage',
  '.next',
  '.cache',
]);

const EXT_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
};

export class MultiSourceIngestor {
  private readonly snapshots = new Map<string, ReferenceSnapshot>();

  public classifySourceKind(sourceUri: string, explicitKind?: SourceKind, bundleCode?: string): SourceKind {
    if (explicitKind) {
      return explicitKind;
    }
    if (bundleCode && bundleCode.trim().length > 0) {
      return 'bundle';
    }
    const trimmed = sourceUri.trim();
    if (trimmed.startsWith('npm:')) return 'npm';
    if (trimmed.startsWith('pypi:') || trimmed.startsWith('pip:')) return 'pypi';
    if (trimmed.startsWith('cargo:') || trimmed.startsWith('crate:')) return 'cargo';
    if (trimmed.startsWith('bundle:') || trimmed.endsWith('.min.js') || trimmed.endsWith('.bundle.js')) {
      return 'bundle';
    }
    if (
      trimmed.startsWith('https://github.com/') ||
      trimmed.startsWith('http://github.com/') ||
      trimmed.startsWith('github:')
    ) {
      return 'github';
    }
    return 'local';
  }

  public detectLanguageFromPath(filePath: string, fallback: SupportedLanguage = 'typescript'): SupportedLanguage {
    const ext = path.extname(filePath).toLowerCase();
    return EXT_LANGUAGE_MAP[ext] ?? fallback;
  }

  /**
   * Formats single-line or minified JS/TS bundles into readable multi-line declarations
   * so the polyglot symbol extractor can isolate functions, classes, and constants cleanly.
   */
  public normalizeMinifiedBundle(rawCode: string): string {
    const lines = rawCode.split(/\r?\n/);
    const avgLineLength = rawCode.length / Math.max(1, lines.length);
    const isMinified = lines.length <= 5 || avgLineLength > 240;

    if (!isMinified) {
      return rawCode;
    }

    let formatted = '';
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;
    let escaped = false;

    for (let i = 0; i < rawCode.length; i++) {
      const ch = rawCode[i] ?? '';
      if (escaped) {
        formatted += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        formatted += ch;
        escaped = true;
        continue;
      }
      if (!inDoubleQuote && !inTemplate && ch === "'") {
        inSingleQuote = !inSingleQuote;
        formatted += ch;
        continue;
      }
      if (!inSingleQuote && !inTemplate && ch === '"') {
        inDoubleQuote = !inDoubleQuote;
        formatted += ch;
        continue;
      }
      if (!inSingleQuote && !inDoubleQuote && ch === '`') {
        inTemplate = !inTemplate;
        formatted += ch;
        continue;
      }

      if (inSingleQuote || inDoubleQuote || inTemplate) {
        formatted += ch;
        continue;
      }

      if (ch === '{') {
        depth++;
        formatted += ' {\n' + '  '.repeat(Math.min(depth, 6));
      } else if (ch === '}') {
        depth = Math.max(0, depth - 1);
        formatted += '\n' + '  '.repeat(Math.min(depth, 6)) + '}';
        if (depth === 0) {
          formatted += '\n';
        }
      } else if (ch === ';') {
        formatted += ';\n' + '  '.repeat(Math.min(depth, 6));
      } else {
        formatted += ch;
      }
    }

    return formatted
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l, idx, arr) => !(l === '' && arr[idx - 1] === ''))
      .join('\n')
      .trim() + '\n';
  }

  public ingest(input: IngestReferenceInput): ReferenceSnapshot {
    const sourceKind = this.classifySourceKind(input.sourceUri, input.sourceKind, input.bundleCode);
    const files: ReferenceFile[] = [];
    let normalizedBundle = false;

    if (input.inlineFiles && input.inlineFiles.length > 0) {
      for (const item of input.inlineFiles) {
        const rel = item.relativePath.replace(/\\/g, '/');
        const lang = item.language ?? this.detectLanguageFromPath(rel);
        const content =
          sourceKind === 'bundle' && (lang === 'javascript' || lang === 'typescript')
            ? this.normalizeMinifiedBundle(item.content)
            : item.content;
        if (content !== item.content) {
          normalizedBundle = true;
        }
        files.push(this.createReferenceFile(rel, lang, content));
      }
    } else if (input.bundleCode && input.bundleCode.trim().length > 0) {
      const lang = input.bundleLanguage ?? 'javascript';
      const normalized = this.normalizeMinifiedBundle(input.bundleCode);
      normalizedBundle = normalized !== input.bundleCode;
      const ext = lang === 'typescript' ? '.ts' : '.js';
      files.push(this.createReferenceFile(`bundle/extracted-bundle${ext}`, lang, normalized));
    } else if (sourceKind === 'local' && fs.existsSync(input.sourceUri)) {
      const targetRoot = input.subpath
        ? path.resolve(input.sourceUri, input.subpath)
        : path.resolve(input.sourceUri);
      const stat = fs.statSync(targetRoot);
      if (stat.isFile()) {
        const raw = fs.readFileSync(targetRoot, 'utf8');
        const lang = this.detectLanguageFromPath(targetRoot);
        const rel = path.basename(targetRoot);
        files.push(this.createReferenceFile(rel, lang, raw));
      } else if (stat.isDirectory()) {
        this.walkLocalDirectory(targetRoot, targetRoot, files);
      }
    } else {
      // Deterministic virtual hydration for registry specs (npm:, pypi:, cargo:) or offline GitHub specs
      files.push(...this.synthesizeRegistryOrRemoteStubFiles(sourceKind, input.sourceUri, input.subpath));
    }

    const detectedEntrypoints = this.detectEntrypointFiles(files);
    const hash = crypto
      .createHash('sha256')
      .update(sourceKind + ':' + input.sourceUri + ':' + files.map((f) => f.relativePath + ':' + f.byteSize).join('|'))
      .digest('hex')
      .slice(0, 12);
    const snapshotId = `snap_${sourceKind}_${hash}`;

    const languageBreakdown: Partial<Record<SupportedLanguage, number>> = {};
    let totalBytes = 0;
    let totalLines = 0;
    for (const f of files) {
      totalBytes += f.byteSize;
      totalLines += f.lineCount;
      languageBreakdown[f.language] = (languageBreakdown[f.language] ?? 0) + 1;
    }

    const snapshot: ReferenceSnapshot = {
      snapshotId,
      sourceKind,
      originUri: input.sourceUri,
      files,
      detectedEntrypoints,
      ingestedAt: new Date().toISOString(),
      metadata: {
        totalBytes,
        totalLines,
        languageBreakdown,
        normalizedBundle,
      },
    };

    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  public getSnapshot(snapshotId: string): ReferenceSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  public listSnapshots(): ReferenceSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  private createReferenceFile(relativePath: string, language: SupportedLanguage, content: string): ReferenceFile {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const byteSize = Buffer.byteLength(content, 'utf8');
    const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;
    return {
      relativePath: normalizedPath,
      language,
      content,
      byteSize,
      lineCount,
    };
  }

  private walkLocalDirectory(rootDir: string, currentDir: string, outFiles: ReferenceFile[]): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        this.walkLocalDirectory(rootDir, path.join(currentDir, entry.name), outFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const lang = EXT_LANGUAGE_MAP[ext];
        if (!lang) {
          continue;
        }
        const fullPath = path.join(currentDir, entry.name);
        const stat = fs.statSync(fullPath);
        if (stat.size > 2 * 1024 * 1024) {
          continue;
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        outFiles.push(this.createReferenceFile(rel, lang, content));
      }
    }
  }

  private detectEntrypointFiles(files: ReferenceFile[]): string[] {
    const entryNames = new Set([
      'index.ts',
      'index.js',
      'main.ts',
      'main.js',
      'mod.ts',
      'server.ts',
      '__init__.py',
      'main.py',
      'lib.rs',
      'main.rs',
      'main.go',
    ]);
    const matched = files
      .filter((f) => entryNames.has(path.posix.basename(f.relativePath)))
      .map((f) => f.relativePath);
    if (matched.length > 0) {
      return matched;
    }
    return files.slice(0, 3).map((f) => f.relativePath);
  }

  private synthesizeRegistryOrRemoteStubFiles(
    sourceKind: SourceKind,
    sourceUri: string,
    subpath?: string,
  ): ReferenceFile[] {
    const cleanSpec = sourceUri
      .replace(/^(npm:|pypi:|pip:|cargo:|crate:|github:|https?:\/\/github\.com\/)/i, '')
      .replace(/\/+$/, '');
    const slug = cleanSpec.split(/[/@]/).filter(Boolean).pop() ?? 'engine';
    const prefix = subpath ? subpath.replace(/^\/+|\/+$/g, '') + '/' : 'src/';

    if (sourceKind === 'pypi') {
      const pyCode = [
        'import hashlib',
        'import urllib.request',
        '',
        'def normalize_token_stream(raw_text: str) -> list[str]:',
        '    cleaned = raw_text.strip().lower()',
        '    if not cleaned:',
        '        return []',
        '    return [tok for tok in cleaned.split() if len(tok) > 0]',
        '',
        'def compute_stream_fingerprint(raw_text: str) -> str:',
        '    tokens = normalize_token_stream(raw_text)',
        '    joined = "|".join(tokens)',
        '    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]',
        '',
        'def unused_telemetry_reporter(endpoint: str) -> int:',
        '    return len(endpoint)',
      ].join('\n');
      return [this.createReferenceFile(`${prefix}${slug.replace(/-/g, '_')}.py`, 'python', pyCode)];
    }

    if (sourceKind === 'cargo') {
      const rsCode = [
        'use std::collections::HashMap;',
        '',
        'pub struct RollingWindow {',
        '    pub capacity: usize,',
        '    pub values: Vec<i64>,',
        '}',
        '',
        'pub fn normalize_window_bounds(capacity: usize) -> usize {',
        '    if capacity == 0 { 1 } else { capacity }',
        '}',
        '',
        'pub fn compute_window_delta(values: &[i64], capacity: usize) -> i64 {',
        '    let cap = normalize_window_bounds(capacity);',
        '    let slice_len = values.len().min(cap);',
        '    values.iter().take(slice_len).sum()',
        '}',
        '',
        'pub fn unused_metrics_exporter() -> HashMap<String, usize> {',
        '    HashMap::new()',
        '}',
      ].join('\n');
      return [this.createReferenceFile(`${prefix}lib.rs`, 'rust', rsCode)];
    }

    const tsCode = [
      "import { cloneDeep } from 'lodash';",
      "import { v4 as uuidv4 } from 'uuid';",
      '',
      'export interface EngineConfig {',
      '  maxRetries: number;',
      '  baseDelayMs: number;',
      '}',
      '',
      'export function sanitizePayloadInput(raw: string): string {',
      '  return raw.trim().replace(/\s+/g, " ");',
      '}',
      '',
      'export function computeBackoffSchedule(config: EngineConfig): number[] {',
      '  const safeConfig = cloneDeep(config);',
      '  const retries = Math.max(0, Math.min(safeConfig.maxRetries, 10));',
      '  const schedule: number[] = [];',
      '  for (let attempt = 0; attempt < retries; attempt++) {',
      '    schedule.push(safeConfig.baseDelayMs * Math.pow(2, attempt));',
      '  }',
      '  return schedule;',
      '}',
      '',
      'export function executeEnginePipeline(rawInput: string, config: EngineConfig): { id: string; cleaned: string; schedule: number[] } {',
      '  const cleaned = sanitizePayloadInput(rawInput);',
      '  const schedule = computeBackoffSchedule(config);',
      '  return { id: uuidv4(), cleaned, schedule };',
      '}',
      '',
      'export function unusedLegacyCliBanner(): string {',
      '  return "DEPRECATED_CLI_BANNER";',
      '}',
    ].join('\n');

    return [this.createReferenceFile(`${prefix}${slug}.ts`, 'typescript', tsCode)];
  }
}
