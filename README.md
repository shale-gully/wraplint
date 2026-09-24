# wraplint

A linter for text that is meant to be read wrapped: prose in READMEs, commit
messages, comments, changelogs, plain-text docs. It does not reflow anything.
It reads a file and tells you, with an exact line and column, where the
wrapping is going to go wrong for someone else's editor or terminal.

## The problem

Text that looks fine in the editor you wrote it in can wrap badly somewhere
else, for reasons that are individually small and collectively common:

- A line is long enough that it wraps in an 80-column terminal but not in
  your 120-column editor, so you never see the wrap it causes for others.
- Trailing whitespace at the end of a line is invisible but still counts
  toward the line's width, so two lines that look identical can wrap
  differently once one of them picks up a trailing space from a paste.
- A line indented with a tab followed by spaces (or the reverse) has no
  fixed width at all — it is 2 columns wide in an editor set to a tab width
  of 2, and 8 columns wide in one set to 8. The point where the rest of the
  line wraps moves with it.

None of these are syntax errors, so nothing else catches them. wraplint
checks for them specifically and reports exactly where they are.

## Usage

Build once:

```
npm run build
```

Then run it against one or more files:

```
node dist/cli.js example.txt
```

Given an `example.txt` containing:

```
This paragraph is short and reads fine; nothing here should get flagged.
wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap.
Trailing spaces follow this sentence.   
	  This line mixes a tab with spaces in its indentation.
```

(line 4 starts with a real tab character followed by two spaces)

wraplint prints:

```
example.txt:2:81: error [max-line-length] line is 90 columns wide, 10 over the 80-column limit

2 | wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap wrap.
  |                                                                                ^^^^^^^^^^

example.txt:3:38: warning [trailing-whitespace] line has 3 trailing whitespace characters; invisible, but it still counts toward the line's wrap width

3 | Trailing spaces follow this sentence.   
  |                                      ^^^

example.txt:4:1: warning [mixed-indentation] indentation mixes tabs and spaces; a tab here counts as 4 column(s), but editors and terminals disagree on tab width, so the wrap point of this line can shift

4 |       This line mixes a tab with spaces in its indentation.
  | ^^^^^^

3 problems (1 error, 2 warnings)
```

Every finding is printed with the source line reproduced underneath it (tabs
expanded, so the columns actually line up) and a caret underline pointing at
the exact span that's wrong, not just the line it's on.

The exit code is 1 if any finding is an error, 0 otherwise, so it's usable as
a CI check.

## Options

```
wraplint [--max-line-length N] [--tab-width N] [--format text|json] <file...>

--max-line-length N   maximum visual line width (default 80)
--tab-width N         columns a tab occupies for width calculations (default 4)
--format text|json    output format (default text)
```

### JSON output

`--format json` prints one JSON object to stdout instead of the human-readable
report, for feeding into other tools:

```
node dist/cli.js --format json example.txt
```

```json
{
  "files": [
    {
      "filename": "example.txt",
      "error": null,
      "findings": [
        {
          "ruleId": "max-line-length",
          "severity": "error",
          "line": 2,
          "column": 81,
          "length": 10,
          "message": "line is 90 columns wide, 10 over the 80-column limit"
        }
      ]
    }
  ],
  "errorCount": 1,
  "warningCount": 2
}
```

A file wraplint couldn't read gets an entry with `error` set to the message
and an empty `findings` array, instead of aborting the whole run. The exit
code is still 1 if any finding is an error and 2 if any file couldn't be
read, same as text mode.

## Rules

| id                  | severity | checks |
|---------------------|----------|--------|
| `max-line-length`    | error    | line's visual width exceeds the configured limit |
| `trailing-whitespace` | warning | line ends in spaces or tabs that don't affect its appearance but do affect its width |
| `mixed-indentation`  | warning  | a line's leading whitespace mixes tabs and spaces |

Column numbers everywhere are visual columns, not character offsets: a tab
counts for however many columns `--tab-width` says it should, so the numbers
match what you'd count in a terminal, not what you'd count with `line[i]`.

## Status

Early. The rule set above is what exists today; there's no config file yet,
and Unicode combining characters and wide (e.g. CJK) characters are counted
as one column each, which is wrong for wide characters specifically.
Machine-readable output is covered by `--format json` above.

## Library use

The linter is also usable as a library, without the CLI:

```ts
import { Linter } from './dist/linter';

const linter = new Linter({ maxLineLength: 100 });
const result = linter.lintText('notes.txt', someText);
for (const finding of result.findings) {
  console.log(finding.line, finding.column, finding.message);
}
```

## License

MIT, see [LICENSE](LICENSE).
