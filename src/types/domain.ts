export type SourceKind = 'github' | 'local' | 'npm' | 'pypi' | 'cargo' | 'bundle';
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'rust' | 'go';
export type SymbolKind = 'function' | 'class' | 'struct' | 'interface' | 'type' | 'const';

export interface ReferenceFile {
  relativePath: string;
  language: SupportedLanguage;
  content: string;
  byteSize: number;
  lineCount: number;
}

export interface ReferenceSnapshot {
  snapshotId: string;
  sourceKind: SourceKind;
  originUri: string;
  files: ReferenceFile[];
  detectedEntrypoints: string[];
  ingestedAt: string;
  metadata?: {
    totalBytes: number;
    totalLines: number;
    languageBreakdown: Partial<Record<SupportedLanguage, number>>;
    normalizedBundle?: boolean;
  };
}

export interface IngestReferenceInput {
  sourceUri: string;
  sourceKind?: SourceKind;
  subpath?: string;
  inlineFiles?: Array<{ relativePath: string; content: string; language?: SupportedLanguage }>;
  bundleCode?: string;
  bundleLanguage?: SupportedLanguage;
}

export interface SymbolNode {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  language: SupportedLanguage;
  startLine: number;
  endLine: number;
  exported: boolean;
  sourceCode: string;
  calls: string[];
  externalImports: string[];
}

export interface EntrypointCandidate {
  symbol: SymbolNode;
  score: number;
  matchedKeywords: string[];
  centralityScore: number;
  rationale: string;
}

export interface CallGraphEdge {
  fromSymbolId: string;
  toSymbolId: string;
  callName: string;
}

export interface ZeroDepShimSpec {
  shimId: string;
  packageName: string;
  replacedApis: string[];
  description: string;
  inlineImplementation: Record<SupportedLanguage, string>;
}

export interface EngineSliceResult {
  sliceId: string;
  snapshotId: string;
  entrypointIds: string[];
  keptSymbols: SymbolNode[];
  prunedSymbolsCount: number;
  totalSymbolsCount: number;
  boilerplateReductionRatio: number;
  externalDependencies: string[];
  matchedZeroDepShims: ZeroDepShimSpec[];
  callGraphEdges: CallGraphEdge[];
}

export type ModuleSystem = 'esm' | 'commonjs' | 'python-module' | 'cargo-mod' | 'go-package';
export type NamingStyle = 'camelCase' | 'snake_case' | 'PascalCase';
export type IndentStyle = '2-spaces' | '4-spaces' | 'tabs';
export type QuoteStyle = 'single' | 'double';
export type ErrorHandlingIdiom = 'result-tuple' | 'try-catch-typed' | 'custom-error-class';

export interface TargetVibeProfile {
  targetLanguage: SupportedLanguage;
  moduleSystem: ModuleSystem;
  namingStyle: NamingStyle;
  indentStyle: IndentStyle;
  quoteStyle: QuoteStyle;
  semicolons: boolean;
  errorHandlingIdiom: ErrorHandlingIdiom;
  detectedFrom: string[];
}

export interface AlgorithmicBlueprint {
  engineName: string;
  coreAlgorithmSummary: string;
  stateTransitions: Array<{ fromState: string; event: string; toState: string; guard: string }>;
  pureFunctionSignatures: string[];
  edgeCaseInvariants: string[];
  timeSpaceComplexity: { time: string; space: string };
}

export interface ChameleonGraftResult {
  graftId: string;
  sliceId: string;
  engineName: string;
  targetProfile: TargetVibeProfile;
  inlinedShims: string[];
  adaptedCode: string;
  blueprint: AlgorithmicBlueprint;
  externalDepCount: number;
  recommendedFilePath: string;
}

export interface GoldenVector {
  id: string;
  category: 'empty' | 'boundary' | 'unicode' | 'malformed' | 'deterministic-seed';
  description: string;
  inputPayload: unknown;
  expectedInvariant: string;
  referenceDigest: string;
  graftDigest: string;
  passed: boolean;
}

export interface ParityVerificationReport {
  reportId: string;
  sliceId: string;
  graftId: string;
  verified: boolean;
  parityScore: number;
  zeroExternalDepsConfirmed: boolean;
  coveredSymbols: string[];
  goldenVectors: GoldenVector[];
  generatedTestSuite: string;
  generatedTestFilePath: string;
}

export interface GraftPatchResult {
  patchId: string;
  graftId: string;
  targetFilePath?: string;
  originalLineCount: number;
  patchedLineCount: number;
  unifiedDiff: string;
  patchedContent: string;
  integratedSymbols: string[];
  inlinedShims: string[];
}

export interface PreviewGraftPatchInput {
  graftId: string;
  targetFilePath?: string;
  targetFileContent?: string;
  integrationStrategy?: 'append' | 'prepend' | 'smart-replace-symbol';
}

export interface BenchmarkItemResult {
  name: string;
  operations: number;
  durationMs: number;
  opsPerSec: number;
  throughputMbPerSec?: number;
  status: 'passed' | 'failed';
}

export interface BenchmarkSuiteResult {
  suiteName: string;
  totalDurationMs: number;
  totalOperations: number;
  results: BenchmarkItemResult[];
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpus: number;
  };
}

export interface PolyfillTranspileOptions {
  stripUnusedImports?: boolean;
  consolidateImports?: boolean;
  encapsulateRustMod?: boolean;
  goPackageName?: string;
}


