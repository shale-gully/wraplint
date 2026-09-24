#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Linter, splitLines } from './linter';
import { expandTabs, Finding } from './rules';

type OutputFormat = 'text' | 'json';

interface ParsedArgs {
  files: string[];
  maxLineLength: number;
  tabWidth: number;
  format: OutputFormat;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const files: string[] = [];
  let maxLineLength = 80;
  let tabWidth = 4;
  let format: OutputFormat = 'text';
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--max-line-length') {
      maxLineLength = Number(argv[++i]);
    } else if (arg === '--tab-width') {
      tabWidth = Number(argv[++i]);
    } else if (arg === '--format') {
      const value = argv[++i];
      if (value !== 'text' && value !== 'json') {
        throw new Error(`--format must be "text" or "json", got ${JSON.stringify(value)}`);
      }
      format = value;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else {
      files.push(arg);
    }
  }

  return { files, maxLineLength, tabWidth, format, help };
}

function printUsage(): void {
  console.log(`wraplint - a linter for text that is meant to be read wrapped

Usage:
  wraplint [--max-line-length N] [--tab-width N] [--format text|json] <file...>

Options:
  --max-line-length N   maximum visual line width (default 80)
  --tab-width N         columns a tab occupies (default 4)
  --format text|json    output format (default text)
  -h, --help            show this message`);
}

function formatFinding(filename: string, lines: string[], finding: Finding, tabWidth: number, gutterWidth: number): string {
  const raw = lines[finding.line - 1] ?? '';
  const printed = expandTabs(raw, tabWidth);
  const gutter = String(finding.line).padStart(gutterWidth);
  const blankGutter = ' '.repeat(gutterWidth);

  const header = `${filename}:${finding.line}:${finding.column}: ${finding.severity} [${finding.ruleId}] ${finding.message}`;
  const codeLine = `${gutter} | ${printed}`;
  const caretLine = `${blankGutter} | ${' '.repeat(finding.column - 1)}${'^'.repeat(finding.length)}`;

  return `${header}\n\n${codeLine}\n${caretLine}\n`;
}

interface FileReport {
  filename: string;
  error: string | null;
  findings: Finding[];
}

function main(): void {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`wraplint: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }
  const { files, maxLineLength, tabWidth, format, help } = args;

  if (help || files.length === 0) {
    printUsage();
    process.exitCode = files.length === 0 && !help ? 1 : 0;
    return;
  }

  const linter = new Linter({ maxLineLength, tabWidth });
  const reports: FileReport[] = [];
  let errorCount = 0;
  let warningCount = 0;
  let readErrors = false;

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (err) {
      readErrors = true;
      reports.push({ filename: file, error: (err as NodeJS.ErrnoException).message, findings: [] });
      if (format === 'text') {
        console.error(`wraplint: cannot read ${file}: ${(err as NodeJS.ErrnoException).message}`);
      }
      continue;
    }

    const result = linter.lintText(file, text);
    reports.push({ filename: file, error: null, findings: result.findings });

    if (format === 'text' && result.findings.length > 0) {
      const lines = splitLines(text);
      const gutterWidth = String(lines.length).length;
      for (const finding of result.findings) {
        console.log(formatFinding(file, lines, finding, tabWidth, gutterWidth));
      }
    }

    for (const finding of result.findings) {
      if (finding.severity === 'error') errorCount++;
      else warningCount++;
    }
  }

  if (format === 'json') {
    console.log(JSON.stringify({ files: reports, errorCount, warningCount }, null, 2));
  } else {
    const total = errorCount + warningCount;
    if (total > 0) {
      console.log(
        `${total} problem${total === 1 ? '' : 's'} (${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'})`,
      );
    }
  }

  if (errorCount > 0) process.exitCode = 1;
  if (readErrors) process.exitCode = 2;
}

main();
