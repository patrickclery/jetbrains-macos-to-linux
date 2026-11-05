# JetBrains macOS-to-Linux Keymap Converter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript CLI tool that converts JetBrains macOS keymap XML files to Linux by remapping modifier keys (meta/control/alt).

**Architecture:** TypeScript project using `@xmldom/xmldom` for DOM-style XML parsing, `parseArgs` from `node:util` for CLI. Modifier remapping is configurable via CLI flags with sensible defaults: `meta→control`, `control→alt`, `alt→alt`. Handles deduplication when two macOS modifiers map to the same Linux modifier.

**Tech Stack:** TypeScript, Node.js 22, `@xmldom/xmldom`, vitest for testing.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/convert-keymap.ts` | Core logic: keystroke parsing, modifier remapping, XML conversion |
| `src/cli.ts` | CLI entry point with `parseArgs` |
| `tests/convert-keymap.test.ts` | All unit and integration tests |
| `tests/fixtures/macos-sample.xml` | Sample macOS keymap for testing |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript config |
| `.gitignore` | Node ignores |
| `README.md` | Usage documentation |

---

### Task 1: Initialize Project and GitHub Repo

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md` (placeholder)

- [ ] **Step 1: Initialize git repo**

```bash
cd jetbrains-macos-to-linux
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "jetbrains-macos-to-linux",
  "version": "1.0.0",
  "description": "Convert JetBrains IDE keymaps from macOS to Linux by remapping modifier keys",
  "type": "module",
  "scripts": {
    "convert": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@xmldom/xmldom": "^0.9.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .gitignore**

```gitignore
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 5: Create placeholder README**

```markdown
# jetbrains-macos-to-linux

Convert JetBrains IDE keymaps from macOS to Linux by remapping modifier keys.
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

- [ ] **Step 7: Create GitHub repo and push initial commit**

```bash
git add .gitignore README.md package.json package-lock.json tsconfig.json
git commit -m "chore: initialize TypeScript project"
gh repo create <your-username>/jetbrains-macos-to-linux --private --source=. --push
```

---

### Task 2: Create Test Fixture

**Files:**
- Create: `tests/fixtures/macos-sample.xml`

- [ ] **Step 1: Create test directories**

```bash
mkdir -p tests/fixtures
```

- [ ] **Step 2: Create macOS sample keymap fixture**

Write `tests/fixtures/macos-sample.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<keymap version="1" name="My Mac Keymap" parent="Mac OS X 10.5+" disable-mnemonics="true">
  <action id="$Copy">
    <keyboard-shortcut first-keystroke="meta C" />
  </action>
  <action id="$Paste">
    <keyboard-shortcut first-keystroke="meta V" />
  </action>
  <action id="$Undo">
    <keyboard-shortcut first-keystroke="meta Z" />
  </action>
  <action id="FindInPath">
    <keyboard-shortcut first-keystroke="meta shift F" />
  </action>
  <action id="OptimizeImports">
    <keyboard-shortcut first-keystroke="meta alt O" />
  </action>
  <action id="EditorUp">
    <keyboard-shortcut first-keystroke="control P" />
  </action>
  <action id="GotoDeclaration">
    <keyboard-shortcut first-keystroke="meta B" />
    <mouse-shortcut keystroke="meta button1" />
  </action>
  <action id="ShowIntentionActions">
    <keyboard-shortcut first-keystroke="alt ENTER" />
  </action>
  <action id="Refactorings.QuickListPopupAction">
    <keyboard-shortcut first-keystroke="control T" />
  </action>
  <action id="ExpandLiveTemplateByTab">
    <keyboard-shortcut first-keystroke="TAB" />
  </action>
  <action id="RunToCursor">
    <keyboard-shortcut first-keystroke="meta alt F9" />
  </action>
  <action id="Vcs.Push">
    <keyboard-shortcut first-keystroke="meta shift K" />
  </action>
  <action id="MethodUp">
    <keyboard-shortcut first-keystroke="control UP" />
  </action>
  <action id="FoldRegionRecursively">
    <keyboard-shortcut first-keystroke="meta alt MULTIPLY" second-keystroke="1" />
  </action>
</keymap>
```

- [ ] **Step 3: Commit fixture**

```bash
git add tests/
git commit -m "test: add macOS keymap fixture"
```

---

### Task 3: TDD — Keystroke Parsing

**Files:**
- Create: `tests/convert-keymap.test.ts`
- Create: `src/convert-keymap.ts`

- [ ] **Step 1: Write failing tests for keystroke parsing**

Write `tests/convert-keymap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseKeystroke } from "../src/convert-keymap.js";

describe("parseKeystroke", () => {
  it("parses single modifier and key", () => {
    const [modifiers, key] = parseKeystroke("meta C");
    expect(modifiers).toEqual(["meta"]);
    expect(key).toBe("C");
  });

  it("parses multiple modifiers", () => {
    const [modifiers, key] = parseKeystroke("meta shift F");
    expect(modifiers).toEqual(["meta", "shift"]);
    expect(key).toBe("F");
  });

  it("parses three modifiers", () => {
    const [modifiers, key] = parseKeystroke("meta alt shift DOWN");
    expect(modifiers).toEqual(["meta", "alt", "shift"]);
    expect(key).toBe("DOWN");
  });

  it("parses key with no modifiers", () => {
    const [modifiers, key] = parseKeystroke("TAB");
    expect(modifiers).toEqual([]);
    expect(key).toBe("TAB");
  });

  it("handles modifier-only keystroke", () => {
    const [modifiers, key] = parseKeystroke("meta");
    expect(modifiers).toEqual(["meta"]);
    expect(key).toBeNull();
  });

  it("parses control modifier", () => {
    const [modifiers, key] = parseKeystroke("control P");
    expect(modifiers).toEqual(["control"]);
    expect(key).toBe("P");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run
```

Expected: Fails — `parseKeystroke` does not exist.

- [ ] **Step 3: Implement parseKeystroke**

Write `src/convert-keymap.ts`:

```typescript
const KNOWN_MODIFIERS = new Set(["meta", "control", "alt", "shift"]);

export function parseKeystroke(keystroke: string): [string[], string | null] {
  const parts = keystroke.split(" ");
  const modifiers: string[] = [];
  let key: string | null = null;

  for (const part of parts) {
    if (KNOWN_MODIFIERS.has(part.toLowerCase())) {
      modifiers.push(part.toLowerCase());
    } else {
      key = part;
    }
  }

  return [modifiers, key];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convert-keymap.ts tests/convert-keymap.test.ts
git commit -m "feat: add keystroke parsing with tests"
```

---

### Task 4: TDD — Modifier Remapping

**Files:**
- Modify: `tests/convert-keymap.test.ts`
- Modify: `src/convert-keymap.ts`

- [ ] **Step 1: Write failing tests for remapKeystroke**

Append to `tests/convert-keymap.test.ts`:

```typescript
import { remapKeystroke, DEFAULT_MODIFIER_MAP } from "../src/convert-keymap.js";

describe("remapKeystroke", () => {
  it("remaps meta to control", () => {
    expect(remapKeystroke("meta C", DEFAULT_MODIFIER_MAP)).toBe("control C");
  });

  it("remaps meta shift", () => {
    expect(remapKeystroke("meta shift F", DEFAULT_MODIFIER_MAP)).toBe(
      "control shift F"
    );
  });

  it("remaps control to alt", () => {
    expect(remapKeystroke("control P", DEFAULT_MODIFIER_MAP)).toBe("alt P");
  });

  it("remaps meta alt", () => {
    expect(remapKeystroke("meta alt O", DEFAULT_MODIFIER_MAP)).toBe(
      "control alt O"
    );
  });

  it("leaves key-only shortcuts unchanged", () => {
    expect(remapKeystroke("TAB", DEFAULT_MODIFIER_MAP)).toBe("TAB");
  });

  it("leaves alt ENTER unchanged", () => {
    expect(remapKeystroke("alt ENTER", DEFAULT_MODIFIER_MAP)).toBe(
      "alt ENTER"
    );
  });

  it("deduplicates modifiers when two map to same target", () => {
    const customMap = {
      meta: "control",
      control: "control",
      alt: "alt",
      shift: "shift",
    };
    expect(remapKeystroke("meta control A", customMap)).toBe("control A");
  });

  it("supports custom mapping", () => {
    const customMap = {
      meta: "alt",
      control: "control",
      alt: "meta",
      shift: "shift",
    };
    expect(remapKeystroke("meta shift B", customMap)).toBe("alt shift B");
  });

  it("remaps mouse shortcut modifiers", () => {
    expect(remapKeystroke("meta button1", DEFAULT_MODIFIER_MAP)).toBe(
      "control button1"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npx vitest run
```

Expected: Fails — `remapKeystroke` and `DEFAULT_MODIFIER_MAP` not found.

- [ ] **Step 3: Implement remapKeystroke and DEFAULT_MODIFIER_MAP**

Append to `src/convert-keymap.ts`:

```typescript
export type ModifierMap = Record<string, string>;

export const DEFAULT_MODIFIER_MAP: ModifierMap = {
  meta: "control",
  control: "alt",
  alt: "alt",
  shift: "shift",
};

export function remapKeystroke(
  keystroke: string,
  modifierMap: ModifierMap
): string {
  const [modifiers, key] = parseKeystroke(keystroke);
  const seen = new Set<string>();
  const newModifiers: string[] = [];

  for (const mod of modifiers) {
    const mapped = modifierMap[mod] ?? mod;
    if (!seen.has(mapped)) {
      seen.add(mapped);
      newModifiers.push(mapped);
    }
  }

  const parts = key ? [...newModifiers, key] : newModifiers;
  return parts.join(" ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convert-keymap.ts tests/convert-keymap.test.ts
git commit -m "feat: add modifier remapping with deduplication"
```

---

### Task 5: TDD — Full XML Keymap Conversion

**Files:**
- Modify: `tests/convert-keymap.test.ts`
- Modify: `src/convert-keymap.ts`

- [ ] **Step 1: Write failing tests for convertKeymap**

Append to `tests/convert-keymap.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { convertKeymap } from "../src/convert-keymap.js";

const FIXTURE = join(__dirname, "fixtures", "macos-sample.xml");

function parseOutput(xml: string): Document {
  return new DOMParser().parseFromString(xml, "text/xml");
}

function getKeystroke(
  doc: Document,
  actionId: string,
  tag: "keyboard-shortcut" | "mouse-shortcut",
  attr: string
): string | null {
  const actions = doc.getElementsByTagName("action");
  for (let i = 0; i < actions.length; i++) {
    if (actions[i].getAttribute("id") === actionId) {
      const shortcuts = actions[i].getElementsByTagName(tag);
      if (shortcuts.length > 0) {
        return shortcuts[0].getAttribute(attr);
      }
    }
  }
  return null;
}

describe("convertKeymap", () => {
  const input = readFileSync(FIXTURE, "utf-8");

  it("changes parent attribute", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP, {
      parent: "$default",
    });
    const doc = parseOutput(output);
    expect(doc.documentElement.getAttribute("parent")).toBe("$default");
  });

  it("changes name attribute", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP, {
      name: "My Linux Keymap",
    });
    const doc = parseOutput(output);
    expect(doc.documentElement.getAttribute("name")).toBe("My Linux Keymap");
  });

  it("remaps meta to control", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP);
    const doc = parseOutput(output);
    expect(
      getKeystroke(doc, "$Copy", "keyboard-shortcut", "first-keystroke")
    ).toBe("control C");
  });

  it("remaps meta shift", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP);
    const doc = parseOutput(output);
    expect(
      getKeystroke(doc, "FindInPath", "keyboard-shortcut", "first-keystroke")
    ).toBe("control shift F");
  });

  it("remaps control to alt", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP);
    const doc = parseOutput(output);
    expect(
      getKeystroke(doc, "EditorUp", "keyboard-shortcut", "first-keystroke")
    ).toBe("alt P");
  });

  it("remaps mouse shortcut", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP);
    const doc = parseOutput(output);
    expect(
      getKeystroke(doc, "GotoDeclaration", "mouse-shortcut", "keystroke")
    ).toBe("control button1");
  });

  it("preserves alt-only shortcuts", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP);
    const doc = parseOutput(output);
    expect(
      getKeystroke(
        doc,
        "ShowIntentionActions",
        "keyboard-shortcut",
        "first-keystroke"
      )
    ).toBe("alt ENTER");
  });

  it("preserves no-modifier shortcuts", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP);
    const doc = parseOutput(output);
    expect(
      getKeystroke(
        doc,
        "ExpandLiveTemplateByTab",
        "keyboard-shortcut",
        "first-keystroke"
      )
    ).toBe("TAB");
  });

  it("remaps first-keystroke but preserves plain second-keystroke", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP);
    const doc = parseOutput(output);
    expect(
      getKeystroke(
        doc,
        "FoldRegionRecursively",
        "keyboard-shortcut",
        "first-keystroke"
      )
    ).toBe("control alt MULTIPLY");
    expect(
      getKeystroke(
        doc,
        "FoldRegionRecursively",
        "keyboard-shortcut",
        "second-keystroke"
      )
    ).toBe("1");
  });

  it("outputs valid XML", () => {
    const output = convertKeymap(input, DEFAULT_MODIFIER_MAP);
    const doc = parseOutput(output);
    expect(doc.documentElement.tagName).toBe("keymap");
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npx vitest run
```

Expected: Fails — `convertKeymap` not found.

- [ ] **Step 3: Implement convertKeymap**

Append to `src/convert-keymap.ts`:

```typescript
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export interface ConvertOptions {
  name?: string;
  parent?: string;
}

export function convertKeymap(
  xmlInput: string,
  modifierMap: ModifierMap,
  options: ConvertOptions = {}
): string {
  const doc = new DOMParser().parseFromString(xmlInput, "text/xml");
  const root = doc.documentElement;

  if (options.name !== undefined) {
    root.setAttribute("name", options.name);
  }
  if (options.parent !== undefined) {
    root.setAttribute("parent", options.parent);
  }

  const actions = root.getElementsByTagName("action");
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    const keyboardShortcuts = action.getElementsByTagName("keyboard-shortcut");
    for (let j = 0; j < keyboardShortcuts.length; j++) {
      const shortcut = keyboardShortcuts[j];
      for (const attr of ["first-keystroke", "second-keystroke"]) {
        const value = shortcut.getAttribute(attr);
        if (value) {
          shortcut.setAttribute(attr, remapKeystroke(value, modifierMap));
        }
      }
    }

    const mouseShortcuts = action.getElementsByTagName("mouse-shortcut");
    for (let j = 0; j < mouseShortcuts.length; j++) {
      const shortcut = mouseShortcuts[j];
      const value = shortcut.getAttribute("keystroke");
      if (value) {
        shortcut.setAttribute("keystroke", remapKeystroke(value, modifierMap));
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All 25 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convert-keymap.ts tests/convert-keymap.test.ts
git commit -m "feat: add full XML keymap conversion"
```

---

### Task 6: TDD — CLI Interface

**Files:**
- Create: `src/cli.ts`
- Modify: `tests/convert-keymap.test.ts`

- [ ] **Step 1: Write failing tests for CLI**

Append to `tests/convert-keymap.test.ts`:

```typescript
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", "src/cli.ts", ...args], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      status: err.status ?? 1,
    };
  }
}

describe("CLI", () => {
  it("converts file with default mapping", () => {
    const tmp = mkdtempSync(join(tmpdir(), "keymap-"));
    const output = join(tmp, "output.xml");
    const result = runCli([FIXTURE, "-o", output]);
    expect(result.status).toBe(0);
    const doc = parseOutput(readFileSync(output, "utf-8"));
    expect(
      getKeystroke(doc, "$Copy", "keyboard-shortcut", "first-keystroke")
    ).toBe("control C");
  });

  it("accepts --name and --parent", () => {
    const tmp = mkdtempSync(join(tmpdir(), "keymap-"));
    const output = join(tmp, "output.xml");
    const result = runCli([
      FIXTURE,
      "-o",
      output,
      "--name",
      "Linux Custom",
      "--parent",
      "$default",
    ]);
    expect(result.status).toBe(0);
    const doc = parseOutput(readFileSync(output, "utf-8"));
    expect(doc.documentElement.getAttribute("name")).toBe("Linux Custom");
    expect(doc.documentElement.getAttribute("parent")).toBe("$default");
  });

  it("accepts custom --map overrides", () => {
    const tmp = mkdtempSync(join(tmpdir(), "keymap-"));
    const output = join(tmp, "output.xml");
    const result = runCli([
      FIXTURE,
      "-o",
      output,
      "--map",
      "meta=control",
      "--map",
      "control=control",
    ]);
    expect(result.status).toBe(0);
    const doc = parseOutput(readFileSync(output, "utf-8"));
    expect(
      getKeystroke(doc, "EditorUp", "keyboard-shortcut", "first-keystroke")
    ).toBe("control P");
  });

  it("writes to stdout when -o is omitted", () => {
    const result = runCli([FIXTURE]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<keymap");
    expect(result.stdout).toContain("control C");
  });

  it("exits with error for missing input file", () => {
    const result = runCli(["nonexistent.xml"]);
    expect(result.status).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npx vitest run
```

Expected: Fails — `src/cli.ts` does not exist.

- [ ] **Step 3: Implement CLI**

Write `src/cli.ts`:

```typescript
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import {
  convertKeymap,
  DEFAULT_MODIFIER_MAP,
  type ModifierMap,
} from "./convert-keymap.js";

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

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: "string", short: "o" },
    name: { type: "string" },
    parent: { type: "string" },
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
});

if (values.output) {
  writeFileSync(values.output, output, "utf-8");
} else {
  process.stdout.write(output);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All 30 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/convert-keymap.test.ts
git commit -m "feat: add CLI interface with configurable modifier mapping"
```

---

### Task 7: Final README and Push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README with full usage**

Write `README.md`:

```markdown
# jetbrains-macos-to-linux

Convert JetBrains IDE keymaps from macOS to Linux by remapping modifier keys.

## The Problem

When moving from macOS to Linux, JetBrains keymap files use `meta` (Command ⌘) as the primary modifier, but Linux uses `control` (Ctrl). Custom keymaps don't transfer cleanly — the Control, Meta, and Alt keys end up mapped to the wrong physical keys.

## Installation

Requires Node.js 18+.

```bash
git clone https://github.com/<your-username>/jetbrains-macos-to-linux.git
cd jetbrains-macos-to-linux
npm install
```

## Usage

### Basic conversion

```bash
npx tsx src/cli.ts ~/path/to/MacKeymap.xml -o ~/path/to/LinuxKeymap.xml
```

### Set keymap name and parent

```bash
npx tsx src/cli.ts input.xml -o output.xml \
  --name "My Linux Keymap" \
  --parent '$default'
```

### Custom modifier mapping

Override any modifier with `--map`:

```bash
npx tsx src/cli.ts input.xml -o output.xml \
  --map meta=control \
  --map control=control
```

### Output to stdout

Omit `-o` to print to stdout (useful for piping):

```bash
npx tsx src/cli.ts input.xml | xmllint --format -
```

## Default Modifier Mapping

| macOS (input) | Linux (output) | Rationale |
|---------------|----------------|-----------|
| `meta` (Command ⌘) | `control` | Primary modifier on Linux is Ctrl |
| `control` | `alt` | Avoids collision with remapped meta |
| `alt` (Option ⌥) | `alt` | Stays the same |
| `shift` | `shift` | Stays the same |

## Where JetBrains Stores Keymaps

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/JetBrains/<product><version>/jba_config/mac.keymaps/` |
| Linux | `~/.config/JetBrains/<product><version>/keymaps/` |

**Important:** Close the IDE before placing converted keymap files. The IDE overwrites external changes while running.

## Running Tests

```bash
npm test
```
```

- [ ] **Step 2: Commit and push**

```bash
git add README.md
git commit -m "docs: add full README with usage examples"
git push
```
