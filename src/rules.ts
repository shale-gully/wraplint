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

type Range = readonly [number, number];

// Code points that occupy no cell of their own: combining marks, variation
// selectors, and zero-width joiners/spaces. Not exhaustive, but covers what
// turns up in ordinary prose.
const ZERO_WIDTH: Range[] = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x064b, 0x065f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f],
  [0x2060, 0x2064],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0xe0100, 0xe01ef],
];

// East Asian wide and fullwidth blocks, plus emoji, which terminals draw two
// cells across.
const WIDE: Range[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
];

function inRanges(cp: number, ranges: Range[]): boolean {
  for (const [lo, hi] of ranges) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** Printed width of a single non-tab character: 0, 1 or 2 columns. */
export function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x300) return 1;
  if (inRanges(cp, ZERO_WIDTH)) return 0;
  if (inRanges(cp, WIDE)) return 2;
  return 1;
}

/**
 * Walks a line once and records, for every character, the 1-based visual
 * column it starts at and how many columns it covers, plus the total visual
 * width of the line. Tabs and wide characters don't print one column per
 * character, so every column-aware rule and the CLI's caret rendering go
 * through this.
 */
function expandColumns(
  line: string,
  tabWidth: number,
): { columns: number[]; widths: number[]; width: number } {
  const columns: number[] = [];
  const widths: number[] = [];
  let col = 1;
  for (const ch of line) {
    const w = ch === '\t' ? tabWidth - ((col - 1) % tabWidth) : charWidth(ch);
    columns.push(col);
    widths.push(w);
    col += w;
  }
  return { columns, widths, width: col - 1 };
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
      col += charWidth(ch);
    }
  }
  return out;
}

function findOverflowColumn(line: string, maxLength: number, tabWidth: number): number {
  const { columns, widths } = expandColumns(line, tabWidth);
  for (let i = 0; i < columns.length; i++) {
    // a wide character that starts inside the limit but ends past it is
    // the one that actually overflows
    if (widths[i] > 0 && columns[i] + widths[i] - 1 > maxLength) return columns[i];
  }
  // unreachable when the caller has checked the width, but point at the
  // boundary rather than returning nonsense if it is called without that
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
