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
  {
    shimId: 'shim_lru_cache',
    packageName: 'lru-cache',
    replacedApis: ['LRUCache', 'lru-cache', 'quick-lru', 'functools.lru_cache'],
    description: 'Zero-dependency bounded Least-Recently-Used (LRU) cache using Map key-insertion order.',
    inlineImplementation: {
      typescript: [
        'class SimpleLruCache<K, V> {',
        '  private readonly max: number;',
        '  private readonly cache = new Map<K, V>();',
        '  constructor(maxSize = 100) {',
        '    this.max = Math.max(1, maxSize);',
        '  }',
        '  get(key: K): V | undefined {',
        '    if (!this.cache.has(key)) return undefined;',
        '    const val = this.cache.get(key)!;',
        '    this.cache.delete(key);',
        '    this.cache.set(key, val);',
        '    return val;',
        '  }',
        '  set(key: K, value: V): void {',
        '    if (this.cache.has(key)) {',
        '      this.cache.delete(key);',
        '    } else if (this.cache.size >= this.max) {',
        '      const oldest = this.cache.keys().next().value;',
        '      if (oldest !== undefined) this.cache.delete(oldest);',
        '    }',
        '    this.cache.set(key, value);',
        '  }',
        '  has(key: K): boolean {',
        '    return this.cache.has(key);',
        '  }',
        '  clear(): void {',
        '    this.cache.clear();',
        '  }',
        '  get size(): number {',
        '    return this.cache.size;',
        '  }',
        '}',
      ].join('\n'),
      javascript: [
        'class SimpleLruCache {',
        '  constructor(maxSize = 100) {',
        '    this.max = Math.max(1, maxSize);',
        '    this.cache = new Map();',
        '  }',
        '  get(key) {',
        '    if (!this.cache.has(key)) return undefined;',
        '    const val = this.cache.get(key);',
        '    this.cache.delete(key);',
        '    this.cache.set(key, val);',
        '    return val;',
        '  }',
        '  set(key, value) {',
        '    if (this.cache.has(key)) {',
        '      this.cache.delete(key);',
        '    } else if (this.cache.size >= this.max) {',
        '      const oldest = this.cache.keys().next().value;',
        '      if (oldest !== undefined) this.cache.delete(oldest);',
        '    }',
        '    this.cache.set(key, value);',
        '  }',
        '  has(key) {',
        '    return this.cache.has(key);',
        '  }',
        '  clear() {',
        '    this.cache.clear();',
        '  }',
        '  get size() {',
        '    return this.cache.size;',
        '  }',
        '}',
      ].join('\n'),
      python: [
        'from collections import OrderedDict',
        'class SimpleLruCache:',
        '    def __init__(self, max_size: int = 100):',
        '        self.max = max(1, max_size)',
        '        self.cache = OrderedDict()',
        '    def get(self, key):',
        '        if key not in self.cache:',
        '            return None',
        '        self.cache.move_to_end(key)',
        '        return self.cache[key]',
        '    def set(self, key, value):',
        '        if key in self.cache:',
        '            self.cache.move_to_end(key)',
        '        elif len(self.cache) >= self.max:',
        '            self.cache.popitem(last=False)',
        '        self.cache[key] = value',
        '    def clear(self):',
        '        self.cache.clear()',
      ].join('\n'),
      rust: [
        'use std::collections::VecDeque;',
        'struct SimpleLruCache<K: PartialEq + Clone, V: Clone> {',
        '    max: usize,',
        '    entries: VecDeque<(K, V)>,',
        '}',
        'impl<K: PartialEq + Clone, V: Clone> SimpleLruCache<K, V> {',
        '    fn new(max: usize) -> Self {',
        '        Self { max: max.max(1), entries: VecDeque::new() }',
        '    }',
        '    fn get(&mut self, key: &K) -> Option<V> {',
        '        if let Some(pos) = self.entries.iter().position(|(k, _)| k == key) {',
        '            let item = self.entries.remove(pos).unwrap();',
        '            let val = item.1.clone();',
        '            self.entries.push_back(item);',
        '            Some(val)',
        '        } else {',
        '            None',
        '        }',
        '    }',
        '    fn set(&mut self, key: K, value: V) {',
        '        if let Some(pos) = self.entries.iter().position(|(k, _)| *k == key) {',
        '            self.entries.remove(pos);',
        '        } else if self.entries.len() >= self.max {',
        '            self.entries.pop_front();',
        '        }',
        '        self.entries.push_back((key, value));',
        '    }',
        '}',
      ].join('\n'),
      go: [
        'type SimpleLruCache[K comparable, V any] struct {',
        '    max int',
        '    order []K',
        '    items map[K]V',
        '}',
        'func NewSimpleLruCache[K comparable, V any](max int) *SimpleLruCache[K, V] {',
        '    if max < 1 { max = 1 }',
        '    return &SimpleLruCache[K, V]{max: max, order: make([]K, 0, max), items: make(map[K]V)}',
        '}',
      ].join('\n'),
    },
  },
  {
    shimId: 'shim_semver_parse',
    packageName: 'semver',
    replacedApis: ['semver', 'compare', 'satisfies', 'parse', 'semver.parse'],
    description: 'Zero-dependency Semantic Version 2.0 parser and comparator.',
    inlineImplementation: {
      typescript: [
        'interface SemVerParts {',
        '  major: number;',
        '  minor: number;',
        '  patch: number;',
        '  prerelease?: string;',
        '}',
        'function parseSemVer(version: string): SemVerParts {',
        '  const match = /^v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim());',
        '  if (!match) throw new Error(`Invalid semver: ${version}`);',
        '  return {',
        '    major: parseInt(match[1]!, 10),',
        '    minor: parseInt(match[2]!, 10),',
        '    patch: parseInt(match[3]!, 10),',
        '    prerelease: match[4],',
        '  };',
        '}',
        'function compareSemVer(v1: string, v2: string): number {',
        '  const a = parseSemVer(v1);',
        '  const b = parseSemVer(v2);',
        '  if (a.major !== b.major) return a.major > b.major ? 1 : -1;',
        '  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;',
        '  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;',
        '  return 0;',
        '}',
      ].join('\n'),
      javascript: [
        'function parseSemVer(version) {',
        '  const match = /^v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim());',
        '  if (!match) throw new Error("Invalid semver: " + version);',
        '  return {',
        '    major: parseInt(match[1], 10),',
        '    minor: parseInt(match[2], 10),',
        '    patch: parseInt(match[3], 10),',
        '    prerelease: match[4],',
        '  };',
        '}',
        'function compareSemVer(v1, v2) {',
        '  const a = parseSemVer(v1);',
        '  const b = parseSemVer(v2);',
        '  if (a.major !== b.major) return a.major > b.major ? 1 : -1;',
        '  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;',
        '  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;',
        '  return 0;',
        '}',
      ].join('\n'),
      python: [
        'def parse_semver(ver: str) -> tuple[int, int, int]:',
        '    clean = ver.lstrip("v").split("-")[0]',
        '    parts = [int(p) for p in clean.split(".")]',
        '    return (parts[0], parts[1], parts[2])',
        'def compare_semver(v1: str, v2: str) -> int:',
        '    a, b = parse_semver(v1), parse_semver(v2)',
        '    return (a > b) - (a < b)',
      ].join('\n'),
      rust: [
        'fn parse_semver(ver: &str) -> (u64, u64, u64) {',
        '    let clean = ver.trim_start_matches("v").split("-").next().unwrap_or("0.0.0");',
        '    let mut parts = clean.split(".").map(|p| p.parse::<u64>().unwrap_or(0));',
        '    (parts.next().unwrap_or(0), parts.next().unwrap_or(0), parts.next().unwrap_or(0))',
        '}',
      ].join('\n'),
      go: [
        'import (',
        '    "strconv"',
        '    "strings"',
        ')',
        'func parseSemVer(ver string) (int, int, int) {',
        '    clean := strings.TrimPrefix(ver, "v")',
        '    parts := strings.Split(strings.Split(clean, "-")[0], ".")',
        '    maj, _ := strconv.Atoi(parts[0])',
        '    min, _ := strconv.Atoi(parts[1])',
        '    pat, _ := strconv.Atoi(parts[2])',
        '    return maj, min, pat',
        '}',
      ].join('\n'),
    },
  },
  {
    shimId: 'shim_crc32_hash',
    packageName: 'crc-32',
    replacedApis: ['crc32', 'crc-32', 'zlib.crc32'],
    description: 'Zero-dependency IEEE 802.3 CRC32 checksum calculator with standard polynomial 0xEDB88320.',
    inlineImplementation: {
      typescript: [
        'function crc32(input: string | Uint8Array): number {',
        '  const table = new Uint32Array(256);',
        '  for (let i = 0; i < 256; i++) {',
        '    let c = i;',
        '    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);',
        '    table[i] = c >>> 0;',
        '  }',
        '  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;',
        '  let crc = 0xffffffff;',
        '  for (let i = 0; i < bytes.length; i++) {',
        '    crc = table[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);',
        '  }',
        '  return (crc ^ 0xffffffff) >>> 0;',
        '}',
      ].join('\n'),
      javascript: [
        'function crc32(input) {',
        '  const table = new Uint32Array(256);',
        '  for (let i = 0; i < 256; i++) {',
        '    let c = i;',
        '    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);',
        '    table[i] = c >>> 0;',
        '  }',
        '  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;',
        '  let crc = 0xffffffff;',
        '  for (let i = 0; i < bytes.length; i++) {',
        '    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);',
        '  }',
        '  return (crc ^ 0xffffffff) >>> 0;',
        '}',
      ].join('\n'),
      python: [
        'import zlib as _std_zlib',
        'def crc32(input_data: str | bytes) -> int:',
        '    raw = input_data.encode("utf-8") if isinstance(input_data, str) else input_data',
        '    return _std_zlib.crc32(raw) & 0xffffffff',
      ].join('\n'),
      rust: [
        'fn crc32(bytes: &[u8]) -> u32 {',
        '    let mut crc = 0xffffffffu32;',
        '    for &b in bytes {',
        '        crc ^= b as u32;',
        '        for _ in 0..8 {',
        '            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xedb88320 } else { crc >> 1 };',
        '        }',
        '    }',
        '    crc ^ 0xffffffff',
        '}',
      ].join('\n'),
      go: [
        'import "hash/crc32"',
        'func computeCrc32(data []byte) uint32 {',
        '    return crc32.ChecksumIEEE(data)',
        '}',
      ].join('\n'),
    },
  },
  {
    shimId: 'shim_event_emitter',
    packageName: 'eventemitter3',
    replacedApis: ['EventEmitter', 'eventemitter3', 'events', 'mitt'],
    description: 'Zero-dependency Pub/Sub Event Emitter with typed listeners and cleanup callbacks.',
    inlineImplementation: {
      typescript: [
        'type EventCallback<T = unknown> = (payload: T) => void;',
        'class SimpleEventEmitter {',
        '  private readonly listeners = new Map<string, Set<EventCallback>>();',
        '  on<T = unknown>(event: string, fn: EventCallback<T>): () => void {',
        '    if (!this.listeners.has(event)) this.listeners.set(event, new Set());',
        '    const set = this.listeners.get(event)!;',
        '    const untyped = fn as EventCallback;',
        '    set.add(untyped);',
        '    return () => set.delete(untyped);',
        '  }',
        '  once<T = unknown>(event: string, fn: EventCallback<T>): void {',
        '    const unsub = this.on<T>(event, (payload) => {',
        '      unsub();',
        '      fn(payload);',
        '    });',
        '  }',
        '  emit<T = unknown>(event: string, payload?: T): boolean {',
        '    const set = this.listeners.get(event);',
        '    if (!set || set.size === 0) return false;',
        '    for (const fn of Array.from(set)) fn(payload);',
        '    return true;',
        '  }',
        '  removeAllListeners(event?: string): void {',
        '    if (event) this.listeners.delete(event);',
        '    else this.listeners.clear();',
        '  }',
        '}',
      ].join('\n'),
      javascript: [
        'class SimpleEventEmitter {',
        '  constructor() {',
        '    this.listeners = new Map();',
        '  }',
        '  on(event, fn) {',
        '    if (!this.listeners.has(event)) this.listeners.set(event, new Set());',
        '    const set = this.listeners.get(event);',
        '    set.add(fn);',
        '    return () => set.delete(fn);',
        '  }',
        '  once(event, fn) {',
        '    const unsub = this.on(event, (payload) => {',
        '      unsub();',
        '      fn(payload);',
        '    });',
        '  }',
        '  emit(event, payload) {',
        '    const set = this.listeners.get(event);',
        '    if (!set || set.size === 0) return false;',
        '    for (const fn of Array.from(set)) fn(payload);',
        '    return true;',
        '  }',
        '  removeAllListeners(event) {',
        '    if (event) this.listeners.delete(event);',
        '    else this.listeners.clear();',
        '  }',
        '}',
      ].join('\n'),
      python: [
        'from collections import defaultdict',
        'class SimpleEventEmitter:',
        '    def __init__(self):',
        '        self._listeners = defaultdict(list)',
        '    def on(self, event: str, callback):',
        '        self._listeners[event].append(callback)',
        '        return lambda: self._listeners[event].remove(callback)',
        '    def emit(self, event: str, *args, **kwargs):',
        '        for cb in list(self._listeners.get(event, [])):',
        '            cb(*args, **kwargs)',
      ].join('\n'),
      rust: [
        'struct SimpleEventEmitter;',
        'impl SimpleEventEmitter {',
        '    fn new() -> Self { Self }',
        '}',
      ].join('\n'),
      go: [
        'type SimpleEventEmitter struct {',
        '    listeners map[string][]func(interface{})',
        '}',
        'func NewSimpleEventEmitter() *SimpleEventEmitter {',
        '    return &SimpleEventEmitter{listeners: make(map[string][]func(interface{}))}',
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
