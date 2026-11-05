import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document, Element } from "@xmldom/xmldom";

const KNOWN_MODIFIERS = new Set(["meta", "control", "ctrl", "alt", "shift"]);

// Parent keymap names used by JetBrains for macOS. A keymap file only lists the
// user's overrides, so these parents hold most of the macOS bindings. They don't
// load on Linux, so their bindings are converted into the output keymap.
const MACOS_PARENT_KEYMAPS = new Set([
  "Mac OS X",
  "Mac OS X 10.5+",
  "macOS System Shortcuts",
  "macOS",
]);

const DEFAULT_LINUX_PARENT = "$default";

const BUNDLED_KEYMAPS = join(import.meta.dirname, "..", "keymaps");
const PLUGIN_SHORTCUTS = join(BUNDLED_KEYMAPS, "plugin-shortcuts.json");

// Pressure input only exists on Mac trackpads. Other platforms reject this
// shortcut with an InvalidDataException, which aborts loading the whole keymap.
const MACOS_ONLY_MOUSE_SHORTCUT = "force touch";

export function isMacOsParent(parent: string | null | undefined): boolean {
  if (!parent) return false;
  return MACOS_PARENT_KEYMAPS.has(parent);
}

export function parseKeystroke(keystroke: string): [string[], string | null] {
  const parts = keystroke.trim().split(/\s+/);
  const modifiers: string[] = [];
  const keys: string[] = [];

  for (const part of parts) {
    if (KNOWN_MODIFIERS.has(part.toLowerCase())) {
      modifiers.push(part);
    } else {
      keys.push(part);
    }
  }

  // Mouse shortcuts can have several non-modifier tokens: "button1 doubleClick".
  return [modifiers, keys.length > 0 ? keys.join(" ") : null];
}

export function remapKeystroke(keystroke: string): string {
  const [modifiers, key] = parseKeystroke(keystroke);
  const lowerMods = modifiers.map((m) => m.toLowerCase());
  const hasCtrl = lowerMods.some((m) => m === "ctrl" || m === "control");

  const newModifiers: string[] = [];
  const seen = new Set<string>();

  for (const mod of modifiers) {
    const lower = mod.toLowerCase();
    let mapped: string;

    if (lower === "meta") {
      // meta → ctrl, unless ctrl is already present, then meta → alt
      mapped = hasCtrl ? "alt" : "ctrl";
    } else if (lower === "ctrl" || lower === "control") {
      // ctrl stays ctrl
      mapped = "ctrl";
    } else {
      mapped = mod;
    }

    if (!seen.has(mapped)) {
      seen.add(mapped);
      newModifiers.push(mapped);
    }
  }

  const parts = key ? [...newModifiers, key] : newModifiers;
  return parts.join(" ");
}

interface Shortcut {
  mouse: boolean;
  first: string;
  second?: string;
}

// Lower layers override higher ones, in the same order the IDE resolves them.
enum Layer {
  User,
  MacParent,
  Default,
}

export interface DroppedShortcut {
  actionId: string;
  shortcut: string;
  keptActions: string[];
  /** Where the shortcut moved to, or undefined if no free slot was left. */
  movedTo?: string;
}

export interface ConvertOptions {
  name?: string;
  parent?: string;
  removeParent?: boolean;
  /** Returns a bundled keymap's XML, or null if it isn't known. */
  loadKeymap?: (name: string) => string | null;
  /** Returns the shortcuts plugins declare for each action of a keymap. */
  loadPluginShortcuts?: (name: string) => Record<string, Shortcut[]>;
}

export interface ConvertResult {
  xml: string;
  dropped: DroppedShortcut[];
}

function loadBundledKeymap(name: string): string | null {
  try {
    return readFileSync(join(BUNDLED_KEYMAPS, `${name}.xml`), "utf-8");
  } catch {
    return null;
  }
}

export function hasPluginShortcuts(): boolean {
  return existsSync(PLUGIN_SHORTCUTS);
}

function loadBundledPluginShortcuts(name: string): Record<string, Shortcut[]> {
  // Generated per machine by scripts/scan_plugin_shortcuts.py.
  if (!hasPluginShortcuts()) return {};
  const all = JSON.parse(readFileSync(PLUGIN_SHORTCUTS, "utf-8"));
  const shortcuts: Record<string, Shortcut[]> = {};
  for (const [id, list] of Object.entries(all[name] ?? {})) {
    shortcuts[id] = (list as Omit<Shortcut, "mouse">[]).map((s) => ({
      ...s,
      mouse: false,
    }));
  }
  return shortcuts;
}

function readActions(root: Element): Map<string, Shortcut[]> {
  const actions = new Map<string, Shortcut[]>();
  const elements = root.getElementsByTagName("action");
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const shortcuts: Shortcut[] = [];
    const keyboard = element.getElementsByTagName("keyboard-shortcut");
    for (let j = 0; j < keyboard.length; j++) {
      const first = keyboard[j].getAttribute("first-keystroke");
      const second = keyboard[j].getAttribute("second-keystroke");
      if (first) {
        shortcuts.push({
          mouse: false,
          first,
          ...(second ? { second } : {}),
        });
      }
    }
    const mouse = element.getElementsByTagName("mouse-shortcut");
    for (let j = 0; j < mouse.length; j++) {
      const keystroke = mouse[j].getAttribute("keystroke");
      if (keystroke) shortcuts.push({ mouse: true, first: keystroke });
    }
    actions.set(element.getAttribute("id")!, shortcuts);
  }
  return actions;
}

function normalizeKeystroke(keystroke: string): string {
  const [modifiers, key] = parseKeystroke(keystroke);
  const normal = modifiers
    .map((m) => m.toLowerCase())
    .map((m) => (m === "control" ? "ctrl" : m))
    .sort();
  return [...normal, key?.toLowerCase() ?? ""].join(" ");
}

function shortcutKey(shortcut: Shortcut): string {
  const parts = [
    shortcut.mouse ? "mouse" : "key",
    normalizeKeystroke(shortcut.first),
  ];
  if (shortcut.second) parts.push(normalizeKeystroke(shortcut.second));
  return parts.join(" | ");
}

function describeShortcut(shortcut: Shortcut): string {
  return shortcut.second
    ? `${shortcut.first}, ${shortcut.second}`
    : shortcut.first;
}

function isMacOsOnly(shortcut: Shortcut): boolean {
  return (
    shortcut.mouse && shortcut.first.toLowerCase() === MACOS_ONLY_MOUSE_SHORTCUT
  );
}

function remapShortcut(shortcut: Shortcut): Shortcut {
  return {
    mouse: shortcut.mouse,
    first: remapKeystroke(shortcut.first),
    ...(shortcut.second ? { second: remapKeystroke(shortcut.second) } : {}),
  };
}

// On macOS the IDE shows $default's ctrl shortcuts as meta (MacOSDefaultKeymap).
function asMacShortcut(shortcut: Shortcut, layer: Layer): Shortcut {
  if (layer !== Layer.Default) return shortcut;
  const toMeta = (keystroke: string) =>
    keystroke.replace(/\b(ctrl|control)\b/gi, "meta");
  return {
    mouse: shortcut.mouse,
    first: toMeta(shortcut.first),
    ...(shortcut.second ? { second: toMeta(shortcut.second) } : {}),
  };
}

// Plain ⌘ shortcuts always win a collision, so a custom ⌃C can't take Ctrl+C away
// from the inherited ⌘C. Otherwise the user's own shortcuts beat inherited ones.
function collisionRank(macShortcut: Shortcut, layer: Layer): number {
  const [modifiers] = parseKeystroke(macShortcut.first);
  const lower = modifiers.map((m) => m.toLowerCase());
  const hasMeta = lower.includes("meta");
  const hasCtrl = lower.includes("ctrl") || lower.includes("control");
  const hasAlt = lower.includes("alt");
  if (hasMeta && !hasCtrl && !hasAlt) return layer;
  const tier = hasMeta && !hasCtrl ? 0 : hasMeta ? 2 : 1;
  return 3 + layer * 3 + tier;
}

// A shortcut that lost its Linux slot keeps its macOS spelling, because `meta`
// (Super on Linux) is otherwise unused. ⌃X has to move to Super+X, since Ctrl+X
// is the slot it just lost.
function fallbackShortcut(mac: Shortcut): Shortcut {
  const [modifiers] = parseKeystroke(mac.first);
  const lower = modifiers.map((m) => m.toLowerCase());
  const first = lower.includes("meta")
    ? mac.first
    : mac.first.replace(/\b(ctrl|control)\b/gi, "meta");
  return {
    mouse: mac.mouse,
    first,
    ...(mac.second ? { second: remapKeystroke(mac.second) } : {}),
  };
}

interface Binding {
  actionId: string;
  linux: Shortcut;
  mac: Shortcut;
  macKey: string;
  rank: number;
}

function collectEffectiveActions(
  userActions: Map<string, Shortcut[]>,
  sourceParent: string,
  loadKeymap: (name: string) => string | null,
  loadPluginShortcuts: (name: string) => Record<string, Shortcut[]>
): { actions: Map<string, { layer: Layer; shortcuts: Shortcut[] }>; disableMnemonics: boolean } {
  const actions = new Map<string, { layer: Layer; shortcuts: Shortcut[] }>();
  let disableMnemonics = false;

  const addLayer = (layerActions: Map<string, Shortcut[]>, layer: Layer) => {
    for (const [id, shortcuts] of layerActions) {
      if (!actions.has(id)) actions.set(id, { layer, shortcuts });
    }
  };

  addLayer(userActions, Layer.User);

  const addKeymap = (name: string, layer: Layer): string | null => {
    const xml = loadKeymap(name);
    if (xml === null) return null;
    const root = new DOMParser().parseFromString(xml, "text/xml").documentElement!;
    if (layer === Layer.MacParent && root.getAttribute("disable-mnemonics") === "true") {
      disableMnemonics = true;
    }
    addLayer(readActions(root), layer);
    const plugin = new Map(Object.entries(loadPluginShortcuts(name)));
    addLayer(plugin, layer);
    return root.getAttribute("parent");
  };

  let current: string | null = sourceParent;
  while (current && current !== DEFAULT_LINUX_PARENT) {
    current = addKeymap(current, Layer.MacParent);
  }
  addKeymap(DEFAULT_LINUX_PARENT, Layer.Default);

  return { actions, disableMnemonics };
}

function resolveCollisions(
  actions: Map<string, { layer: Layer; shortcuts: Shortcut[] }>
): { kept: Map<string, Shortcut[]>; dropped: DroppedShortcut[]; losers: Set<string> } {
  const kept = new Map<string, Shortcut[]>();
  const byKey = new Map<string, Binding[]>();

  for (const [actionId, { layer, shortcuts }] of actions) {
    const seen = new Set<string>();
    kept.set(actionId, []);
    for (const shortcut of shortcuts) {
      if (isMacOsOnly(shortcut)) continue;
      const mac = asMacShortcut(shortcut, layer);
      const linux = remapShortcut(mac);
      const key = shortcutKey(linux);
      if (seen.has(key)) continue;
      seen.add(key);
      const binding: Binding = {
        actionId,
        linux,
        mac,
        macKey: shortcutKey(mac),
        rank: collisionRank(mac, layer),
      };
      byKey.set(key, [...(byKey.get(key) ?? []), binding]);
    }
  }

  const dropped: DroppedShortcut[] = [];
  const losers = new Set<string>();
  // Actions that shared a macOS shortcut can share its fallback too.
  const fallbackOwners = new Map<string, string>();
  for (const bindings of byKey.values()) {
    const winner = bindings.reduce((best, b) => (b.rank < best.rank ? b : best));
    const winners = bindings.filter((b) => b.macKey === winner.macKey);
    for (const binding of bindings) {
      if (binding.macKey === winner.macKey) {
        kept.get(binding.actionId)!.push(binding.linux);
      } else {
        losers.add(binding.actionId);
        const fallback = fallbackShortcut(binding.mac);
        const fallbackKey = shortcutKey(fallback);
        const free =
          !byKey.has(fallbackKey) &&
          (fallbackOwners.get(fallbackKey) ?? binding.macKey) === binding.macKey;
        if (free) {
          fallbackOwners.set(fallbackKey, binding.macKey);
          kept.get(binding.actionId)!.push(fallback);
        }
        dropped.push({
          actionId: binding.actionId,
          shortcut: describeShortcut(binding.linux),
          keptActions: winners.map((w) => w.actionId),
          ...(free ? { movedTo: describeShortcut(fallback) } : {}),
        });
      }
    }
  }

  return { kept, dropped, losers };
}

function writeActions(
  doc: Document,
  root: Element,
  ids: string[],
  kept: Map<string, Shortcut[]>
): void {
  while (root.firstChild) root.removeChild(root.firstChild);

  for (const id of ids) {
    const action = doc.createElement("action");
    action.setAttribute("id", id);
    for (const shortcut of kept.get(id) ?? []) {
      const element = doc.createElement(
        shortcut.mouse ? "mouse-shortcut" : "keyboard-shortcut"
      );
      if (shortcut.mouse) {
        element.setAttribute("keystroke", shortcut.first);
      } else {
        element.setAttribute("first-keystroke", shortcut.first);
        if (shortcut.second) {
          element.setAttribute("second-keystroke", shortcut.second);
        }
      }
      action.appendChild(doc.createTextNode("\n    "));
      action.appendChild(element);
    }
    if (action.firstChild) action.appendChild(doc.createTextNode("\n  "));
    root.appendChild(doc.createTextNode("\n  "));
    root.appendChild(action);
  }
  root.appendChild(doc.createTextNode("\n"));
}

export function convertKeymapWithReport(
  xmlInput: string,
  options: ConvertOptions = {}
): ConvertResult {
  const doc = new DOMParser().parseFromString(xmlInput, "text/xml");
  const root = doc.documentElement!;
  const sourceParent = root.getAttribute("parent");

  if (options.name !== undefined) {
    root.setAttribute("name", options.name);
  }
  if (options.removeParent) {
    root.removeAttribute("parent");
  } else if (options.parent !== undefined) {
    root.setAttribute("parent", options.parent);
  } else if (isMacOsParent(sourceParent)) {
    root.setAttribute("parent", DEFAULT_LINUX_PARENT);
  }

  const userActions = readActions(root);
  const outputParent = root.getAttribute("parent");

  let actions = new Map<string, { layer: Layer; shortcuts: Shortcut[] }>();
  if (isMacOsParent(sourceParent)) {
    const effective = collectEffectiveActions(
      userActions,
      sourceParent!,
      options.loadKeymap ?? loadBundledKeymap,
      options.loadPluginShortcuts ?? loadBundledPluginShortcuts
    );
    actions = effective.actions;
    if (effective.disableMnemonics && !root.hasAttribute("disable-mnemonics")) {
      root.setAttribute("disable-mnemonics", "true");
    }
  } else {
    for (const [id, shortcuts] of userActions) {
      actions.set(id, { layer: Layer.User, shortcuts });
    }
  }

  const { kept, dropped, losers } = resolveCollisions(actions);

  // $default still applies when it's the output's parent, so its actions only
  // need listing when they lost a shortcut. Listing an action replaces all of
  // the shortcuts it would inherit.
  const inheritsDefault = outputParent === DEFAULT_LINUX_PARENT;
  const ids = [...actions]
    .filter(([id, { layer }]) => layer !== Layer.Default || !inheritsDefault || losers.has(id))
    .map(([id]) => id)
    .sort();

  writeActions(doc, root, ids, kept);

  return { xml: new XMLSerializer().serializeToString(doc), dropped };
}

export function convertKeymap(
  xmlInput: string,
  options: ConvertOptions = {}
): string {
  return convertKeymapWithReport(xmlInput, options).xml;
}
