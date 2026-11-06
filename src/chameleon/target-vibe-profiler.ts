import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ErrorHandlingIdiom,
  IndentStyle,
  ModuleSystem,
  NamingStyle,
  QuoteStyle,
  SupportedLanguage,
  TargetVibeProfile,
} from '../types/domain.js';

export interface ProfileTargetInput {
  workspacePath?: string;
  sampleCode?: string;
  explicitLanguage?: SupportedLanguage;
}

export class TargetVibeProfiler {
  public profileTargetVibe(input: ProfileTargetInput): TargetVibeProfile {
    const detectedFrom: string[] = [];
    let targetLanguage: SupportedLanguage = input.explicitLanguage ?? 'typescript';
    let moduleSystem: ModuleSystem = 'esm';
    let combinedSample = input.sampleCode ?? '';

    if (input.workspacePath && fs.existsSync(input.workspacePath)) {
      const wsRoot = path.resolve(input.workspacePath);
      const pkgJsonPath = path.join(wsRoot, 'package.json');
      const tsconfigPath = path.join(wsRoot, 'tsconfig.json');
      const pyprojectPath = path.join(wsRoot, 'pyproject.toml');
      const reqTxtPath = path.join(wsRoot, 'requirements.txt');
      const cargoPath = path.join(wsRoot, 'Cargo.toml');
      const goModPath = path.join(wsRoot, 'go.mod');

      if (fs.existsSync(tsconfigPath)) {
        targetLanguage = 'typescript';
        detectedFrom.push('tsconfig.json');
      }
      if (fs.existsSync(pkgJsonPath)) {
        detectedFrom.push('package.json');
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as { type?: string };
          moduleSystem = pkg.type === 'commonjs' ? 'commonjs' : 'esm';
        } catch {
          moduleSystem = 'esm';
        }
        if (!fs.existsSync(tsconfigPath) && !input.explicitLanguage) {
          targetLanguage = 'javascript';
        }
      } else if (fs.existsSync(pyprojectPath) || fs.existsSync(reqTxtPath)) {
        targetLanguage = 'python';
        moduleSystem = 'python-module';
        detectedFrom.push(fs.existsSync(pyprojectPath) ? 'pyproject.toml' : 'requirements.txt');
      } else if (fs.existsSync(cargoPath)) {
        targetLanguage = 'rust';
        moduleSystem = 'cargo-mod';
        detectedFrom.push('Cargo.toml');
      } else if (fs.existsSync(goModPath)) {
        targetLanguage = 'go';
        moduleSystem = 'go-package';
        detectedFrom.push('go.mod');
      }

      const sampledFiles = this.collectSampleSourceFiles(wsRoot, 5);
      for (const sf of sampledFiles) {
        detectedFrom.push(path.relative(wsRoot, sf).replace(/\\/g, '/'));
        combinedSample += '\n' + fs.readFileSync(sf, 'utf8');
      }
    } else if (combinedSample.trim().length > 0 && !input.explicitLanguage) {
      targetLanguage = this.inferLanguageFromCode(combinedSample);
      detectedFrom.push('inline-sample');
    }

    if (targetLanguage === 'python') {
      moduleSystem = 'python-module';
    } else if (targetLanguage === 'rust') {
      moduleSystem = 'cargo-mod';
    } else if (targetLanguage === 'go') {
      moduleSystem = 'go-package';
    } else if (combinedSample.includes('module.exports') || combinedSample.includes('require(')) {
      moduleSystem = 'commonjs';
    }

    const indentStyle = this.detectIndentStyle(combinedSample, targetLanguage);
    const quoteStyle = this.detectQuoteStyle(combinedSample, targetLanguage);
    const semicolons = this.detectSemicolons(combinedSample, targetLanguage);
    const namingStyle = this.detectNamingStyle(combinedSample, targetLanguage);
    const errorHandlingIdiom = this.detectErrorHandlingIdiom(combinedSample, targetLanguage);

    if (detectedFrom.length === 0) {
      detectedFrom.push('default-heuristic');
    }

    return {
      targetLanguage,
      moduleSystem,
      namingStyle,
      indentStyle,
      quoteStyle,
      semicolons,
      errorHandlingIdiom,
      detectedFrom,
    };
  }

  private inferLanguageFromCode(code: string): SupportedLanguage {
    if (/^\s*def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/m.test(code)) return 'python';
    if (/^\s*(?:pub\s+)?fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/m.test(code)) return 'rust';
    if (/^\s*func\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/m.test(code) || /^\s*package\s+\w+/m.test(code)) {
      return 'go';
    }
    if (/\binterface\s+[A-Z]|:\s*(?:string|number|boolean|Record<|Promise<)/.test(code)) {
      return 'typescript';
    }
    return 'javascript';
  }

  private detectIndentStyle(code: string, lang: SupportedLanguage): IndentStyle {
    if (lang === 'go') return 'tabs';
    const lines = code.split(/\r?\n/);
    let tabCount = 0;
    let twoSpaceCount = 0;
    let fourSpaceCount = 0;

    for (const line of lines) {
      if (line.startsWith('\t')) {
        tabCount++;
      } else if (/^ {4}[^ ]/.test(line)) {
        fourSpaceCount++;
      } else if (/^ {2}[^ ]/.test(line)) {
        twoSpaceCount++;
      }
    }

    if (tabCount > twoSpaceCount && tabCount > fourSpaceCount) return 'tabs';
    if (fourSpaceCount > twoSpaceCount) return '4-spaces';
    if (twoSpaceCount > 0) return '2-spaces';
    return lang === 'python' || lang === 'rust' ? '4-spaces' : '2-spaces';
  }

  private detectQuoteStyle(code: string, lang: SupportedLanguage): QuoteStyle {
    if (lang === 'rust' || lang === 'go') return 'double';
    const singleMatches = code.match(/'[^'\r\n]*'/g)?.length ?? 0;
    const doubleMatches = code.match(/"[^"\r\n]*"/g)?.length ?? 0;
    return singleMatches >= doubleMatches ? 'single' : 'double';
  }

  private detectSemicolons(code: string, lang: SupportedLanguage): boolean {
    if (lang === 'python' || lang === 'go') return false;
    if (lang === 'rust') return true;
    const lines = code
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.endsWith('{') && !l.endsWith('}'));
    if (lines.length === 0) return true;
    const withSemi = lines.filter((l) => l.endsWith(';')).length;
    return withSemi >= lines.length * 0.4;
  }

  private detectNamingStyle(code: string, lang: SupportedLanguage): NamingStyle {
    if (lang === 'python' || lang === 'rust') return 'snake_case';
    if (lang === 'go') return 'PascalCase';

    const snakeMatches = code.match(/\b(?:function|def|fn|const|let)\s+([a-z]+_[a-z0-9_]+)\b/g)?.length ?? 0;
    const camelMatches = code.match(/\b(?:function|def|fn|const|let)\s+([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b/g)?.length ?? 0;
    if (snakeMatches > camelMatches) return 'snake_case';
    return 'camelCase';
  }

  private detectErrorHandlingIdiom(code: string, lang: SupportedLanguage): ErrorHandlingIdiom {
    if (lang === 'rust' || lang === 'go') return 'result-tuple';
    if (/Result<|ok:\s*boolean|\[error,\s*data\]/i.test(code)) return 'result-tuple';
    if (/extends\s+Error/.test(code) || /class\s+\w+Error\b/.test(code)) return 'custom-error-class';
    return 'try-catch-typed';
  }

  private collectSampleSourceFiles(rootDir: string, limit: number): string[] {
    const out: string[] = [];
    const stack: string[] = [rootDir];
    const validExts = new Set(['.ts', '.js', '.py', '.rs', '.go']);
    const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.venv']);

    while (stack.length > 0 && out.length < limit) {
      const dir = stack.pop();
      if (!dir) break;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (out.length >= limit) break;
        if (entry.isDirectory()) {
          if (!ignored.has(entry.name) && !entry.name.startsWith('.')) {
            stack.push(path.join(dir, entry.name));
          }
        } else if (entry.isFile() && validExts.has(path.extname(entry.name).toLowerCase())) {
          out.push(path.join(dir, entry.name));
        }
      }
    }
    return out;
  }
}
