# Auto-Detect JetBrains Keymaps Directory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `-o` is omitted, auto-detect installed JetBrains IDEs, prompt the user to pick one, and write the converted keymap directly into that IDE's keymaps directory.

**Architecture:** New `src/detect-keymaps-dir.ts` module scans `~/.config/JetBrains/` for `<Product><Version>/keymaps/` directories. The CLI uses Node's built-in `readline` to prompt the user interactively — single match gets a Y/n confirmation, multiple matches get a numbered list. If no match or user declines, they can type a path manually. The existing `-o` flag still works as a direct override that skips detection entirely.

**Tech Stack:** Node.js `fs`, `path`, `os`, `readline/promises` (all stdlib — no new dependencies).

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/detect-keymaps-dir.ts` | Scan filesystem for JetBrains keymaps dirs, return list of matches |
| `src/prompt.ts` | Interactive prompts: confirm single dir, pick from list, manual input |
| `src/cli.ts` | Wire detection + prompt into the existing CLI flow |
| `tests/detect-keymaps-dir.test.ts` | Unit tests for directory detection |
| `tests/prompt.test.ts` | Unit tests for prompt logic (non-interactive, testable) |

---

### Task 1: TDD — Detect JetBrains Keymaps Directories

**Files:**
- Create: `src/detect-keymaps-dir.ts`
- Create: `tests/detect-keymaps-dir.test.ts`

- [ ] **Step 1: Write failing tests for detectKeymapsDirs**

Write `tests/detect-keymaps-dir.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { detectKeymapsDirs } from "../src/detect-keymaps-dir.js";

function createFakeJetBrainsHome(...products: string[]): string {
  const base = mkdtempSync(join(tmpdir(), "jb-"));
  for (const product of products) {
    mkdirSync(join(base, product, "keymaps"), { recursive: true });
  }
  return base;
}

describe("detectKeymapsDirs", () => {
  it("finds a single IDE keymaps directory", () => {
    const base = createFakeJetBrainsHome("RubyMine2025.3");
    const dirs = detectKeymapsDirs(base);
    expect(dirs).toEqual([
      {
        product: "RubyMine2025.3",
        keymapsPath: join(base, "RubyMine2025.3", "keymaps"),
      },
    ]);
  });

  it("finds multiple IDE keymaps directories", () => {
    const base = createFakeJetBrainsHome(
      "RubyMine2025.3",
      "WebStorm2025.3",
      "IntelliJIdea2025.1"
    );
    const dirs = detectKeymapsDirs(base);
    expect(dirs).toHaveLength(3);
    expect(dirs.map((d) => d.product).sort()).toEqual([
      "IntelliJIdea2025.1",
      "RubyMine2025.3",
      "WebStorm2025.3",
    ]);
  });

  it("returns empty array when no JetBrains directory exists", () => {
    const base = mkdtempSync(join(tmpdir(), "empty-"));
    const dirs = detectKeymapsDirs(base);
    expect(dirs).toEqual([]);
  });

  it("ignores directories without a keymaps subdirectory", () => {
    const base = mkdtempSync(join(tmpdir(), "jb-"));
    mkdirSync(join(base, "RubyMine2025.3", "options"), { recursive: true });
    mkdirSync(join(base, "WebStorm2025.3", "keymaps"), { recursive: true });
    const dirs = detectKeymapsDirs(base);
    expect(dirs).toHaveLength(1);
    expect(dirs[0].product).toBe("WebStorm2025.3");
  });

  it("uses ~/.config/JetBrains as default base path", () => {
    const dirs = detectKeymapsDirs();
    // Just verify it returns an array (may be empty on CI)
    expect(Array.isArray(dirs)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/detect-keymaps-dir.test.ts
```

Expected: Fails — `detectKeymapsDirs` does not exist.

- [ ] **Step 3: Implement detectKeymapsDirs**

Write `src/detect-keymaps-dir.ts`:

```typescript
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface DetectedIDE {
  product: string;
  keymapsPath: string;
}

export function detectKeymapsDirs(
  basePath?: string
): DetectedIDE[] {
  const base = basePath ?? join(homedir(), ".config", "JetBrains");

  if (!existsSync(base) || !statSync(base).isDirectory()) {
    return [];
  }

  const results: DetectedIDE[] = [];

  for (const entry of readdirSync(base)) {
    const keymapsPath = join(base, entry, "keymaps");
    if (existsSync(keymapsPath) && statSync(keymapsPath).isDirectory()) {
      results.push({ product: entry, keymapsPath });
    }
  }

  return results.sort((a, b) => a.product.localeCompare(b.product));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/detect-keymaps-dir.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detect-keymaps-dir.ts tests/detect-keymaps-dir.test.ts
git commit -m "feat: add JetBrains keymaps directory detection"
```

---

### Task 2: TDD — Interactive Prompt Logic

**Files:**
- Create: `src/prompt.ts`
- Create: `tests/prompt.test.ts`

- [ ] **Step 1: Write failing tests for prompt formatting and selection**

Write `tests/prompt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  formatSingleConfirm,
  formatMultipleChoice,
  parseSelection,
} from "../src/prompt.js";
import type { DetectedIDE } from "../src/detect-keymaps-dir.js";

const ONE_IDE: DetectedIDE[] = [
  { product: "RubyMine2025.3", keymapsPath: "/home/user/.config/JetBrains/RubyMine2025.3/keymaps" },
];

const THREE_IDES: DetectedIDE[] = [
  { product: "IntelliJIdea2025.1", keymapsPath: "/home/user/.config/JetBrains/IntelliJIdea2025.1/keymaps" },
  { product: "RubyMine2025.3", keymapsPath: "/home/user/.config/JetBrains/RubyMine2025.3/keymaps" },
  { product: "WebStorm2025.3", keymapsPath: "/home/user/.config/JetBrains/WebStorm2025.3/keymaps" },
];

describe("formatSingleConfirm", () => {
  it("formats a confirmation message with the product name and path", () => {
    const msg = formatSingleConfirm(ONE_IDE[0]);
    expect(msg).toContain("RubyMine2025.3");
    expect(msg).toContain("RubyMine2025.3/keymaps");
    expect(msg).toContain("[Y/n]");
  });
});

describe("formatMultipleChoice", () => {
  it("formats a numbered list of IDEs", () => {
    const msg = formatMultipleChoice(THREE_IDES);
    expect(msg).toContain("1)");
    expect(msg).toContain("2)");
    expect(msg).toContain("3)");
    expect(msg).toContain("IntelliJIdea2025.1");
    expect(msg).toContain("RubyMine2025.3");
    expect(msg).toContain("WebStorm2025.3");
  });
});

describe("parseSelection", () => {
  it("returns the selected IDE for a valid number", () => {
    const result = parseSelection("2", THREE_IDES);
    expect(result).toEqual(THREE_IDES[1]);
  });

  it("returns null for out-of-range number", () => {
    expect(parseSelection("0", THREE_IDES)).toBeNull();
    expect(parseSelection("4", THREE_IDES)).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseSelection("abc", THREE_IDES)).toBeNull();
    expect(parseSelection("", THREE_IDES)).toBeNull();
  });

  it("returns the IDE for a valid number as first item", () => {
    const result = parseSelection("1", THREE_IDES);
    expect(result).toEqual(THREE_IDES[0]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/prompt.test.ts
```

Expected: Fails — module not found.

- [ ] **Step 3: Implement prompt formatting functions**

Write `src/prompt.ts`:

```typescript
import type { DetectedIDE } from "./detect-keymaps-dir.js";

export function formatSingleConfirm(ide: DetectedIDE): string {
  return `\nFound ${ide.product}:\n  ${ide.keymapsPath}\n\nInstall keymap here? [Y/n] `;
}

export function formatMultipleChoice(ides: DetectedIDE[]): string {
  const lines = ["\nFound multiple JetBrains IDEs:\n"];
  for (let i = 0; i < ides.length; i++) {
    lines.push(`  ${i + 1}) ${ides[i].product} — ${ides[i].keymapsPath}`);
  }
  lines.push("\nEnter a number (or a custom path): ");
  return lines.join("\n");
}

export function parseSelection(
  input: string,
  ides: DetectedIDE[]
): DetectedIDE | null {
  const num = parseInt(input.trim(), 10);
  if (isNaN(num) || num < 1 || num > ides.length) {
    return null;
  }
  return ides[num - 1];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/prompt.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompt.ts tests/prompt.test.ts
git commit -m "feat: add interactive prompt formatting and selection"
```

---

### Task 3: Wire Detection + Prompt Into CLI

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement the interactive flow in cli.ts**

Replace `src/cli.ts` with:

```typescript
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import {
  convertKeymap,
  DEFAULT_MODIFIER_MAP,
  type ModifierMap,
} from "./convert-keymap.js";
import { detectKeymapsDirs } from "./detect-keymaps-dir.js";
import {
  formatSingleConfirm,
  formatMultipleChoice,
  parseSelection,
} from "./prompt.js";

const KNOWN_MODIFIERS = new Set(["meta", "control", "alt", "shift"]);

function parseModifierMap(mapArgs: string[]): ModifierMap {
  const result: ModifierMap = { ...DEFAULT_MODIFIER_MAP };

  for (const arg of mapArgs) {
    if (!arg.includes("=")) {
      console.error(
        `Error: invalid --map format '${arg}', expected 'source=target'`
      );
      process.exit(1);
    }
    const [source, target] = arg.split("=", 2);
    const src = source.trim().toLowerCase();
    const tgt = target.trim().toLowerCase();
    if (!KNOWN_MODIFIERS.has(src)) {
      console.error(
        `Error: unknown modifier '${src}'. Valid: ${[...KNOWN_MODIFIERS].sort().join(", ")}`
      );
      process.exit(1);
    }
    result[src] = tgt;
  }

  return result;
}

async function resolveOutputPath(
  explicitOutput: string | undefined
): Promise<string | null> {
  // If -o was provided, use it directly
  if (explicitOutput) {
    return explicitOutput;
  }

  // If stdout is not a TTY (piped), write to stdout
  if (!process.stdout.isTTY) {
    return null; // null means stdout
  }

  // Interactive: detect JetBrains directories
  const ides = detectKeymapsDirs();

  if (ides.length === 0) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(
      "\nNo JetBrains IDE found. Enter the keymaps directory path: "
    );
    rl.close();
    const trimmed = answer.trim();
    if (!trimmed) {
      console.error("Error: no output path provided");
      process.exit(1);
    }
    return trimmed;
  }

  const rl = createInterface({ input: stdin, output: stdout });

  if (ides.length === 1) {
    const answer = await rl.question(formatSingleConfirm(ides[0]));
    rl.close();
    const lower = answer.trim().toLowerCase();
    if (lower === "" || lower === "y" || lower === "yes") {
      return ides[0].keymapsPath;
    }
    // User said no — ask for manual path
    const rl2 = createInterface({ input: stdin, output: stdout });
    const manual = await rl2.question("Enter the keymaps directory path: ");
    rl2.close();
    return manual.trim();
  }

  // Multiple IDEs found
  const answer = await rl.question(formatMultipleChoice(ides));
  rl.close();

  const selected = parseSelection(answer, ides);
  if (selected) {
    return selected.keymapsPath;
  }

  // Treat input as a custom path
  const trimmed = answer.trim();
  if (!trimmed) {
    console.error("Error: no output path provided");
    process.exit(1);
  }
  return trimmed;
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: "string", short: "o" },
    name: { type: "string" },
    parent: { type: "string" },
    "no-parent": { type: "boolean" },
    map: { type: "string", multiple: true },
  },
  allowPositionals: true,
});

const inputPath = positionals[0];
if (!inputPath) {
  console.error("Error: input file path is required");
  process.exit(1);
}

let xmlInput: string;
try {
  xmlInput = readFileSync(inputPath, "utf-8");
} catch {
  console.error(`Error: cannot read file '${inputPath}'`);
  process.exit(1);
}

const modifierMap = parseModifierMap(values.map ?? []);

const output = convertKeymap(xmlInput, modifierMap, {
  name: values.name,
  parent: values.parent,
  removeParent: values["no-parent"],
});

const outputPath = await resolveOutputPath(values.output);

if (outputPath === null) {
  // Write to stdout
  process.stdout.write(output);
} else if (
  existsSync(outputPath) &&
  statSync(outputPath).isDirectory()
) {
  // outputPath is a directory — write file inside it
  const fileName = values.name
    ? `${values.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.xml`
    : "converted-keymap.xml";
  const fullPath = join(outputPath, fileName);
  writeFileSync(fullPath, output, "utf-8");
  console.log(`\n✅ Saved to ${fullPath}`);
} else {
  // outputPath is a file path
  writeFileSync(outputPath, output, "utf-8");
  console.log(`\n✅ Saved to ${outputPath}`);
}
```

- [ ] **Step 2: Run all tests to verify nothing is broken**

```bash
npx vitest run
```

Expected: All tests PASS (existing CLI tests use `-o` flag so they skip the interactive flow).

- [ ] **Step 3: Manual smoke test**

```bash
# Should detect your JetBrains IDEs and prompt
echo "n" | npx tsx src/cli.ts tests/fixtures/macos-sample.xml --name "Test Keymap"
```

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: auto-detect JetBrains keymaps dir with interactive prompt"
```

---

### Task 4: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add auto-detect section to README**

Add this section after the "Convert your keymap" section, replacing it:

```markdown
### Convert your keymap

```bash
npx tsx src/cli.ts ~/path/to/MacKeymap.xml --name "My Keymap"
```

The tool will automatically find your JetBrains IDE and ask where to install:

```
Found RubyMine2025.3:
  /home/you/.config/JetBrains/RubyMine2025.3/keymaps

Install keymap here? [Y/n]
```

If you have multiple IDEs installed, you'll get a numbered list:

```
Found multiple JetBrains IDEs:

  1) IntelliJIdea2025.1 — /home/you/.config/JetBrains/IntelliJIdea2025.1/keymaps
  2) RubyMine2025.3 — /home/you/.config/JetBrains/RubyMine2025.3/keymaps
  3) WebStorm2025.3 — /home/you/.config/JetBrains/WebStorm2025.3/keymaps

Enter a number (or a custom path):
```

You can also skip auto-detection and specify the output directly:

```bash
npx tsx src/cli.ts input.xml -o ~/path/to/output.xml
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add auto-detect keymaps directory to README"
```
