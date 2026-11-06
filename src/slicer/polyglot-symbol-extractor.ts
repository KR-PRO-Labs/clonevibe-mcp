import type {
  ReferenceFile,
  ReferenceSnapshot,
  SupportedLanguage,
  SymbolKind,
  SymbolNode,
} from '../types/domain.js';

const PYTHON_STDLIB = new Set([
  'abc', 'asyncio', 'collections', 'contextlib', 'copy', 'csv', 'ctypes',
  'dataclasses', 'datetime', 'decimal', 'enum', 'functools', 'glob', 'gzip',
  'hashlib', 'hmac', 'html', 'http', 'importlib', 'inspect', 'io', 'itertools',
  'json', 'logging', 'math', 'multiprocessing', 'operator', 'os', 'pathlib',
  'pickle', 'platform', 'pprint', 'queue', 'random', 're', 'shutil', 'signal',
  'socket', 'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'struct',
  'subprocess', 'sys', 'tempfile', 'textwrap', 'threading', 'time', 'Timer',
  'traceback', 'types', 'typing', 'unittest', 'urllib', 'uuid', 'warnings',
  'weakref', 'xml', 'zipfile', 'zlib', '__future__',
]);

const RUST_STD_CRATES = new Set(['std', 'core', 'alloc', 'crate', 'self', 'super']);

interface RawDeclarationMatch {
  name: string;
  kind: SymbolKind;
  startLine: number; // 1-indexed
  exported: boolean;
}

export class PolyglotSymbolExtractor {
  public extractFromSnapshot(snapshot: ReferenceSnapshot): SymbolNode[] {
    const rawNodes: SymbolNode[] = [];

    for (const file of snapshot.files) {
      const fileNodes = this.extractFromFile(file);
      rawNodes.push(...fileNodes);
    }

    const allSymbolNames = new Set(rawNodes.map((n) => n.name));
    const byName = new Map<string, SymbolNode[]>();
    for (const node of rawNodes) {
      const list = byName.get(node.name) ?? [];
      list.push(node);
      byName.set(node.name, list);
    }

    for (const node of rawNodes) {
      const codeWithoutComments = this.stripComments(node.sourceCode, node.language);
      const calls = new Set<string>();
      for (const candidateName of allSymbolNames) {
        if (candidateName === node.name) {
          continue;
        }
        const escaped = candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`);
        if (re.test(codeWithoutComments)) {
          calls.add(candidateName);
        }
      }
      node.calls = Array.from(calls).sort();
    }

    // Propagate externalImports transitively along intra-repo call edges
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of rawNodes) {
        const currentSet = new Set(node.externalImports);
        for (const calleeName of node.calls) {
          const callees = byName.get(calleeName) ?? [];
          for (const callee of callees) {
            for (const imp of callee.externalImports) {
              if (!currentSet.has(imp)) {
                currentSet.add(imp);
                changed = true;
              }
            }
          }
        }
        if (currentSet.size !== node.externalImports.length) {
          node.externalImports = Array.from(currentSet).sort();
        }
      }
    }

    return rawNodes;
  }

  public extractFromFile(file: ReferenceFile): SymbolNode[] {
    const lines = file.content.split(/\r?\n/);
    const maskedLines = this.maskCommentsAndStrings(file.content, file.language).split(/\r?\n/);
    const externalImports = this.extractExternalImports(file.content, file.language);
    const importBindings = this.extractImportBindings(file.content, file.language, externalImports);
    const declarations = this.findTopLevelDeclarations(lines, maskedLines, file.language);
    const nodes: SymbolNode[] = [];

    const rawSlices: Array<{
      decl: RawDeclarationMatch;
      endLine: number;
      sourceCode: string;
      codeWithoutComments: string;
    }> = [];

    for (let i = 0; i < declarations.length; i++) {
      const decl = declarations[i];
      if (!decl) continue;
      const nextDeclStart = declarations[i + 1]?.startLine ?? lines.length + 1;
      const endLine = this.computeDeclarationEndLine(
        lines,
        maskedLines,
        decl.startLine,
        nextDeclStart - 1,
        file.language,
      );
      const sliceLines = lines.slice(decl.startLine - 1, endLine);
      const sourceCode = sliceLines.join('\n').trimEnd();
      const codeWithoutComments = this.stripComments(sourceCode, file.language);
      rawSlices.push({ decl, endLine, sourceCode, codeWithoutComments });
    }

    // Determine which external packages are explicitly referenced by at least one symbol in this file
    const packagesWithExplicitSymbolMatch = new Set<string>();
    for (const pkg of externalImports) {
      const tokens = importBindings.get(pkg) ?? [pkg];
      for (const item of rawSlices) {
        if (this.codeReferencesAnyIdentifier(item.codeWithoutComments, tokens)) {
          packagesWithExplicitSymbolMatch.add(pkg);
          break;
        }
      }
    }

    for (const { decl, endLine, sourceCode, codeWithoutComments } of rawSlices) {
      const usedImports = externalImports.filter((pkg) => {
        if (sourceCode.length === 0) return false;
        const tokens = importBindings.get(pkg) ?? [pkg];
        if (packagesWithExplicitSymbolMatch.has(pkg)) {
          return this.codeReferencesAnyIdentifier(codeWithoutComments, tokens);
        }
        // Fallback when an imported package has no explicit local identifier match in any symbol body
        return true;
      });

      nodes.push({
        id: `${file.relativePath}#${decl.name}`,
        name: decl.name,
        kind: decl.kind,
        filePath: file.relativePath,
        language: file.language,
        startLine: decl.startLine,
        endLine,
        exported: decl.exported,
        sourceCode,
        calls: [],
        externalImports: usedImports,
      });
    }

    return nodes;
  }

  public extractExternalImports(content: string, language: SupportedLanguage): string[] {
    const imports = new Set<string>();
    const cleanContent = this.stripComments(content, language);
    const lines = cleanContent.split(/\r?\n/);

    if (language === 'typescript' || language === 'javascript') {
      const importFromRe = /\bfrom\s+['"]([^'"]+)['"]/g;
      const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = importFromRe.exec(cleanContent)) !== null) {
        const spec = match[1];
        if (spec && !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:')) {
          imports.add(this.normalizeNpmPackageName(spec));
        }
      }
      while ((match = requireRe.exec(cleanContent)) !== null) {
        const spec = match[1];
        if (spec && !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:')) {
          imports.add(this.normalizeNpmPackageName(spec));
        }
      }
    } else if (language === 'python') {
      for (const line of lines) {
        const trimmed = line.trim();
        const fromMatch = /^from\s+([a-zA-Z0-9_\.]+)\s+import\b/.exec(trimmed);
        if (fromMatch && fromMatch[1] && !fromMatch[1].startsWith('.')) {
          const rootPkg = fromMatch[1].split('.')[0] ?? '';
          if (rootPkg && !PYTHON_STDLIB.has(rootPkg)) {
            imports.add(rootPkg);
          }
          continue;
        }
        const impMatch = /^import\s+([a-zA-Z0-9_\.]+)/.exec(trimmed);
        if (impMatch && impMatch[1]) {
          const rootPkg = impMatch[1].split('.')[0] ?? '';
          if (rootPkg && !PYTHON_STDLIB.has(rootPkg)) {
            imports.add(rootPkg);
          }
        }
      }
    } else if (language === 'rust') {
      for (const line of lines) {
        const trimmed = line.trim();
        const useMatch = /^(?:pub\s+)?use\s+([a-zA-Z0-9_]+)::/.exec(trimmed);
        if (useMatch && useMatch[1] && !RUST_STD_CRATES.has(useMatch[1])) {
          imports.add(useMatch[1]);
        }
      }
    } else if (language === 'go') {
      const goImpRe = /"([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = goImpRe.exec(cleanContent)) !== null) {
        const spec = match[1];
        if (spec && spec.includes('.') && !spec.includes(' ')) {
          imports.add(spec);
        }
      }
    }

    return Array.from(imports).sort();
  }

  private extractImportBindings(
    content: string,
    language: SupportedLanguage,
    externalImports: string[],
  ): Map<string, string[]> {
    const bindings = new Map<string, Set<string>>();
    for (const pkg of externalImports) {
      const shortName = pkg.split('/').pop()?.replace(/^@/, '').replace(/-/g, '') ?? pkg;
      bindings.set(pkg, new Set([pkg, shortName]));
    }

    const lines = content.split(/\r?\n/);
    if (language === 'typescript' || language === 'javascript') {
      for (const line of lines) {
        const trimmed = line.trim();
        const importMatch = /^import\s+(?:type\s+)?(.+?)\s+from\s+['"]([^'"]+)['"]/.exec(trimmed);
        if (importMatch && importMatch[1] && importMatch[2]) {
          const pkg = this.normalizeNpmPackageName(importMatch[2]);
          const set = bindings.get(pkg);
          if (set) {
            const clause = importMatch[1];
            for (const tok of this.parseJsImportClauseIdentifiers(clause)) {
              set.add(tok);
            }
          }
        }
        const reqMatch = /^(?:const|let|var)\s+(.+?)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(trimmed);
        if (reqMatch && reqMatch[1] && reqMatch[2]) {
          const pkg = this.normalizeNpmPackageName(reqMatch[2]);
          const set = bindings.get(pkg);
          if (set) {
            for (const tok of this.parseJsImportClauseIdentifiers(reqMatch[1])) {
              set.add(tok);
            }
          }
        }
      }
    } else if (language === 'python') {
      for (const line of lines) {
        const trimmed = line.trim();
        const fromMatch = /^from\s+([a-zA-Z0-9_.]+)\s+import\s+(.+)$/.exec(trimmed);
        if (fromMatch && fromMatch[1] && fromMatch[2]) {
          const rootPkg = fromMatch[1].split('.')[0] ?? '';
          const set = bindings.get(rootPkg);
          if (set) {
            for (const part of fromMatch[2].split(',')) {
              const alias = part.trim().split(/\s+as\s+/i).pop()?.trim();
              if (alias && /^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
                set.add(alias);
              }
            }
          }
        }
      }
    }

    const result = new Map<string, string[]>();
    for (const [pkg, set] of bindings.entries()) {
      result.set(pkg, Array.from(set));
    }
    return result;
  }

  private parseJsImportClauseIdentifiers(clause: string): string[] {
    const out: string[] = [];
    const cleaned = clause.replace(/[{}]/g, ',');
    for (const segment of cleaned.split(',')) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const asParts = trimmed.split(/\s+as\s+/);
      const localName = (asParts[asParts.length - 1] ?? '').replace(/^\*\s*/, '').trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(localName)) {
        out.push(localName);
      }
    }
    return out;
  }

  private codeReferencesAnyIdentifier(code: string, identifiers: string[]): boolean {
    for (const id of identifiers) {
      if (!id) continue;
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`).test(code)) {
        return true;
      }
    }
    return false;
  }

  private normalizeNpmPackageName(specifier: string): string {
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/');
      return parts.slice(0, 2).join('/');
    }
    return specifier.split('/')[0] ?? specifier;
  }

  private findTopLevelDeclarations(
    lines: string[],
    maskedLines: string[],
    language: SupportedLanguage,
  ): RawDeclarationMatch[] {
    const results: RawDeclarationMatch[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = maskedLines[idx] ?? lines[idx] ?? '';
      const lineNum = idx + 1;

      if (language === 'typescript' || language === 'javascript') {
        const fnMatch =
          /^\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[<(]/.exec(line);
        if (fnMatch && fnMatch[2]) {
          results.push({
            name: fnMatch[2],
            kind: 'function',
            startLine: lineNum,
            exported: Boolean(fnMatch[1]) || line.includes('module.exports'),
          });
          continue;
        }

        const classMatch =
          /^\s*(export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/.exec(line);
        if (classMatch && classMatch[2]) {
          results.push({
            name: classMatch[2],
            kind: 'class',
            startLine: lineNum,
            exported: Boolean(classMatch[1]),
          });
          continue;
        }

        const ifaceMatch = /^\s*(export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/.exec(line);
        if (ifaceMatch && ifaceMatch[2]) {
          results.push({
            name: ifaceMatch[2],
            kind: 'interface',
            startLine: lineNum,
            exported: Boolean(ifaceMatch[1]),
          });
          continue;
        }

        const typeMatch = /^\s*(export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/.exec(line);
        if (typeMatch && typeMatch[2]) {
          results.push({
            name: typeMatch[2],
            kind: 'type',
            startLine: lineNum,
            exported: Boolean(typeMatch[1]),
          });
          continue;
        }

        const arrowOrConstMatch =
          /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/.exec(
            line,
          );
        if (arrowOrConstMatch && arrowOrConstMatch[2]) {
          results.push({
            name: arrowOrConstMatch[2],
            kind: 'function',
            startLine: lineNum,
            exported: Boolean(arrowOrConstMatch[1]),
          });
          continue;
        }

        const topConstMatch = /^\s*(export\s+)const\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/.exec(line);
        if (topConstMatch && topConstMatch[2]) {
          results.push({
            name: topConstMatch[2],
            kind: 'const',
            startLine: lineNum,
            exported: true,
          });
        }
      } else if (language === 'python') {
        const pyFnMatch = /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(line);
        if (pyFnMatch && pyFnMatch[1]) {
          results.push({
            name: pyFnMatch[1],
            kind: 'function',
            startLine: lineNum,
            exported: !pyFnMatch[1].startsWith('_'),
          });
          continue;
        }
        const pyClassMatch = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
        if (pyClassMatch && pyClassMatch[1]) {
          results.push({
            name: pyClassMatch[1],
            kind: 'class',
            startLine: lineNum,
            exported: !pyClassMatch[1].startsWith('_'),
          });
        }
      } else if (language === 'rust') {
        const rsFnMatch = /^\s*(pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:const\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(
          line,
        );
        if (rsFnMatch && rsFnMatch[2]) {
          results.push({
            name: rsFnMatch[2],
            kind: 'function',
            startLine: lineNum,
            exported: Boolean(rsFnMatch[1]),
          });
          continue;
        }
        const rsStructMatch = /^\s*(pub(?:\([^)]+\))?\s+)?(?:struct|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
        if (rsStructMatch && rsStructMatch[2]) {
          results.push({
            name: rsStructMatch[2],
            kind: 'struct',
            startLine: lineNum,
            exported: Boolean(rsStructMatch[1]),
          });
          continue;
        }
        const rsTraitMatch = /^\s*(pub(?:\([^)]+\))?\s+)?trait\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
        if (rsTraitMatch && rsTraitMatch[2]) {
          results.push({
            name: rsTraitMatch[2],
            kind: 'interface',
            startLine: lineNum,
            exported: Boolean(rsTraitMatch[1]),
          });
        }
      } else if (language === 'go') {
        const goFnMatch = /^func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(line);
        if (goFnMatch && goFnMatch[1]) {
          const firstChar = goFnMatch[1][0] ?? '';
          results.push({
            name: goFnMatch[1],
            kind: 'function',
            startLine: lineNum,
            exported: firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase(),
          });
          continue;
        }
        const goTypeMatch = /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)\b/.exec(line);
        if (goTypeMatch && goTypeMatch[1] && goTypeMatch[2]) {
          const firstChar = goTypeMatch[1][0] ?? '';
          results.push({
            name: goTypeMatch[1],
            kind: goTypeMatch[2] === 'struct' ? 'struct' : 'interface',
            startLine: lineNum,
            exported: firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase(),
          });
        }
      }
    }

    return results;
  }

  private computeDeclarationEndLine(
    lines: string[],
    maskedLines: string[],
    startLine: number,
    maxEndLine: number,
    language: SupportedLanguage,
  ): number {
    if (language === 'python') {
      let endLine = startLine;
      for (let lineNum = startLine + 1; lineNum <= maxEndLine; lineNum++) {
        const raw = lines[lineNum - 1] ?? '';
        const trimmed = raw.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
          continue;
        }
        const indent = raw.length - raw.trimStart().length;
        if (indent === 0) {
          break;
        }
        endLine = lineNum;
      }
      return endLine;
    }

    let braceDepth = 0;
    let sawOpenBrace = false;
    for (let lineNum = startLine; lineNum <= maxEndLine; lineNum++) {
      const masked = maskedLines[lineNum - 1] ?? lines[lineNum - 1] ?? '';
      for (let i = 0; i < masked.length; i++) {
        const ch = masked[i];
        if (ch === '{') {
          braceDepth++;
          sawOpenBrace = true;
        } else if (ch === '}') {
          braceDepth--;
        }
      }
      if (sawOpenBrace && braceDepth <= 0) {
        return lineNum;
      }
      if (!sawOpenBrace && masked.trimEnd().endsWith(';')) {
        return lineNum;
      }
    }
    return maxEndLine;
  }

  /**
   * Replaces characters inside comments and string/template literals with spaces
   * (preserving newlines) so brace counting and top-level declaration scanning
   * are immune to unbalanced braces or keywords inside strings and comments.
   */
  public maskCommentsAndStrings(content: string, language: SupportedLanguage): string {
    if (language === 'python') {
      return content
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*$/, ''))
        .join('\n');
    }

    const chars = Array.from(content);
    const len = chars.length;
    let i = 0;
    let state: 'code' | 'line-comment' | 'block-comment' | 'single-quote' | 'double-quote' | 'backtick' = 'code';

    while (i < len) {
      const ch = chars[i] ?? '';
      const next = chars[i + 1] ?? '';

      if (state === 'code') {
        if (ch === '/' && next === '/') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          state = 'line-comment';
          continue;
        }
        if (ch === '/' && next === '*') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          state = 'block-comment';
          continue;
        }
        if (ch === "'") {
          state = 'single-quote';
          i++;
          continue;
        }
        if (ch === '"') {
          state = 'double-quote';
          i++;
          continue;
        }
        if (ch === '`') {
          state = 'backtick';
          i++;
          continue;
        }
        i++;
      } else if (state === 'line-comment') {
        if (ch === '\n' || ch === '\r') {
          state = 'code';
        } else {
          chars[i] = ' ';
        }
        i++;
      } else if (state === 'block-comment') {
        if (ch === '*' && next === '/') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          state = 'code';
          continue;
        }
        if (ch !== '\n' && ch !== '\r') {
          chars[i] = ' ';
        }
        i++;
      } else if (state === 'single-quote') {
        if (ch === '\\') {
          chars[i] = ' ';
          if (i + 1 < len && chars[i + 1] !== '\n' && chars[i + 1] !== '\r') {
            chars[i + 1] = ' ';
          }
          i += 2;
          continue;
        }
        if (ch === "'" || ch === '\n' || ch === '\r') {
          state = 'code';
        } else {
          chars[i] = ' ';
        }
        i++;
      } else if (state === 'double-quote') {
        if (ch === '\\') {
          chars[i] = ' ';
          if (i + 1 < len && chars[i + 1] !== '\n' && chars[i + 1] !== '\r') {
            chars[i + 1] = ' ';
          }
          i += 2;
          continue;
        }
        if (ch === '"' || ch === '\n' || ch === '\r') {
          state = 'code';
        } else {
          chars[i] = ' ';
        }
        i++;
      } else if (state === 'backtick') {
        if (ch === '\\') {
          chars[i] = ' ';
          if (i + 1 < len && chars[i + 1] !== '\n' && chars[i + 1] !== '\r') {
            chars[i + 1] = ' ';
          }
          i += 2;
          continue;
        }
        if (ch === '`') {
          state = 'code';
        } else if (ch !== '\n' && ch !== '\r') {
          chars[i] = ' ';
        }
        i++;
      }
    }

    return chars.join('');
  }

  public stripComments(content: string, language: SupportedLanguage): string {
    if (language === 'python') {
      return content
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*$/, ''))
        .join('\n');
    }
    return content
      .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\r\n]/g, ' '))
      .replace(/\/\/.*$/gm, '');
  }
}
