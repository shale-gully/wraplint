import { DEFAULT_OPTIONS, DEFAULT_RULES, Finding, LintOptions, Rule } from './rules';

export interface LintResult {
  filename: string;
  findings: Finding[];
}

export class Linter {
  private readonly options: LintOptions;
  private readonly rules: Rule[];

  constructor(options: Partial<LintOptions> = {}, rules: Rule[] = DEFAULT_RULES) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.rules = rules;
  }

  lintText(filename: string, text: string): LintResult {
    const lines = splitLines(text);
    const findings: Finding[] = [];

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      for (const rule of this.rules) {
        findings.push(...rule.check(line, lineNumber, this.options));
      }
    });

    findings.sort((a, b) => a.line - b.line || a.column - b.column);
    return { filename, findings };
  }
}

export function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  // a trailing newline produces one extra empty entry; drop it so the last
  // real line keeps its own number instead of being followed by a phantom one
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export { DEFAULT_OPTIONS, DEFAULT_RULES } from './rules';
export type { Finding, LintOptions, Rule, Severity } from './rules';
