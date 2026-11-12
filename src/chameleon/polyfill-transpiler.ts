import type {
  PolyfillTranspileOptions,
  SupportedLanguage,
  SymbolNode,
} from '../types/domain.js';

export interface TranspiledModuleOutput {
  code: string;
  inlinedImports: string[];
  inlinedShimCount: number;
}

export class AutoPolyfillTranspiler {
  /**
   * Consolidates Go package code by gathering all imports into a single top-level
   * import block, deduplicating them, and stripping scattered imports from bodies.
   */
  public consolidateGoModule(
    shimBlocks: string[],
    symbolBlocks: string[],
    packageName: string = 'graftedengine',
    engineName: string = 'GraftedEngine',
  ): TranspiledModuleOutput {
    const pkg = packageName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'graftedengine';
    const rawImports = new Set<string>();

    const cleanShimBlocks = shimBlocks.map((block) => {
      return this.extractAndStripGoImports(block, rawImports);
    });

    const cleanSymbolBlocks = symbolBlocks.map((block) => {
      return this.extractAndStripGoImports(block, rawImports);
    });

    const sortedImports = Array.from(rawImports).sort();

    const sections: string[] = [
      `// Package ${pkg} is a Zero-Dependency Chameleon Graft synthesized by @kr-pro-labs/clonevibe-mcp.`,
      `// Engine: ${engineName}`,
      `package ${pkg}`,
    ];

    if (sortedImports.length > 0) {
      if (sortedImports.length === 1) {
        sections.push(`import ${sortedImports[0]}`);
      } else {
        sections.push('import (\n\t' + sortedImports.join('\n\t') + '\n)');
      }
    }

    if (cleanShimBlocks.length > 0) {
      sections.push('// --- Zero-Dependency Inline Micro-Shims ---');
      sections.push(...cleanShimBlocks.filter((b) => b.trim().length > 0));
    }

    if (cleanSymbolBlocks.length > 0) {
      sections.push('// --- Sliced & Adapted Engine Closure ---');
      sections.push(...cleanSymbolBlocks.filter((b) => b.trim().length > 0));
    }

    return {
      code: sections.join('\n\n') + '\n',
      inlinedImports: sortedImports,
      inlinedShimCount: shimBlocks.length,
    };
  }

  /**
   * Consolidates Python module code by gathering all standard library imports
   * into a single top-level header, sorted and deduplicated, with annotations at the top.
   */
  public consolidatePythonModule(
    shimBlocks: string[],
    symbolBlocks: string[],
    engineName: string = 'GraftedEngine',
  ): TranspiledModuleOutput {
    const rawImports = new Set<string>();

    const cleanShimBlocks = shimBlocks.map((block) => {
      return this.extractAndStripPythonImports(block, rawImports);
    });

    const cleanSymbolBlocks = symbolBlocks.map((block) => {
      return this.extractAndStripPythonImports(block, rawImports);
    });

    const sortedImports = Array.from(rawImports).sort();

    const sections: string[] = [
      `"""${engineName} - Zero-Dependency Chameleon Graft synthesized by @kr-pro-labs/clonevibe-mcp."""`,
      'from __future__ import annotations',
    ];

    if (sortedImports.length > 0) {
      sections.push(sortedImports.join('\n'));
    }

    if (cleanShimBlocks.length > 0) {
      sections.push('# --- Zero-Dependency Inline Micro-Shims ---');
      sections.push(...cleanShimBlocks.filter((b) => b.trim().length > 0));
    }

    if (cleanSymbolBlocks.length > 0) {
      sections.push('# --- Sliced & Adapted Engine Closure ---');
      sections.push(...cleanSymbolBlocks.filter((b) => b.trim().length > 0));
    }

    return {
      code: sections.join('\n\n') + '\n',
      inlinedImports: sortedImports,
      inlinedShimCount: shimBlocks.length,
    };
  }

  /**
   * Consolidates Rust module code with unified `use std::...` headers,
   * optional encapsulation in `pub mod zero_dep_shims`, and public item visibility.
   */
  public consolidateRustModule(
    shimBlocks: string[],
    symbolBlocks: string[],
    engineName: string = 'GraftedEngine',
    options: PolyfillTranspileOptions = {},
  ): TranspiledModuleOutput {
    const rawUses = new Set<string>();

    const cleanShimBlocks = shimBlocks.map((block) => {
      return this.extractAndStripRustUses(block, rawUses);
    });

    const cleanSymbolBlocks = symbolBlocks.map((block) => {
      return this.extractAndStripRustUses(block, rawUses);
    });

    const sortedUses = Array.from(rawUses).sort();

    const sections: string[] = [
      `//! ${engineName} - Zero-Dependency Chameleon Graft synthesized by @kr-pro-labs/clonevibe-mcp`,
    ];

    if (sortedUses.length > 0) {
      sections.push(sortedUses.join('\n'));
    }

    if (cleanShimBlocks.length > 0) {
      if (options.encapsulateRustMod) {
        sections.push(
          [
            '// --- Zero-Dependency Inline Micro-Shims (Isolated Mod) ---',
            'pub mod zero_dep_shims {',
            ...cleanShimBlocks.map((b) =>
              b
                .split('\n')
                .map((line) => (line.trim().length > 0 ? `    ${line}` : line))
                .join('\n'),
            ),
            '}',
            'pub use zero_dep_shims::*;',
          ].join('\n'),
        );
      } else {
        sections.push('// --- Zero-Dependency Inline Micro-Shims ---');
        sections.push(...cleanShimBlocks.filter((b) => b.trim().length > 0));
      }
    }

    if (cleanSymbolBlocks.length > 0) {
      sections.push('// --- Sliced & Adapted Engine Closure ---');
      sections.push(...cleanSymbolBlocks.filter((b) => b.trim().length > 0));
    }

    return {
      code: sections.join('\n\n') + '\n',
      inlinedImports: sortedUses,
      inlinedShimCount: shimBlocks.length,
    };
  }

  /**
   * Rewrites known third-party call patterns into local zero-dep shim calls.
   */
  public transpileAstCallExpressions(code: string, language: SupportedLanguage): string {
    let result = code;

    switch (language) {
      case 'typescript':
      case 'javascript': {
        // Lodash calls
        result = result.replace(/\blodash\.cloneDeep\(/g, 'cloneDeep(');
        result = result.replace(/\b_\.cloneDeep\(/g, 'cloneDeep(');
        // UUID calls
        result = result.replace(/\buuid\.v4\(\)/g, 'uuidv4()');
        result = result.replace(/\buuidv4\(\)/g, 'uuidv4()');
        // Axios calls
        result = result.replace(/\baxios\.get\(([^)]+)\)/g, 'nativeJsonFetch($1)');
        result = result.replace(/\baxios\.post\(([^,)]+),\s*([^)]+)\)/g, 'nativeJsonFetch($1, { method: "POST", body: JSON.stringify($2) })');
        // Base64 calls
        result = result.replace(/\bBase64\.encode\(/g, 'base64Encode(');
        result = result.replace(/\bBase64\.decode\(/g, 'base64Decode(');
        break;
      }
      case 'python': {
        // deepcopy
        result = result.replace(/\bcopy\.deepcopy\(/g, 'clone_deep(');
        result = result.replace(/\b_std_copy\.deepcopy\(/g, 'clone_deep(');
        // uuid
        result = result.replace(/\buuid\.uuid4\(\)/g, 'uuid_v4()');
        result = result.replace(/\b_std_uuid\.uuid4\(\)/g, 'uuid_v4()');
        // requests
        result = result.replace(/\brequests\.get\(([^)]+)\)\.json\(\)/g, 'native_json_fetch($1)');
        // zlib crc32
        result = result.replace(/\bzlib\.crc32\(/g, 'crc32(');
        // base64
        result = result.replace(/\bbase64\.b64encode\(/g, 'base64_encode(');
        result = result.replace(/\bbase64\.b64decode\(/g, 'base64_decode(');
        break;
      }
      case 'rust': {
        result = result.replace(/\bbase64::encode\(/g, 'base64_encode(');
        break;
      }
      case 'go': {
        result = result.replace(/\bcrc32\.ChecksumIEEE\(/g, 'computeCrc32(');
        break;
      }
    }

    return result;
  }

  private extractAndStripGoImports(code: string, importSet: Set<string>): string {
    const lines = code.split(/\r?\n/);
    const cleanedLines: string[] = [];
    let insideImportBlock = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('package ')) {
        // Strip package headers from inlined snippets
        continue;
      }

      if (line === 'import (') {
        insideImportBlock = true;
        continue;
      }

      if (insideImportBlock) {
        if (line === ')') {
          insideImportBlock = false;
          continue;
        }
        if (line.length > 0) {
          importSet.add(line);
        }
        continue;
      }

      if (line.startsWith('import ') && !line.includes('(')) {
        const spec = line.replace(/^import\s+/, '').trim();
        if (spec.length > 0) {
          importSet.add(spec);
        }
        continue;
      }

      cleanedLines.push(rawLine);
    }

    return cleanedLines.join('\n').trim();
  }

  private extractAndStripPythonImports(code: string, importSet: Set<string>): string {
    const lines = code.split(/\r?\n/);
    const cleanedLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line === 'from __future__ import annotations') {
        continue;
      }

      if (line.startsWith('import ') || line.startsWith('from ')) {
        importSet.add(line);
        continue;
      }

      cleanedLines.push(rawLine);
    }

    return cleanedLines.join('\n').trim();
  }

  private extractAndStripRustUses(code: string, useSet: Set<string>): string {
    const lines = code.split(/\r?\n/);
    const cleanedLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('use ') && line.endsWith(';')) {
        useSet.add(line);
        continue;
      }

      cleanedLines.push(rawLine);
    }

    return cleanedLines.join('\n').trim();
  }
}
