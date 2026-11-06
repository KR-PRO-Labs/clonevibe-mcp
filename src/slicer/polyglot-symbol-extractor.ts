import type {
  ReferenceFile,
  ReferenceSnapshot,
  SupportedLanguage,
  SymbolKind,
  SymbolNode,
} from '../types/domain.js';

const PYTHON_STDLIB = new Set([
  'abc', 'asyncio', 'collections', 'contextlib', 'copy', 'csv', 'ctypes',
  'dataclasses', 'datetime', 'decimal', 'enum', 'functools', 'glob', ' gzip',
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

    for (const node of rawNodes) {
      const calls = new Set<string>();
      for (const candidateName of allSymbolNames) {
        if (candidateName === node.name) {
          continue;
        }
        const escaped = candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`);
        if (re.test(node.sourceCode)) {
          calls.add(candidateName);
        }
      }
      node.calls = Array.from(calls).sort();
    }

    return rawNodes;
  }

  public extractFromFile(file: ReferenceFile): SymbolNode[] {
    const lines = file.content.split(/\r?\n/);
    const externalImports = this.extractExternalImports(file.content, file.language);
    const declarations = this.findTopLevelDeclarations(lines, file.language);
    const nodes: SymbolNode[] = [];

    for (let i = 0; i < declarations.length; i++) {
      const decl = declarations[i];
      if (!decl) continue;
      const nextDeclStart = declarations[i + 1]?.startLine ?? lines.length + 1;
      const endLine = this.computeDeclarationEndLine(
        lines,
        decl.startLine,
        nextDeclStart - 1,
        file.language,
      );
      const sliceLines = lines.slice(decl.startLine - 1, endLine);
      const sourceCode = sliceLines.join('\n').trimEnd();

      const usedImports = externalImports.filter((pkg) => {
        const shortName = pkg.split('/').pop()?.replace(/^@/, '').replace(/-/g, '') ?? pkg;
        return sourceCode.length > 0 && (file.content.includes(pkg) || sourceCode.includes(shortName));
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
    const lines = content.split(/\r?\n/);

    if (language === 'typescript' || language === 'javascript') {
      const importFromRe = /\bfrom\s+['"]([^'"]+)['"]/g;
      const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = importFromRe.exec(content)) !== null) {
        const spec = match[1];
        if (spec && !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:')) {
          imports.add(this.normalizeNpmPackageName(spec));
        }
      }
      while ((match = requireRe.exec(content)) !== null) {
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
      while ((match = goImpRe.exec(content)) !== null) {
        const spec = match[1];
        if (spec && spec.includes('.') && !spec.includes(' ')) {
          imports.add(spec);
        }
      }
    }

    return Array.from(imports).sort();
  }

  private normalizeNpmPackageName(specifier: string): string {
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/');
      return parts.slice(0, 2).join('/');
    }
    return specifier.split('/')[0] ?? specifier;
  }

  private findTopLevelDeclarations(lines: string[], language: SupportedLanguage): RawDeclarationMatch[] {
    const results: RawDeclarationMatch[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx] ?? '';
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
      const raw = lines[lineNum - 1] ?? '';
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
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
      if (!sawOpenBrace && raw.trimEnd().endsWith(';')) {
        return lineNum;
      }
    }
    return maxEndLine;
  }
}
