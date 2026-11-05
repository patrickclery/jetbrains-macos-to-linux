import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import {
  parseKeystroke,
  remapKeystroke,
  convertKeymap,
  convertKeymapWithReport,
  isMacOsParent,
} from "../src/convert-keymap.js";

const FIXTURE = join(import.meta.dirname, "fixtures", "macos-sample.xml");

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

  it("preserves original key and modifier casing", () => {
    const [modifiers, key] = parseKeystroke("ctrl meta alt back_quote");
    expect(modifiers).toEqual(["ctrl", "meta", "alt"]);
    expect(key).toBe("back_quote");
  });
});

describe("remapKeystroke", () => {
  it("remaps meta to ctrl", () => {
    expect(remapKeystroke("meta C")).toBe("ctrl C");
  });

  it("remaps meta shift", () => {
    expect(remapKeystroke("meta shift F")).toBe("ctrl shift F");
  });

  it("keeps ctrl as ctrl when meta is absent", () => {
    expect(remapKeystroke("ctrl P")).toBe("ctrl P");
  });

  it("keeps ctrl 1 for tool windows", () => {
    expect(remapKeystroke("ctrl 2")).toBe("ctrl 2");
  });

  it("remaps meta to alt when ctrl is present (Meh combo)", () => {
    expect(remapKeystroke("shift ctrl meta p")).toBe("shift ctrl alt p");
  });

  it("remaps ctrl+meta+alt with deduplication", () => {
    // ctrl stays ctrl, meta→alt (ctrl present), alt stays alt (deduped with meta→alt)
    expect(remapKeystroke("ctrl meta alt back_quote")).toBe(
      "ctrl alt back_quote"
    );
  });

  it("leaves key-only shortcuts unchanged", () => {
    expect(remapKeystroke("TAB")).toBe("TAB");
  });

  it("leaves alt ENTER unchanged", () => {
    expect(remapKeystroke("alt ENTER")).toBe("alt ENTER");
  });

  it("remaps meta in mouse shortcuts", () => {
    expect(remapKeystroke("meta button1")).toBe("ctrl button1");
  });
});

describe("isMacOsParent", () => {
  it("returns true for 'Mac OS X 10.5+'", () => {
    expect(isMacOsParent("Mac OS X 10.5+")).toBe(true);
  });

  it("returns true for 'Mac OS X'", () => {
    expect(isMacOsParent("Mac OS X")).toBe(true);
  });

  it("returns true for 'macOS'", () => {
    expect(isMacOsParent("macOS")).toBe(true);
  });

  it("returns false for '$default'", () => {
    expect(isMacOsParent("$default")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isMacOsParent(null)).toBe(false);
    expect(isMacOsParent(undefined)).toBe(false);
    expect(isMacOsParent("")).toBe(false);
  });
});

describe("convertKeymap", () => {
  const input = readFileSync(FIXTURE, "utf-8");

  it("changes parent attribute", () => {
    const output = convertKeymap(input, { parent: "$default" });
    const doc = parseOutput(output);
    expect(doc.documentElement.getAttribute("parent")).toBe("$default");
  });

  it("changes name attribute", () => {
    const output = convertKeymap(input, { name: "My Linux Keymap" });
    const doc = parseOutput(output);
    expect(doc.documentElement.getAttribute("name")).toBe("My Linux Keymap");
  });

  it("removes parent with removeParent option", () => {
    const output = convertKeymap(input, { removeParent: true });
    const doc = parseOutput(output);
    expect(doc.documentElement.hasAttribute("parent")).toBe(false);
  });

  it("auto-rewrites macOS parent to $default by default", () => {
    // The fixture has parent="Mac OS X 10.5+". Without rewriting this, all
    // inherited actions (e.g. $SelectAll) stay bound to `meta+X` shortcuts,
    // which on Linux means Super+X — so Ctrl+A (select all) does nothing.
    // This is the regression that broke the user's setup.
    const output = convertKeymap(input);
    const doc = parseOutput(output);
    expect(doc.documentElement.getAttribute("parent")).toBe("$default");
  });

  it("does not rewrite parent when an explicit --parent is provided", () => {
    const output = convertKeymap(input, { parent: "MyCustomParent" });
    const doc = parseOutput(output);
    expect(doc.documentElement.getAttribute("parent")).toBe("MyCustomParent");
  });

  it("does not rewrite parent when removeParent is set", () => {
    const output = convertKeymap(input, { removeParent: true });
    const doc = parseOutput(output);
    expect(doc.documentElement.hasAttribute("parent")).toBe(false);
  });

  it("leaves a non-macOS parent unchanged by default", () => {
    const customInput = input.replace(
      'parent="Mac OS X 10.5+"',
      'parent="$default"'
    );
    const output = convertKeymap(customInput);
    const doc = parseOutput(output);
    expect(doc.documentElement.getAttribute("parent")).toBe("$default");
  });

  it("remaps meta to ctrl (Copy)", () => {
    const output = convertKeymap(input);
    const doc = parseOutput(output);
    expect(
      getKeystroke(doc, "$Copy", "keyboard-shortcut", "first-keystroke")
    ).toBe("ctrl C");
  });

  it("remaps meta shift (FindInPath)", () => {
    const output = convertKeymap(input);
    const doc = parseOutput(output);
    expect(
      getKeystroke(doc, "FindInPath", "keyboard-shortcut", "first-keystroke")
    ).toBe("ctrl shift F");
  });

  it("keeps ctrl as ctrl when meta absent (EditorUp)", () => {
    // In isolation: the bundled parent's ⌘P outranks this ⌃P when it's loaded.
    const output = convertKeymap(input, {
      loadKeymap: () => null,
      loadPluginShortcuts: () => ({}),
    });
    const doc = parseOutput(output);
    expect(
      getKeystroke(doc, "EditorUp", "keyboard-shortcut", "first-keystroke")
    ).toBe("ctrl P");
  });

  it("remaps mouse shortcut meta to ctrl", () => {
    const output = convertKeymap(input);
    const doc = parseOutput(output);
    expect(
      getKeystroke(doc, "GotoDeclaration", "mouse-shortcut", "keystroke")
    ).toBe("ctrl button1");
  });

  it("preserves alt-only shortcuts", () => {
    const output = convertKeymap(input);
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
    const output = convertKeymap(input);
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

  it("remaps first-keystroke and preserves second-keystroke", () => {
    const output = convertKeymap(input);
    const doc = parseOutput(output);
    expect(
      getKeystroke(
        doc,
        "FoldRegionRecursively",
        "keyboard-shortcut",
        "first-keystroke"
      )
    ).toBe("ctrl alt MULTIPLY");
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
    const output = convertKeymap(input);
    const doc = parseOutput(output);
    expect(doc.documentElement.tagName).toBe("keymap");
  });
});

// --- CLI integration tests ---

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

function runCli(
  args: string[]
): { stdout: string; stderr: string; status: number } {
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
    ).toBe("ctrl C");
  });

  it("auto-rewrites macOS parent to $default via CLI", () => {
    const tmp = mkdtempSync(join(tmpdir(), "keymap-"));
    const output = join(tmp, "output.xml");
    const result = runCli([FIXTURE, "-o", output]);
    expect(result.status).toBe(0);
    const doc = parseOutput(readFileSync(output, "utf-8"));
    expect(doc.documentElement.getAttribute("parent")).toBe("$default");
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

  it("writes to stdout when -o is omitted", () => {
    const result = runCli([FIXTURE]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<keymap");
    expect(result.stdout).toContain("ctrl C");
  });

  it("exits with error for missing input file", () => {
    const result = runCli(["nonexistent.xml"]);
    expect(result.status).not.toBe(0);
  });
});

describe("macOS inheritance and collisions", () => {
  const macParent = `<keymap name="Mac OS X 10.5+" parent="$default" disable-mnemonics="true">
    <action id="GotoDeclaration"><mouse-shortcut keystroke="Force touch" /></action>
    <action id="$Copy"><keyboard-shortcut first-keystroke="meta C" /></action>
    <action id="$SelectAll"><keyboard-shortcut first-keystroke="meta A" /></action>
    <action id="OverrideMethods"><keyboard-shortcut first-keystroke="ctrl O" /></action>
    <action id="ExportToTextFile"><keyboard-shortcut first-keystroke="ctrl O" /></action>
  </keymap>`;
  const defaultKeymap = `<keymap name="$default">
    <action id="Untouched"><keyboard-shortcut first-keystroke="ctrl Q" /></action>
    <action id="Unlisted"><keyboard-shortcut first-keystroke="ctrl O" /></action>
  </keymap>`;
  const convert = (actions: string) =>
    convertKeymapWithReport(
      `<keymap version="1" name="Mine" parent="Mac OS X 10.5+">${actions}</keymap>`,
      {
        loadKeymap: (name) =>
          ({ "Mac OS X 10.5+": macParent, $default: defaultKeymap })[name] ?? null,
        loadPluginShortcuts: () => ({}),
      }
    );
  const keystrokes = (xml: string, actionId: string) => {
    const actions = parseOutput(xml).getElementsByTagName("action");
    for (let i = 0; i < actions.length; i++) {
      if (actions[i].getAttribute("id") === actionId) {
        const shortcuts = actions[i].getElementsByTagName("keyboard-shortcut");
        return Array.from({ length: shortcuts.length }, (_, j) =>
          shortcuts[j].getAttribute("first-keystroke")
        );
      }
    }
    return null;
  };

  it("drops Force touch, which aborts loading the keymap on Linux", () => {
    const { xml } = convert(
      `<action id="GotoDeclaration">
        <mouse-shortcut keystroke="meta button1" />
        <mouse-shortcut keystroke="Force touch" />
      </action>`
    );
    expect(xml).not.toMatch(/touch/i);
    expect(xml).toContain('keystroke="ctrl button1"');
  });

  it("keeps all tokens of a multi-word mouse shortcut", () => {
    expect(remapKeystroke("meta button1 doubleClick")).toBe(
      "ctrl button1 doubleClick"
    );
  });

  it("converts shortcuts inherited from the macOS parent", () => {
    const { xml } = convert("");
    expect(keystrokes(xml, "$SelectAll")).toEqual(["ctrl A"]);
  });

  it("leaves $default actions inherited unless they lose a shortcut", () => {
    const { xml } = convert(
      `<action id="GotoFile"><keyboard-shortcut first-keystroke="meta O" /></action>`
    );
    expect(keystrokes(xml, "Untouched")).toBeNull();
    expect(keystrokes(xml, "GotoFile")).toEqual(["ctrl O"]);
  });

  it("gives ⌘ priority and moves a colliding ⌃ shortcut to Super", () => {
    const { xml, dropped } = convert(
      `<action id="GotoFile"><keyboard-shortcut first-keystroke="meta O" /></action>`
    );
    expect(keystrokes(xml, "OverrideMethods")).toEqual(["meta O"]);
    expect(dropped.find((d) => d.actionId === "OverrideMethods")?.movedTo).toBe(
      "meta O"
    );
  });

  it("lets actions that shared a macOS shortcut share its fallback", () => {
    const { xml } = convert(
      `<action id="GotoFile"><keyboard-shortcut first-keystroke="meta O" /></action>`
    );
    expect(keystrokes(xml, "ExportToTextFile")).toEqual(["meta O"]);
  });

  it("does not let a custom ⌃C take Ctrl+C from inherited ⌘C", () => {
    const { xml } = convert(
      `<action id="Custom"><keyboard-shortcut first-keystroke="ctrl C" /></action>`
    );
    expect(keystrokes(xml, "$Copy")).toEqual(["ctrl C"]);
    expect(keystrokes(xml, "Custom")).toEqual(["meta C"]);
  });

  it("removes duplicate shortcuts within an action", () => {
    const { xml } = convert(
      `<action id="Dup">
        <keyboard-shortcut first-keystroke="ctrl meta Z" />
        <keyboard-shortcut first-keystroke="meta alt Z" />
      </action>`
    );
    expect(keystrokes(xml, "Dup")).toEqual(["ctrl alt Z"]);
  });

  it("inherits disable-mnemonics from the macOS parent", () => {
    const { xml } = convert("");
    expect(parseOutput(xml).documentElement.getAttribute("disable-mnemonics")).toBe(
      "true"
    );
  });
});
