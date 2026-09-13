export type Severity = 'error' | 'warning';

export interface Finding {
  ruleId: string;
  severity: Severity;
  line: number;
  column: number;
  /** how many printed columns the caret underline should span */
  length: number;
  message: string;
}

export interface LintOptions {
  maxLineLength: number;
  tabWidth: number;
}

export const DEFAULT_OPTIONS: LintOptions = {
  maxLineLength: 80,
  tabWidth: 4,
};

export interface Rule {
  id: string;
  check(line: string, lineNumber: number, options: LintOptions): Finding[];
}

/**
 * Walks a line once and records, for every character, the 1-based visual
 * column it starts at, plus the total visual width of the line. Tabs are
 * the only characters whose printed width depends on where they land, so
 * every column-aware rule and the CLI's caret rendering go through this.
 */
function expandColumns(line: string, tabWidth: number): { columns: number[]; width: number } {
  const columns: number[] = [];
  let col = 1;
  for (const ch of line) {
    columns.push(col);
    if (ch === '\t') {
      col += tabWidth - ((col - 1) % tabWidth);
    } else {
      col += 1;
    }
  }
  return { columns, width: col - 1 };
}

export function visualWidth(line: string, tabWidth: number): number {
  return expandColumns(line, tabWidth).width;
}

export function visualColumnOf(line: string, charIndex: number, tabWidth: number): number {
  const { columns, width } = expandColumns(line, tabWidth);
  return charIndex < columns.length ? columns[charIndex] : width + 1;
}

/** Replaces each tab with the spaces needed to reach the next tab stop, so a
 * printed line lines up with the columns reported for it. */
export function expandTabs(line: string, tabWidth: number): string {
  let out = '';
  let col = 0;
  for (const ch of line) {
    if (ch === '\t') {
      const spaces = tabWidth - (col % tabWidth);
      out += ' '.repeat(spaces);
      col += spaces;
    } else {
      out += ch;
      col += 1;
    }
  }
  return out;
}

function findOverflowColumn(line: string, maxLength: number, tabWidth: number): number {
  const { columns } = expandColumns(line, tabWidth);
  for (const c of columns) {
    if (c > maxLength) return c;
  }
  // the line's width only exceeds the limit because a tab near the edge
  // expanded past it; the boundary itself is the most useful column to point at
  return maxLength + 1;
}

const maxLineLength: Rule = {
  id: 'max-line-length',
  check(line, lineNumber, options) {
    const width = visualWidth(line, options.tabWidth);
    if (width <= options.maxLineLength) return [];
    const column = findOverflowColumn(line, options.maxLineLength, options.tabWidth);
    const overage = width - options.maxLineLength;
    return [
      {
        ruleId: this.id,
        severity: 'error',
        line: lineNumber,
        column,
        length: Math.max(1, width - (column - 1)),
        message: `line is ${width} columns wide, ${overage} over the ${options.maxLineLength}-column limit`,
      },
    ];
  },
};

const trailingWhitespace: Rule = {
  id: 'trailing-whitespace',
  check(line, lineNumber, options) {
    const match = /[ \t]+$/.exec(line);
    if (!match) return [];
    const column = visualColumnOf(line, match.index, options.tabWidth);
    const count = match[0].length;
    return [
      {
        ruleId: this.id,
        severity: 'warning',
        line: lineNumber,
        column,
        length: Math.max(1, count),
        message: `line has ${count} trailing whitespace character${count === 1 ? '' : 's'}; invisible, but it still counts toward the line's wrap width`,
      },
    ];
  },
};

const mixedIndentation: Rule = {
  id: 'mixed-indentation',
  check(line, lineNumber, options) {
    const match = /^[ \t]+/.exec(line);
    if (!match) return [];
    const indent = match[0];
    if (!indent.includes(' ') || !indent.includes('\t')) return [];
    const width = visualWidth(indent, options.tabWidth);
    return [
      {
        ruleId: this.id,
        severity: 'warning',
        line: lineNumber,
        column: 1,
        length: Math.max(1, width),
        message: `indentation mixes tabs and spaces; a tab here counts as ${options.tabWidth} column(s), but editors and terminals disagree on tab width, so the wrap point of this line can shift`,
      },
    ];
  },
};

export const DEFAULT_RULES: Rule[] = [maxLineLength, trailingWhitespace, mixedIndentation];
