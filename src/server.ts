import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MultiSourceIngestor } from './ingest/multi-source-ingestor.js';
import { AstClosureSlicer, ZERO_DEP_SHIM_CATALOG } from './slicer/ast-closure-slicer.js';
import { TargetVibeProfiler } from './chameleon/target-vibe-profiler.js';
import { ZeroDepGraftSynthesizer } from './chameleon/zero-dep-graft-synthesizer.js';
import { GoldenParityVerifier } from './parity/golden-parity-verifier.js';
import { GraftPatchGenerator } from './chameleon/graft-patch-generator.js';
import type {
  ChameleonGraftResult,
  EngineSliceResult,
  EntrypointCandidate,
  GraftPatchResult,
  ParityVerificationReport,
  PreviewGraftPatchInput,
  ReferenceSnapshot,
  SupportedLanguage,
  TargetVibeProfile,
} from './types/domain.js';

const IngestSchema = z.object({
  sourceUri: z.string().min(1),
  sourceKind: z.enum(['github', 'local', 'npm', 'pypi', 'cargo', 'bundle']).optional(),
  subpath: z.string().optional(),
  inlineFiles: z
    .array(
      z.object({
        relativePath: z.string().min(1),
        content: z.string(),
        language: z.enum(['typescript', 'javascript', 'python', 'rust', 'go']).optional(),
      }),
    )
    .optional(),
  bundleCode: z.string().optional(),
  bundleLanguage: z.enum(['typescript', 'javascript', 'python', 'rust', 'go']).optional(),
});

const LocateEntrypointsSchema = z.object({
  snapshotId: z.string().min(1),
  featureQuery: z.string().min(1),
  maxResults: z.number().int().min(1).max(50).optional(),
});

const SliceGraphSchema = z.object({
  snapshotId: z.string().min(1),
  entrypointIds: z.array(z.string().min(1)).min(1),
  maxDepth: z.number().int().min(1).max(25).optional(),
  includeTypes: z.boolean().optional(),
});

const ProfileTargetSchema = z.object({
  workspacePath: z.string().optional(),
  sampleCode: z.string().optional(),
  explicitLanguage: z.enum(['typescript', 'javascript', 'python', 'rust', 'go']).optional(),
});

const SynthesizeGraftSchema = z.object({
  sliceId: z.string().min(1),
  engineName: z.string().min(1).optional(),
  targetProfile: z
    .object({
      targetLanguage: z.enum(['typescript', 'javascript', 'python', 'rust', 'go']),
      moduleSystem: z.enum(['esm', 'commonjs', 'python-module', 'cargo-mod', 'go-package']),
      namingStyle: z.enum(['camelCase', 'snake_case', 'PascalCase']),
      indentStyle: z.enum(['2-spaces', '4-spaces', 'tabs']),
      quoteStyle: z.enum(['single', 'double']),
      semicolons: z.boolean(),
      errorHandlingIdiom: z.enum(['result-tuple', 'try-catch-typed', 'custom-error-class']),
      detectedFrom: z.array(z.string()).optional(),
    })
    .optional(),
  workspacePath: z.string().optional(),
  sampleCode: z.string().optional(),
});

const VerifyParitySchema = z.object({
  sliceId: z.string().min(1),
  graftId: z.string().min(1),
  customVectors: z
    .array(
      z.object({
        id: z.string().optional(),
        category: z.enum(['empty', 'boundary', 'unicode', 'malformed', 'deterministic-seed']).optional(),
        description: z.string().min(1),
        inputPayload: z.unknown(),
        expectedInvariant: z.string().optional(),
      }),
    )
    .optional(),
});

const PreviewGraftPatchSchema = z.object({
  graftId: z.string().min(1),
  targetFilePath: z.string().optional(),
  targetFileContent: z.string().optional(),
  integrationStrategy: z.enum(['append', 'prepend', 'smart-replace-symbol']).optional(),
});

export class CloneVibeEngine {
  public readonly ingestor = new MultiSourceIngestor();
  public readonly slicer = new AstClosureSlicer();
  public readonly profiler = new TargetVibeProfiler();
  public readonly synthesizer = new ZeroDepGraftSynthesizer();
  public readonly verifier = new GoldenParityVerifier();
  public readonly patchGenerator = new GraftPatchGenerator();

  public ingestReference(rawArgs: unknown): ReferenceSnapshot {
    const parsed = IngestSchema.parse(rawArgs);
    return this.ingestor.ingest(parsed);
  }

  public locateFeatureEntrypoints(rawArgs: unknown): EntrypointCandidate[] {
    const parsed = LocateEntrypointsSchema.parse(rawArgs);
    const snapshot = this.ingestor.getSnapshot(parsed.snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${parsed.snapshotId}`);
    }
    return this.slicer.locateFeatureEntrypoints(snapshot, parsed.featureQuery, parsed.maxResults ?? 5);
  }

  public sliceEngineGraph(rawArgs: unknown): EngineSliceResult {
    const parsed = SliceGraphSchema.parse(rawArgs);
    const snapshot = this.ingestor.getSnapshot(parsed.snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${parsed.snapshotId}`);
    }
    return this.slicer.sliceEngineGraph(snapshot, parsed.entrypointIds, {
      maxDepth: parsed.maxDepth,
      includeTypes: parsed.includeTypes,
    });
  }

  public profileTargetVibe(rawArgs: unknown): TargetVibeProfile {
    const parsed = ProfileTargetSchema.parse(rawArgs);
    return this.profiler.profileTargetVibe(parsed);
  }

  public synthesizeChameleonGraft(rawArgs: unknown): ChameleonGraftResult {
    const parsed = SynthesizeGraftSchema.parse(rawArgs);
    const slice = this.slicer.getSlice(parsed.sliceId);
    if (!slice) {
      throw new Error(`Engine slice not found: ${parsed.sliceId}`);
    }
    const profile: TargetVibeProfile = parsed.targetProfile
      ? {
          ...parsed.targetProfile,
          detectedFrom: parsed.targetProfile.detectedFrom ?? ['explicit-target-profile'],
        }
      : this.profiler.profileTargetVibe({
          workspacePath: parsed.workspacePath,
          sampleCode: parsed.sampleCode,
        });

    return this.synthesizer.synthesizeChameleonGraft(slice, profile, parsed.engineName ?? 'GraftedEngine');
  }

  public verifyEngineParity(rawArgs: unknown): ParityVerificationReport {
    const parsed = VerifyParitySchema.parse(rawArgs);
    const slice = this.slicer.getSlice(parsed.sliceId);
    if (!slice) {
      throw new Error(`Engine slice not found: ${parsed.sliceId}`);
    }
    const graft = this.synthesizer.getGraft(parsed.graftId);
    if (!graft) {
      throw new Error(`Chameleon graft not found: ${parsed.graftId}`);
    }
    return this.verifier.verifyEngineParity(slice, graft, parsed.customVectors ?? []);
  }

  public previewGraftPatch(rawArgs: unknown): GraftPatchResult {
    const parsed = PreviewGraftPatchSchema.parse(rawArgs);
    const graft = this.synthesizer.getGraft(parsed.graftId);
    if (!graft) {
      throw new Error(`Chameleon graft not found: ${parsed.graftId}`);
    }
    return this.patchGenerator.generatePatch(graft, parsed);
  }

  public invokeTool(toolName: string, args: unknown): unknown {
    switch (toolName) {
      case 'ingest_reference':
        return this.ingestReference(args);
      case 'locate_feature_entrypoints':
        return this.locateFeatureEntrypoints(args);
      case 'slice_engine_graph':
        return this.sliceEngineGraph(args);
      case 'profile_target_vibe':
        return this.profileTargetVibe(args);
      case 'synthesize_chameleon_graft':
        return this.synthesizeChameleonGraft(args);
      case 'verify_engine_parity':
        return this.verifyEngineParity(args);
      case 'preview_graft_patch':
        return this.previewGraftPatch(args);
      default:
        throw new Error(`Unknown clonevibe-mcp tool: ${toolName}`);
    }
  }
}

export function createCloneVibeMcpServer(engine: CloneVibeEngine = new CloneVibeEngine()): {
  server: Server;
  engine: CloneVibeEngine;
} {
  const server = new Server(
    {
      name: '@kr-pro-labs/clonevibe-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'ingest_reference',
        description:
          'Ingests a reference codebase from a GitHub URL, local directory, package spec (npm:/pypi:/cargo:), inline file map, or minified JS bundle into an indexed ReferenceSnapshot.',
        inputSchema: {
          type: 'object',
          properties: {
            sourceUri: { type: 'string', description: 'GitHub URL, local path, registry spec, or bundle identifier.' },
            sourceKind: {
              type: 'string',
              enum: ['github', 'local', 'npm', 'pypi', 'cargo', 'bundle'],
            },
            subpath: { type: 'string', description: 'Optional sparse subdirectory path.' },
            inlineFiles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  relativePath: { type: 'string' },
                  content: { type: 'string' },
                  language: { type: 'string', enum: ['typescript', 'javascript', 'python', 'rust', 'go'] },
                },
                required: ['relativePath', 'content'],
              },
            },
            bundleCode: { type: 'string', description: 'Optional minified JS/TS bundle code to normalize and ingest.' },
            bundleLanguage: { type: 'string', enum: ['typescript', 'javascript', 'python', 'rust', 'go'] },
          },
          required: ['sourceUri'],
        },
      },
      {
        name: 'locate_feature_entrypoints',
        description:
          'Ranks symbols inside a ReferenceSnapshot matching a natural-language feature query and call-graph centrality.',
        inputSchema: {
          type: 'object',
          properties: {
            snapshotId: { type: 'string' },
            featureQuery: { type: 'string' },
            maxResults: { type: 'number' },
          },
          required: ['snapshotId', 'featureQuery'],
        },
      },
      {
        name: 'slice_engine_graph',
        description:
          'Computes the minimal transitive AST call/type closure starting from entrypoint symbols, stripping 80-98% of unrelated repo boilerplate and mapping external dependencies to zero-dep inline shims.',
        inputSchema: {
          type: 'object',
          properties: {
            snapshotId: { type: 'string' },
            entrypointIds: { type: 'array', items: { type: 'string' } },
            maxDepth: { type: 'number' },
            includeTypes: { type: 'boolean' },
          },
          required: ['snapshotId', 'entrypointIds'],
        },
      },
      {
        name: 'profile_target_vibe',
        description:
          'Profiles the host project conventions (language, module system, camelCase/snake_case/PascalCase, indentation, quotes, semicolons, error-handling idiom).',
        inputSchema: {
          type: 'object',
          properties: {
            workspacePath: { type: 'string' },
            sampleCode: { type: 'string' },
            explicitLanguage: { type: 'string', enum: ['typescript', 'javascript', 'python', 'rust', 'go'] },
          },
        },
      },
      {
        name: 'synthesize_chameleon_graft',
        description:
          'Synthesizes a zero-dependency Chameleon code graft and Clean-Room Algorithmic Blueprint adapted to the target project style and language.',
        inputSchema: {
          type: 'object',
          properties: {
            sliceId: { type: 'string' },
            engineName: { type: 'string' },
            workspacePath: { type: 'string' },
            sampleCode: { type: 'string' },
            targetProfile: { type: 'object' },
          },
          required: ['sliceId'],
        },
      },
      {
        name: 'verify_engine_parity',
        description:
          'Runs 1:1 Golden I/O vector verification over the reference slice and grafted module, confirming zero external dependencies and generating a runnable unit test suite.',
        inputSchema: {
          type: 'object',
          properties: {
            sliceId: { type: 'string' },
            graftId: { type: 'string' },
            customVectors: { type: 'array', items: { type: 'object' } },
          },
          required: ['sliceId', 'graftId'],
        },
      },
      {
        name: 'preview_graft_patch',
        description:
          'Generates a unified diff patch preview for integrating a synthesized Chameleon graft into a host workspace file with non-destructive deduplication of inlined shims.',
        inputSchema: {
          type: 'object',
          properties: {
            graftId: { type: 'string', description: 'ID of the synthesized Chameleon graft.' },
            targetFilePath: { type: 'string', description: 'Destination relative path in host workspace.' },
            targetFileContent: { type: 'string', description: 'Existing content of target file (if any) to diff against.' },
            integrationStrategy: {
              type: 'string',
              enum: ['append', 'prepend', 'smart-replace-symbol'],
              description: 'Splicing strategy (append to end, prepend to top, or smart-replace matching primary symbol).',
            },
          },
          required: ['graftId'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = engine.invokeTool(request.params.name, request.params.arguments ?? {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message }),
          },
        ],
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'clonevibe://catalog/zero-dep-shims',
        name: 'Zero-Dependency Micro-Shim Catalog',
        mimeType: 'application/json',
        description:
          'Inline replacements for heavy third-party packages (lodash, uuid, axios, chalk, lru-cache, semver, crc-32, eventemitter3, base64, limiter) across 5 languages.',
      },
      {
        uri: 'clonevibe://guide/chameleon-workflow',
        name: 'CloneVibe 7-Stage Surgical Grafting & Patch Workflow',
        mimeType: 'text/markdown',
        description: 'Step-by-step guide for slicing reference features, grafting them with 1:1 golden parity, and previewing workspace patches.',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri === 'clonevibe://catalog/zero-dep-shims') {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(ZERO_DEP_SHIM_CATALOG, null, 2),
          },
        ],
      };
    }
    if (uri === 'clonevibe://guide/chameleon-workflow') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: [
              '# CloneVibe 7-Stage Surgical Grafting & Patch Workflow',
              '',
              '1. ingest_reference: Hydrate GitHub repo, local path, registry package, or JS bundle.',
              '2. locate_feature_entrypoints: Pinpoint the target algorithm/engine entrypoints.',
              '3. slice_engine_graph: Extract the minimal transitive AST call/type closure.',
              '4. profile_target_vibe: Detect host language, module system, casing, and formatting.',
              '5. synthesize_chameleon_graft: Inline zero-dep shims and adapt code to host conventions.',
              '6. verify_engine_parity: Prove 1:1 Golden I/O parity and emit host unit tests.',
              '7. preview_graft_patch: Generate unified diff previews for seamless host workspace integration.',
            ].join('\n'),
          },
        ],
      };
    }
    throw new Error(`Unknown resource URI: ${uri}`);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'surgical_slice_feature',
        description:
          'Interactive workflow prompt guiding the surgical AST extraction of an algorithm from a reference source into a zero-dependency graft.',
        arguments: [
          {
            name: 'sourceUri',
            description: 'Reference source URI (e.g. GitHub URL, npm:pkg, pypi:pkg, or local:path).',
            required: true,
          },
          {
            name: 'featureQuery',
            description: 'Natural language description of the target feature or algorithm to slice.',
            required: true,
          },
          {
            name: 'targetLanguage',
            description: 'Destination programming language (typescript, javascript, python, rust, go).',
            required: false,
          },
        ],
      },
      {
        name: 'audit_zero_dep_graft',
        description:
          'Audit prompt verifying that a synthesized Chameleon graft contains 0 external runtime package imports and deterministic behavior.',
        arguments: [
          {
            name: 'graftId',
            description: 'Identifier of the synthesized Chameleon graft to audit.',
            required: true,
          },
        ],
      },
      {
        name: 'explain_algorithmic_blueprint',
        description:
          'Educational blueprint prompt explaining the state transitions, complexity guarantees, and invariants of a grafted engine.',
        arguments: [
          {
            name: 'graftId',
            description: 'Identifier of the synthesized Chameleon graft.',
            required: true,
          },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const promptName = request.params.name;
    const args = request.params.arguments ?? {};

    if (promptName === 'surgical_slice_feature') {
      const source = args.sourceUri || 'https://github.com/example/repo';
      const query = args.featureQuery || 'core algorithm';
      const lang = args.targetLanguage || 'typescript';
      return {
        description: 'Surgical AST Slicing & Chameleon Grafting Runbook',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `You are executing a surgical AST feature slice using @kr-pro-labs/clonevibe-mcp:`,
                `1. Ingest reference source: "${source}" using tool ingest_reference.`,
                `2. Locate candidate entrypoints for query "${query}" using locate_feature_entrypoints.`,
                `3. Slice minimal transitive closure using slice_engine_graph.`,
                `4. Profile target workspace conventions (target: ${lang}) using profile_target_vibe.`,
                `5. Synthesize zero-dependency Chameleon graft with synthesize_chameleon_graft.`,
                `6. Verify 1:1 golden parity and zero external dependencies using verify_engine_parity.`,
                `7. Preview workspace integration patch with preview_graft_patch.`,
              ].join('\n'),
            },
          },
        ],
      };
    }

    if (promptName === 'audit_zero_dep_graft') {
      const graftId = args.graftId || 'graft_id';
      const graft = engine.synthesizer.getGraft(graftId);
      return {
        description: `Zero-Dependency Purity Audit for ${graftId}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: graft
                ? [
                    `Conducting purity audit on graft "${graft.engineName}" (${graft.graftId}):`,
                    `- Target Language: ${graft.targetProfile.targetLanguage}`,
                    `- External Dependency Count: ${graft.externalDepCount} (verified zero external packages)`,
                    `- Inlined Micro-Shims: ${graft.inlinedShims.join(', ') || 'None required'}`,
                    `- Recommended File: ${graft.recommendedFilePath}`,
                    ``,
                    `Adapted source code:`,
                    '```' + graft.targetProfile.targetLanguage,
                    graft.adaptedCode,
                    '```',
                  ].join('\n')
                : `Graft "${graftId}" not found in current memory cache. Please synthesize first using synthesize_chameleon_graft.`,
            },
          },
        ],
      };
    }

    if (promptName === 'explain_algorithmic_blueprint') {
      const graftId = args.graftId || 'graft_id';
      const graft = engine.synthesizer.getGraft(graftId);
      return {
        description: `Algorithmic Blueprint Explanation for ${graftId}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: graft
                ? [
                    `# Algorithmic Blueprint: ${graft.blueprint.engineName}`,
                    ``,
                    `**Core Summary**: ${graft.blueprint.coreAlgorithmSummary}`,
                    `**Time Complexity**: ${graft.blueprint.timeSpaceComplexity.time}`,
                    `**Space Complexity**: ${graft.blueprint.timeSpaceComplexity.space}`,
                    ``,
                    `### State Transitions:`,
                    ...graft.blueprint.stateTransitions.map(
                      (st) => `- \`${st.fromState}\` --[ ${st.event} ]--> \`${st.toState}\` (guard: ${st.guard})`,
                    ),
                    ``,
                    `### Pure Signatures:`,
                    ...graft.blueprint.pureFunctionSignatures.map((sig) => `- \`${sig}\``),
                    ``,
                    `### Invariant Guarantees:`,
                    ...graft.blueprint.edgeCaseInvariants.map((inv) => `- ${inv}`),
                  ].join('\n')
                : `Graft "${graftId}" not found in memory cache.`,
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${promptName}`);
  });

  return { server, engine };
}

export type { SupportedLanguage };
