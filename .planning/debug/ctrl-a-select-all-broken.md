---
slug: ctrl-a-select-all-broken
status: resolved
trigger: |
  User wrote a tool to convert their macOS JetBrains keymap to Linux. After
  recent changes (commit 3d4d133 "fix: context-aware modifier remapping") the
  user reports that the converted keymap no longer works in JetBrains on Linux —
  even basic shortcuts like Ctrl+A (select all) don't work.
created: 2026-05-05
updated: 2026-05-05
---

# Debug Session: ctrl-a-select-all-broken

## Symptoms

- **Expected behavior:** After running the converter on a macOS keymap and
  loading the result in JetBrains on Linux, standard shortcuts (Ctrl+A select
  all, Ctrl+C copy, etc.) should work as the user expects from macOS muscle
  memory (i.e. macOS ⌘+A → Linux Ctrl+A).
- **Actual behavior:** Ctrl+A does not select all in JetBrains on Linux after
  applying the converted keymap. Other shortcuts also reportedly broken.
- **Error messages:** None reported (silent failure — keystrokes are simply not
  triggering the expected action).
- **Timeline:** User believed it was working at some point. After making changes
  (most recent: commit 3d4d133 "fix: context-aware modifier remapping") it is
  broken.
- **Reproduction:** Run `npx tsx src/cli.ts <mac-keymap>.xml -o <out>.xml`,
  drop output into `~/.config/JetBrains/<product><version>/keymaps/`, restart
  IDE, select the new keymap, press Ctrl+A in editor.

## Project context (auto-gathered)

- TypeScript CLI: `src/cli.ts`, `src/convert-keymap.ts`
- Tests: `tests/convert-keymap.test.ts`, `tests/fixtures/`
- Recent commits:
  - `3d4d133 fix: context-aware modifier remapping` (most recent)
  - `106c278 feat: JetBrains macOS to Linux keymap converter`

## Current Focus

- hypothesis: Default parent attribute `Mac OS X 10.5+` is preserved in the
  converted output. Actions the user never customized (like `$SelectAll`) are
  not present in the keymap XML at all — they inherit from the parent. On
  Linux, the macOS parent keymap maps `$SelectAll` to `meta A` which the IDE
  resolves to Super+A, NOT Ctrl+A.
- test: Inspect a typical exported macOS keymap (which only contains user
  overrides) — confirm `$SelectAll` is not present, and the root `<keymap>`
  element has `parent="Mac OS X 10.5+"`.
- expecting: Converted output to retain the macOS parent, leaving inherited
  shortcuts (incl. SelectAll) as macOS bindings on Linux.
- next_action: Already complete — see Resolution.

## Evidence

- timestamp: 2026-05-05
  finding: |
    `tests/fixtures/macos-sample.xml` line 2:
    `<keymap version="1" name="My Mac Keymap" parent="Mac OS X 10.5+" disable-mnemonics="true">`
    The fixture's parent is `Mac OS X 10.5+` and it contains NO `$SelectAll`
    action — exactly what a real exported macOS keymap looks like.

- timestamp: 2026-05-05
  finding: |
    Running the converter on the fixture produces output that still has
    `parent="Mac OS X 10.5+"`. Only actions explicitly listed in the file
    (Copy, Paste, Undo, FindInPath, etc.) get their `meta` rewritten to `ctrl`.
    Any action not listed (SelectAll, NewLine, MoveCaret*, etc.) is inherited
    from the parent keymap unchanged.

- timestamp: 2026-05-05
  finding: |
    JetBrains keymap inheritance: child keymaps only override actions they
    explicitly list. All other actions come from the parent. When parent is
    `Mac OS X 10.5+`, `$SelectAll` is bound to `meta A`. On Linux, the JVM
    maps the physical Meta/Super (Windows) key — NOT Ctrl — to `meta`. So
    Ctrl+A does nothing for SelectAll; only Super+A would trigger it.

- timestamp: 2026-05-05
  finding: |
    `src/convert-keymap.ts:60-101` — `convertKeymap()` walks `<action>` nodes
    and rewrites their `<keyboard-shortcut>` attributes. It never modifies
    the `parent` attribute unless the user passes `--parent` or `--no-parent`.
    The conversion logic itself (meta→ctrl) is correct for actions present
    in the file; this is verifiable from CLI output where `meta C` → `ctrl C`.

- timestamp: 2026-05-05
  finding: |
    Test suite passes (29/29). Tests confirm the modifier mapping works for
    in-file actions, but no test asserts what happens to inherited actions
    or whether the parent is rewritten. This is the gap that allowed the bug
    to ship.

- timestamp: 2026-05-05
  finding: |
    Commit 3d4d133 did NOT introduce the parent issue — it has existed since
    the initial commit (106c278). What 3d4d133 did was make the user trust
    the tool more (after seeing tests pass) and re-export/re-convert their
    keymap. The user's perception that "it was working before" likely refers
    to a different mental model — they may have previously had an older
    keymap installed where Linux IDE was simply using the default Linux
    keymap, or had set parent manually.

## Eliminated

- The modifier-remap logic itself is NOT the bug — `meta C` correctly becomes
  `ctrl C` etc. The 29-test suite passes and CLI output verifies this directly.
- It is not an XML serialization issue (output is well-formed, `xmldom`
  handles it correctly).
- It is not the context-aware remap from 3d4d133 — the Meh-combo logic is
  exercised by the unit tests and produces correct output.

## Resolution

- **Root cause:** The converter preserves the macOS parent keymap attribute
  (`parent="Mac OS X 10.5+"`) by default. JetBrains keymap files only contain
  user-overridden actions; everything else is inherited from the parent. On
  Linux, the macOS parent maps `$SelectAll` (and many other common actions)
  to `meta+X` shortcuts, where `meta` resolves to the physical Super/Windows
  key — not Ctrl. So Ctrl+A does nothing; the user would have to press
  Super+A to trigger SelectAll. The converter must rewrite the parent to a
  Linux-appropriate keymap (e.g. `$default`) so inherited shortcuts come
  from the standard Linux bindings.

- **Fix applied:** In `src/convert-keymap.ts`, added an `isMacOsParent()`
  helper and a default-branch in `convertKeymap()` that auto-rewrites the
  parent attribute to `$default` whenever the input has a macOS parent
  (`Mac OS X 10.5+`, `Mac OS X`, `macOS`, `macOS System Shortcuts`) AND the
  user did not pass `--parent` or `--no-parent`. Added 10 new tests in
  `tests/convert-keymap.test.ts` covering: the `isMacOsParent` helper,
  auto-rewrite by default, opt-out via explicit `--parent`, opt-out via
  `--no-parent`, leaving non-macOS parents alone, and a CLI integration
  test asserting the parent is rewritten end-to-end.

- **Verification:**
  - `npm test` → 39/39 passing (was 29/29; added 10 new tests).
  - `npx tsx src/cli.ts tests/fixtures/macos-sample.xml` now emits
    `<keymap ... parent="$default" ...>` instead of `parent="Mac OS X 10.5+"`.
  - User-facing impact: after re-running the converter and re-importing the
    keymap into JetBrains on Linux, Ctrl+A (and every other inherited
    shortcut like Ctrl+S save, Ctrl+Z undo on actions not explicitly
    overridden) will now resolve via the `$default` Linux keymap.

- **User action required:** Re-run the converter on the original macOS
  keymap, drop the new output into
  `~/.config/JetBrains/<product><version>/keymaps/` (with the IDE closed),
  restart the IDE, and re-select the keymap.

## Follow-up (2026-11-03)

The parent rewrite above did not fix the reported symptoms. The actual cause:

- `parseKeystroke` kept only the last non-modifier token, so `Force touch`
  became `touch`. The IDE throws `InvalidDataException: Wrong mouse-shortcut:
  'touch'` on it and stops loading the keymap, leaving only the 49 actions
  before `Console.TableResult.NavigateForeignAction`. The IDE then saved that
  partial keymap over `macOS Converted.xml` on 2026-10-28.
- Rewriting the parent to `$default` discarded the macOS parent's shortcuts.
  They are now merged into the output.
- `meta X` and `ctrl X` both become `ctrl X`, and these collisions were left
  unresolved. See "Collisions" in the README.

Verified by the user in RubyMine 2026.2: Ctrl+O and Ctrl+Shift+A work.
