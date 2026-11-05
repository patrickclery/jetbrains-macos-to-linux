import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { convertKeymapWithReport, hasPluginShortcuts } from "./convert-keymap.js";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: "string", short: "o" },
    name: { type: "string" },
    parent: { type: "string" },
    "no-parent": { type: "boolean" },
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

const { xml: output, dropped } = convertKeymapWithReport(xmlInput, {
  name: values.name,
  parent: values.parent,
  removeParent: values["no-parent"],
});

if (!hasPluginShortcuts()) {
  console.error(
    "Note: plugin shortcuts weren't checked for collisions. Run scripts/scan_plugin_shortcuts.py to include them."
  );
}

// Report on stderr so piping the keymap from stdout stays clean.
for (const { actionId, shortcut, keptActions, movedTo } of dropped) {
  const outcome = movedTo ? `moved to ${movedTo}` : "dropped";
  console.error(
    `${actionId}: ${outcome} (${shortcut} is used by ${keptActions.join(", ")})`
  );
}

if (values.output) {
  writeFileSync(values.output, output, "utf-8");
} else {
  process.stdout.write(output);
}
