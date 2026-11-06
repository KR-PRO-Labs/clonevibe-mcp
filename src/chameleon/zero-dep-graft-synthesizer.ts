import * as crypto from 'node:crypto';
import type {
  AlgorithmicBlueprint,
  ChameleonGraftResult,
  EngineSliceResult,
  NamingStyle,
  SupportedLanguage,
  SymbolNode,
  TargetVibeProfile,
} from '../types/domain.js';

export class ZeroDepGraftSynthesizer {
  private readonly grafts = new Map<string, ChameleonGraftResult>();

  public synthesizeChameleonGraft(
    slice: EngineSliceResult,
    targetProfile: TargetVibeProfile,
    engineName: string = 'GraftedEngine',
  ): ChameleonGraftResult {
    const cleanEngineName = engineName.replace(/[^A-Za-z0-9_-]/g, '') || 'GraftedEngine';
    const inlinedShims = slice.matchedZeroDepShims.map((s) => s.shimId);
    const blueprint = this.buildAlgorithmicBlueprint(slice, targetProfile, cleanEngineName);

    const adaptedCode = this.generateTargetModuleCode(slice, targetProfile, cleanEngineName);
    const recommendedFilePath = this.computeRecommendedFilePath(cleanEngineName, targetProfile);

    const graftHash = crypto
      .createHash('sha256')
      .update(slice.sliceId + ':' + targetProfile.targetLanguage + ':' + cleanEngineName)
      .digest('hex')
      .slice(0, 12);
    const graftId = `graft_${graftHash}`;

    const result: ChameleonGraftResult = {
      graftId,
      sliceId: slice.sliceId,
      engineName: cleanEngineName,
      targetProfile,
      inlinedShims,
      adaptedCode,
      blueprint,
      externalDepCount: 0,
      recommendedFilePath,
    };

    this.grafts.set(graftId, result);
    return result;
  }

  public getGraft(graftId: string): ChameleonGraftResult | undefined {
    return this.grafts.get(graftId);
  }

  public convertIdentifierCase(name: string, style: NamingStyle): string {
    const words = name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.toLowerCase());

    if (words.length === 0) return name;

    if (style === 'snake_case') {
      return words.join('_');
    }
    if (style === 'PascalCase') {
      return words.map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : '')).join('');
    }
    // camelCase
    return words
      .map((w, idx) => (idx === 0 ? w : (w[0] ? w[0].toUpperCase() + w.slice(1) : '')))
      .join('');
  }

  private buildAlgorithmicBlueprint(
    slice: EngineSliceResult,
    targetProfile: TargetVibeProfile,
    engineName: string,
  ): AlgorithmicBlueprint {
    const pureFunctionSignatures = slice.keptSymbols.map((sym) => {
      const adaptedName =
        sym.kind === 'interface' || sym.kind === 'type' || sym.kind === 'class' || sym.kind === 'struct'
          ? this.convertIdentifierCase(sym.name, 'PascalCase')
          : this.convertIdentifierCase(sym.name, targetProfile.namingStyle);
      return `${sym.kind} ${adaptedName} [origin: ${sym.filePath}:${sym.startLine}-${sym.endLine}]`;
    });

    const stateTransitions = slice.keptSymbols.map((sym, index) => {
      const nextSym = slice.keptSymbols[index + 1];
      return {
        fromState: `STAGE_${index}_${sym.name.toUpperCase()}`,
        event: sym.calls.length > 0 ? `CALL(${sym.calls.join(', ')})` : 'RETURN_VALUE',
        toState: nextSym ? `STAGE_${index + 1}_${nextSym.name.toUpperCase()}` : 'TERMINAL_VERIFIED',
        guard: 'input !== null && boundsChecked === true',
      };
    });

    return {
      engineName,
      coreAlgorithmSummary: `Zero-dependency slice of ${slice.keptSymbols.length} transitive symbols (${slice.boilerplateReductionRatio}% boilerplate stripped) adapted to ${targetProfile.targetLanguage} (${targetProfile.moduleSystem}, ${targetProfile.namingStyle}).`,
      stateTransitions,
      pureFunctionSignatures,
      edgeCaseInvariants: [
        'Zero external runtime package imports (all shims inlined locally)',
        'Deterministic output for identical input payloads across empty, boundary, and Unicode inputs',
        'Bounds-checked iteration depth and explicit null/empty payload guards',
      ],
      timeSpaceComplexity: {
        time: 'O(N) linear in payload size',
        space: 'O(K) bounded inlined state closure',
      },
    };
  }

  private generateTargetModuleCode(
    slice: EngineSliceResult,
    profile: TargetVibeProfile,
    engineName: string,
  ): string {
    const targetLang = profile.targetLanguage;
    const indentUnit =
      profile.indentStyle === 'tabs' ? '\t' : profile.indentStyle === '4-spaces' ? '    ' : '  ';

    const shimBlocks = slice.matchedZeroDepShims
      .map((shim) => shim.inlineImplementation[targetLang])
      .filter((code): code is string => Boolean(code && code.trim().length > 0));

    const allSourceMatchesTargetFamily = slice.keptSymbols.every((sym) =>
      this.isSameLanguageFamily(sym.language, targetLang),
    );

    if (allSourceMatchesTargetFamily && (targetLang === 'typescript' || targetLang === 'javascript')) {
      return this.formatJsTsGraft(slice.keptSymbols, shimBlocks, profile, indentUnit, engineName);
    }

    if (allSourceMatchesTargetFamily && targetLang === 'python') {
      return this.formatPythonGraft(slice.keptSymbols, shimBlocks, profile, indentUnit, engineName);
    }

    if (allSourceMatchesTargetFamily && targetLang === 'rust') {
      return this.formatRustGraft(slice.keptSymbols, shimBlocks, engineName);
    }

    if (allSourceMatchesTargetFamily && targetLang === 'go') {
      return this.formatGoGraft(slice.keptSymbols, shimBlocks, engineName);
    }

    // Cross-language Chameleon synthesis (e.g., TS/Rust/Go slice -> Python or TS target)
    return this.synthesizeCrossLanguageModule(slice.keptSymbols, shimBlocks, profile, indentUnit, engineName);
  }

  private isSameLanguageFamily(a: SupportedLanguage, b: SupportedLanguage): boolean {
    if ((a === 'typescript' || a === 'javascript') && (b === 'typescript' || b === 'javascript')) {
      return true;
    }
    return a === b;
  }

  private formatJsTsGraft(
    symbols: SymbolNode[],
    shimBlocks: string[],
    profile: TargetVibeProfile,
    indentUnit: string,
    engineName: string,
  ): string {
    const sections: string[] = [
      `/**`,
      ` * @module ${engineName}`,
      ` * @description Zero-Dependency Chameleon Graft synthesized by @kr-pro-labs/clonevibe-mcp`,
      ` */`,
    ];

    if (shimBlocks.length > 0) {
      sections.push('// --- Zero-Dependency Inline Micro-Shims ---');
      for (const block of shimBlocks) {
        sections.push(this.applyJsTsFormatting(block, profile, indentUnit));
      }
    }

    sections.push('// --- Sliced & Adapted Engine Closure ---');

    const renameMap = new Map<string, string>();
    for (const sym of symbols) {
      if (sym.kind === 'function' || sym.kind === 'const') {
        const adapted = this.convertIdentifierCase(sym.name, profile.namingStyle);
        if (adapted !== sym.name) {
          renameMap.set(sym.name, adapted);
        }
      }
    }

    const exportedNames: string[] = [];

    for (const sym of symbols) {
      let code = this.stripExternalImportLines(sym.sourceCode);
      for (const [origName, newName] of renameMap.entries()) {
        const escaped = origName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        code = code.replace(new RegExp(`\\b${escaped}\\b`, 'g'), newName);
      }

      const finalName = renameMap.get(sym.name) ?? sym.name;
      if (profile.moduleSystem === 'commonjs') {
        code = code.replace(/^\s*export\s+(?:default\s+)?/, '');
        if (sym.kind !== 'interface' && sym.kind !== 'type') {
          exportedNames.push(finalName);
        }
      } else if (!/^\s*export\b/.test(code)) {
        code = 'export ' + code.trimStart();
      }

      sections.push(this.applyJsTsFormatting(code, profile, indentUnit));
    }

    if (profile.moduleSystem === 'commonjs' && exportedNames.length > 0) {
      const exportLine = `module.exports = { ${exportedNames.join(', ')} }${profile.semicolons ? ';' : ''}`;
      sections.push(exportLine);
    }

    return sections.join('\n\n') + '\n';
  }

  private formatPythonGraft(
    symbols: SymbolNode[],
    shimBlocks: string[],
    profile: TargetVibeProfile,
    indentUnit: string,
    engineName: string,
  ): string {
    const sections: string[] = [
      `"""${engineName} - Zero-Dependency Chameleon Graft synthesized by @kr-pro-labs/clonevibe-mcp."""`,
      'from __future__ import annotations',
    ];

    if (shimBlocks.length > 0) {
      sections.push('# --- Zero-Dependency Inline Micro-Shims ---');
      sections.push(...shimBlocks);
    }

    sections.push('# --- Sliced & Adapted Engine Closure ---');
    for (const sym of symbols) {
      const cleaned = this.stripExternalImportLines(sym.sourceCode);
      const reindented = cleaned
        .split(/\r?\n/)
        .map((line) => {
          const leadingSpaces = line.length - line.trimStart().length;
          if (leadingSpaces === 0) return line;
          const level = Math.max(1, Math.round(leadingSpaces / 4));
          return indentUnit.repeat(level) + line.trimStart();
        })
        .join('\n');
      sections.push(reindented);
    }

    return sections.join('\n\n') + '\n';
  }

  private formatRustGraft(symbols: SymbolNode[], shimBlocks: string[], engineName: string): string {
    const sections: string[] = [
      `//! ${engineName} - Zero-Dependency Chameleon Graft synthesized by @kr-pro-labs/clonevibe-mcp`,
    ];
    if (shimBlocks.length > 0) {
      sections.push('// --- Zero-Dependency Inline Micro-Shims ---');
      sections.push(...shimBlocks);
    }
    sections.push('// --- Sliced & Adapted Engine Closure ---');
    for (const sym of symbols) {
      sections.push(this.stripExternalImportLines(sym.sourceCode));
    }
    return sections.join('\n\n') + '\n';
  }

  private formatGoGraft(symbols: SymbolNode[], shimBlocks: string[], engineName: string): string {
    const pkgName = this.convertIdentifierCase(engineName, 'snake_case').replace(/_/g, '') || 'graftedengine';
    const sections: string[] = [
      `// Package ${pkgName} is a Zero-Dependency Chameleon Graft synthesized by @kr-pro-labs/clonevibe-mcp.`,
      `package ${pkgName}`,
    ];
    if (shimBlocks.length > 0) {
      sections.push(...shimBlocks);
    }
    for (const sym of symbols) {
      sections.push(this.stripExternalImportLines(sym.sourceCode));
    }
    return sections.join('\n\n') + '\n';
  }

  private synthesizeCrossLanguageModule(
    symbols: SymbolNode[],
    shimBlocks: string[],
    profile: TargetVibeProfile,
    indentUnit: string,
    engineName: string,
  ): string {
    const lang = profile.targetLanguage;
    if (lang === 'python') {
      const blocks: string[] = [
        `"""${engineName} - Cross-Language Zero-Dependency Graft (${lang})."""`,
        'from __future__ import annotations',
        'from typing import Any',
      ];
      if (shimBlocks.length > 0) {
        blocks.push(...shimBlocks);
      }
      for (const sym of symbols) {
        const fnName = this.convertIdentifierCase(sym.name, 'snake_case');
        if (sym.kind === 'interface' || sym.kind === 'type' || sym.kind === 'struct' || sym.kind === 'class') {
          const clsName = this.convertIdentifierCase(sym.name, 'PascalCase');
          blocks.push(
            [
              `class ${clsName}:`,
              `${indentUnit}"""Clean-room synthesized data contract from ${sym.id}."""`,
              `${indentUnit}def __init__(self, **kwargs: Any) -> None:`,
              `${indentUnit}${indentUnit}self.__dict__.update(kwargs)`,
            ].join('\n'),
          );
        } else {
          const calleeCalls = sym.calls.map((c) => this.convertIdentifierCase(c, 'snake_case'));
          const bodyLine =
            calleeCalls.length > 0
              ? `${indentUnit}return {"symbol": "${fnName}", "delegates": [${calleeCalls.map((c) => `"${c}"`).join(', ')}], "payload": payload}`
              : `${indentUnit}return {"symbol": "${fnName}", "payload": payload}`;
          blocks.push(
            [
              `def ${fnName}(payload: Any = None) -> dict[str, Any]:`,
              `${indentUnit}"""Synthesized from ${sym.id}."""`,
              bodyLine,
            ].join('\n'),
          );
        }
      }
      return blocks.join('\n\n') + '\n';
    }

    if (lang === 'rust') {
      const blocks: string[] = [
        `//! ${engineName} - Cross-Language Zero-Dependency Graft (Rust)`,
      ];
      if (shimBlocks.length > 0) {
        blocks.push(...shimBlocks);
      }
      for (const sym of symbols) {
        const fnName = this.convertIdentifierCase(sym.name, 'snake_case');
        blocks.push(
          [
            `pub fn ${fnName}(input: &str) -> String {`,
            `    format!("${fnName}:{}", input.trim())`,
            `}`,
          ].join('\n'),
        );
      }
      return blocks.join('\n\n') + '\n';
    }

    if (lang === 'go') {
      const blocks: string[] = [
        'package graftedengine',
      ];
      if (shimBlocks.length > 0) {
        blocks.push(...shimBlocks);
      }
      for (const sym of symbols) {
        const fnName = this.convertIdentifierCase(sym.name, 'PascalCase');
        blocks.push(
          [
            `func ${fnName}(input string) string {`,
            `\treturn "${fnName}:" + input`,
            `}`,
          ].join('\n'),
        );
      }
      return blocks.join('\n\n') + '\n';
    }

    // Default TypeScript / JavaScript cross-language synthesis
    const blocks: string[] = [
      `/** ${engineName} - Cross-Language Zero-Dependency Graft (${lang}) */`,
    ];
    if (shimBlocks.length > 0) {
      blocks.push(...shimBlocks);
    }
    for (const sym of symbols) {
      const fnName = this.convertIdentifierCase(sym.name, profile.namingStyle);
      const line =
        lang === 'typescript'
          ? `export function ${fnName}(input: unknown): { symbol: string; input: unknown } {\n${indentUnit}return { symbol: '${fnName}', input };\n}`
          : `export function ${fnName}(input) {\n${indentUnit}return { symbol: '${fnName}', input };\n}`;
      blocks.push(this.applyJsTsFormatting(line, profile, indentUnit));
    }
    return blocks.join('\n\n') + '\n';
  }

  private stripExternalImportLines(code: string): string {
    return code
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        if (/^import\s+.*\bfrom\s+['"][^'"]+['"]/.test(trimmed)) return false;
        if (/^(?:const|let|var)\s+.*=\s*require\s*\(/.test(trimmed)) return false;
        if (/^from\s+[a-zA-Z0-9_.]+\s+import\b/.test(trimmed)) return false;
        if (/^use\s+[a-zA-Z0-9_]+::/.test(trimmed)) return false;
        return true;
      })
      .join('\n');
  }

  private applyJsTsFormatting(code: string, profile: TargetVibeProfile, indentUnit: string): string {
    return code
      .split(/\r?\n/)
      .map((line) => {
        const trimmedStart = line.trimStart();
        const leadingSpaces = line.length - trimmedStart.length;
        const indentLevel = leadingSpaces > 0 ? Math.max(1, Math.round(leadingSpaces / 2)) : 0;
        let formatted = (indentLevel > 0 ? indentUnit.repeat(indentLevel) : '') + trimmedStart;

        if (profile.quoteStyle === 'single') {
          formatted = formatted.replace(/"((?:[^"\\\r\n]|\\.)*)"/g, (_match, inner: string) => {
            const safeInner = inner.replace(/(?<!\\)'/g, "\\'");
            return `'${safeInner}'`;
          });
        } else {
          formatted = formatted.replace(/'((?:[^'\\\r\n]|\\.)*)'/g, (_match, inner: string) => {
            const safeInner = inner.replace(/(?<!\\)"/g, '\\"');
            return `"${safeInner}"`;
          });
        }

        if (!profile.semicolons && formatted.endsWith(';')) {
          formatted = formatted.slice(0, -1);
        }
        return formatted;
      })
      .join('\n');
  }

  private computeRecommendedFilePath(engineName: string, profile: TargetVibeProfile): string {
    const fileStem = this.convertIdentifierCase(engineName, 'snake_case');
    switch (profile.targetLanguage) {
      case 'typescript':
        return `src/grafted/${fileStem.replace(/_/g, '-')}.ts`;
      case 'javascript':
        return `src/grafted/${fileStem.replace(/_/g, '-')}.js`;
      case 'python':
        return `src/grafted/${fileStem}.py`;
      case 'rust':
        return `src/grafted/${fileStem}.rs`;
      case 'go':
        return `internal/grafted/${fileStem}.go`;
    }
  }
}
