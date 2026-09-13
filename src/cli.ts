#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Linter, splitLines } from './linter';
import { expandTabs, Finding } from './rules';

interface ParsedArgs {
  files: string[];
  maxLineLength: number;
  tabWidth: number;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const files: string[] = [];
  let maxLineLength = 80;
  let tabWidth = 4;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--max-line-length') {
      maxLineLength = Number(argv[++i]);
    } else if (arg === '--tab-width') {
      tabWidth = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else {
      files.push(arg);
    }
  }

  return { files, maxLineLength, tabWidth, help };
}

function printUsage(): void {
  console.log(`wraplint - a linter for text that is meant to be read wrapped

Usage:
  wraplint [--max-line-length N] [--tab-width N] <file...>

Options:
  --max-line-length N   maximum visual line width (default 80)
  --tab-width N         columns a tab occupies (default 4)
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

function main(): void {
  const { files, maxLineLength, tabWidth, help } = parseArgs(process.argv.slice(2));

  if (help || files.length === 0) {
    printUsage();
    process.exitCode = files.length === 0 && !help ? 1 : 0;
    return;
  }

  const linter = new Linter({ maxLineLength, tabWidth });
  let errorCount = 0;
  let warningCount = 0;

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (err) {
      console.error(`wraplint: cannot read ${file}: ${(err as NodeJS.ErrnoException).message}`);
      process.exitCode = 2;
      continue;
    }

    const result = linter.lintText(file, text);
    if (result.findings.length === 0) continue;

    const lines = splitLines(text);
    const gutterWidth = String(lines.length).length;

    for (const finding of result.findings) {
      console.log(formatFinding(file, lines, finding, tabWidth, gutterWidth));
      if (finding.severity === 'error') errorCount++;
      else warningCount++;
    }
  }

  const total = errorCount + warningCount;
  if (total > 0) {
    console.log(
      `${total} problem${total === 1 ? '' : 's'} (${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'})`,
    );
    if (errorCount > 0) process.exitCode = 1;
  }
}

main();
