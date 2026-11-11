import * as crypto from 'node:crypto';
import type {
  ChameleonGraftResult,
  GraftPatchResult,
  PreviewGraftPatchInput,
} from '../types/domain.js';

export interface PatchGeneratorOptions {
  contextLines?: number;
}

export class GraftPatchGenerator {
  private readonly patches = new Map<string, GraftPatchResult>();

  public generatePatch(
    graft: ChameleonGraftResult,
    input: PreviewGraftPatchInput,
    options: PatchGeneratorOptions = {},
  ): GraftPatchResult {
    const targetFilePath = input.targetFilePath || graft.recommendedFilePath;
    const originalContent = input.targetFileContent ?? '';
    const strategy = input.integrationStrategy ?? 'append';

    const patchedContent = this.applyGraftToContent(originalContent, graft, strategy);
    const originalLines = originalContent.length > 0 ? originalContent.split(/\r?\n/) : [];
    const patchedLines = patchedContent.length > 0 ? patchedContent.split(/\r?\n/) : [];

    const unifiedDiff = this.buildUnifiedDiff(
      originalLines,
      patchedLines,
      targetFilePath,
      options.contextLines ?? 3,
    );

    const patchHash = crypto
      .createHash('sha256')
      .update(graft.graftId + ':' + targetFilePath + ':' + strategy + ':' + patchedLines.length)
      .digest('hex')
      .slice(0, 12);
    const patchId = `patch_${patchHash}`;

    const result: GraftPatchResult = {
      patchId,
      graftId: graft.graftId,
      targetFilePath,
      originalLineCount: originalLines.length,
      patchedLineCount: patchedLines.length,
      unifiedDiff,
      patchedContent,
      integratedSymbols: graft.blueprint.pureFunctionSignatures.map((s) => s.split(' ')[1] || s),
      inlinedShims: graft.inlinedShims,
    };

    this.patches.set(patchId, result);
    return result;
  }

  public getPatch(patchId: string): GraftPatchResult | undefined {
    return this.patches.get(patchId);
  }

  private applyGraftToContent(
    original: string,
    graft: ChameleonGraftResult,
    strategy: 'append' | 'prepend' | 'smart-replace-symbol',
  ): string {
    const trimmedOriginal = original.trim();
    if (!trimmedOriginal) {
      return graft.adaptedCode.trim() + '\n';
    }

    // Deduplicate any shims already present in target file
    const filteredCode = this.filterRedundantShims(graft.adaptedCode, trimmedOriginal);

    if (strategy === 'prepend') {
      return `${filteredCode.trim()}\n\n${trimmedOriginal}\n`;
    }

    if (strategy === 'smart-replace-symbol') {
      // Look for top-level declaration of the primary engine function/class
      const primarySymbol = graft.engineName;
      const functionRegex = new RegExp(
        `(^|\\n)(?:export\\s+)?(?:async\\s+)?function\\s+${primarySymbol}\\b[\\s\\S]*?\\n\\}`,
        'm',
      );
      const classRegex = new RegExp(
        `(^|\\n)(?:export\\s+)?class\\s+${primarySymbol}\\b[\\s\\S]*?\\n\\}`,
        'm',
      );

      if (functionRegex.test(trimmedOriginal)) {
        return trimmedOriginal.replace(functionRegex, `\n${filteredCode.trim()}`) + '\n';
      }
      if (classRegex.test(trimmedOriginal)) {
        return trimmedOriginal.replace(classRegex, `\n${filteredCode.trim()}`) + '\n';
      }
      // If symbol not found, fall back to append
    }

    // Default 'append'
    return `${trimmedOriginal}\n\n// --- CloneVibe Chameleon Graft: ${graft.engineName} ---\n${filteredCode.trim()}\n`;
  }

  private filterRedundantShims(adaptedCode: string, existingContent: string): string {
    const knownShimMarkers = [
      { marker: 'function cloneDeep', regex: /\bfunction\s+cloneDeep\b/ },
      { marker: 'function uuidv4', regex: /\bfunction\s+uuidv4\b/ },
      { marker: 'function nativeJsonFetch', regex: /\bfunction\s+nativeJsonFetch\b/ },
      { marker: 'class SimpleLruCache', regex: /\bclass\s+SimpleLruCache\b/ },
      { marker: 'function parseSemVer', regex: /\bfunction\s+parseSemVer\b/ },
      { marker: 'function crc32', regex: /\bfunction\s+crc32\b/ },
      { marker: 'class SimpleEventEmitter', regex: /\bclass\s+SimpleEventEmitter\b/ },
    ];

    let result = adaptedCode;
    for (const { marker, regex } of knownShimMarkers) {
      if (regex.test(existingContent) && result.includes(marker)) {
        // If the shim is already in the host file, skip re-declaring it
        const shimBlockRegex = new RegExp(
          `\\n*(?:\\/\\/\\s*---\\s*Zero-Dependency Inline Micro-Shims\\s*---\\s*\\n)?(?:export\\s+)?(?:async\\s+)?(?:function|class|const)\\s+${marker.split(' ')[1]}\\b[\\s\\S]*?\\n\\}\\n*`,
          'g',
        );
        result = result.replace(shimBlockRegex, '\n');
      }
    }
    return result;
  }

  private buildUnifiedDiff(
    original: string[],
    patched: string[],
    filePath: string,
    context: number,
  ): string {
    const normPath = filePath.replace(/\\/g, '/');
    const header = [`--- a/${normPath}`, `+++ b/${normPath}`];

    if (original.length === 0 && patched.length === 0) {
      return header.join('\n');
    }

    if (original.length === 0) {
      const hunk = [`@@ -0,0 +1,${patched.length} @@`, ...patched.map((line) => `+${line}`)];
      return [...header, ...hunk].join('\n');
    }

    if (patched.length === 0) {
      const hunk = [`@@ -1,${original.length} +0,0 @@`, ...original.map((line) => `-${line}`)];
      return [...header, ...hunk].join('\n');
    }

    // Compute LCS matrix for clean diff
    const lcs = this.computeLcs(original, patched);
    const diffEntries: Array<{ type: 'same' | 'add' | 'del'; line: string }> = [];

    let i = original.length;
    let j = patched.length;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && original[i - 1] === patched[j - 1]) {
        diffEntries.unshift({ type: 'same', line: original[i - 1]! });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || lcs[i]![j - 1]! >= lcs[i - 1]![j]!)) {
        diffEntries.unshift({ type: 'add', line: patched[j - 1]! });
        j--;
      } else if (i > 0 && (j === 0 || lcs[i]![j - 1]! < lcs[i - 1]![j]!)) {
        diffEntries.unshift({ type: 'del', line: original[i - 1]! });
        i--;
      }
    }

    // Chunk into unified diff hunks
    const hunks = this.createHunks(diffEntries, context);
    if (hunks.length === 0) {
      return [...header, '@@ -1,1 +1,1 @@', ' ' + (original[0] || '')].join('\n');
    }

    return [...header, ...hunks].join('\n');
  }

  private computeLcs(a: string[], b: string[]): number[][] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i]![j] = dp[i - 1]![j - 1]! + 1;
        } else {
          dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
        }
      }
    }
    return dp;
  }

  private createHunks(
    diffEntries: Array<{ type: 'same' | 'add' | 'del'; line: string }>,
    context: number,
  ): string[] {
    const hunks: string[] = [];
    const changeIndices: number[] = [];

    for (let idx = 0; idx < diffEntries.length; idx++) {
      if (diffEntries[idx]!.type !== 'same') {
        changeIndices.push(idx);
      }
    }

    if (changeIndices.length === 0) return [];

    interface Group {
      start: number;
      end: number;
    }
    const groups: Group[] = [];
    let curGroup: Group = {
      start: Math.max(0, changeIndices[0]! - context),
      end: Math.min(diffEntries.length - 1, changeIndices[0]! + context),
    };

    for (let k = 1; k < changeIndices.length; k++) {
      const idx = changeIndices[k]!;
      const groupStart = Math.max(0, idx - context);
      const groupEnd = Math.min(diffEntries.length - 1, idx + context);

      if (groupStart <= curGroup.end + 1) {
        curGroup.end = Math.max(curGroup.end, groupEnd);
      } else {
        groups.push(curGroup);
        curGroup = { start: groupStart, end: groupEnd };
      }
    }
    groups.push(curGroup);

    for (const group of groups) {
      let origCount = 0;
      let patchCount = 0;
      let origStart = 1;
      let patchStart = 1;

      // Calculate line counts prior to hunk start
      for (let i = 0; i < group.start; i++) {
        const item = diffEntries[i]!;
        if (item.type === 'same' || item.type === 'del') origStart++;
        if (item.type === 'same' || item.type === 'add') patchStart++;
      }

      const hunkLines: string[] = [];
      for (let i = group.start; i <= group.end; i++) {
        const item = diffEntries[i]!;
        if (item.type === 'same') {
          origCount++;
          patchCount++;
          hunkLines.push(` ${item.line}`);
        } else if (item.type === 'del') {
          origCount++;
          hunkLines.push(`-${item.line}`);
        } else if (item.type === 'add') {
          patchCount++;
          hunkLines.push(`+${item.line}`);
        }
      }

      const hunkHeader = `@@ -${origStart},${origCount} +${patchStart},${patchCount} @@`;
      hunks.push([hunkHeader, ...hunkLines].join('\n'));
    }

    return hunks;
  }
}
