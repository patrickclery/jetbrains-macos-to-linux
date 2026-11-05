#!/usr/bin/env python3
"""Collect the shortcuts plugins declare in your installed JetBrains IDE.

Usage: python3 scripts/scan_plugin_shortcuts.py <dir> [<dir>...]

Pass the IDE's install directory, plus its user plugins directory if you want
those covered too. Keymap files don't contain these shortcuts, so the converter
needs them to spot collisions. Writes keymaps/plugin-shortcuts.json, which is
ignored by git because it can include data from commercial plugins.
"""
import glob
import json
import os
import re
import sys
import zipfile
from collections import defaultdict

KEYMAPS = ("$default", "Mac OS X 10.5+", "Mac OS X", "macOS System Shortcuts")
OUTPUT = os.path.join(os.path.dirname(__file__), "..", "keymaps", "plugin-shortcuts.json")
ACTION = re.compile(r'<action\b[^>]*?\bid\s*=\s*"([^"]+)"[^>]*?(?<!/)>(.*?)</action>', re.S)
SHORTCUT = re.compile(r"<keyboard-shortcut\b[^>]*>")


def attribute(tag, name):
    match = re.search(rf'{name}="([^"]+)"', tag)
    return match.group(1) if match else None


def main(directories):
    found = defaultdict(lambda: defaultdict(list))
    for directory in directories:
        for jar in glob.glob(f"{directory}/**/*.jar", recursive=True):
            try:
                archive = zipfile.ZipFile(jar)
            except zipfile.BadZipFile:
                continue
            for name in archive.namelist():
                if not name.endswith(".xml") or "/" in name.replace("META-INF/", ""):
                    continue
                text = archive.read(name).decode("utf-8", "ignore")
                for action in ACTION.finditer(text):
                    for tag in SHORTCUT.findall(action.group(2)):
                        keymap = attribute(tag, "keymap")
                        first = attribute(tag, "first-keystroke")
                        if keymap in KEYMAPS and first:
                            shortcut = {"first": first}
                            second = attribute(tag, "second-keystroke")
                            if second:
                                shortcut["second"] = second
                            shortcuts = found[keymap][action.group(1)]
                            if shortcut not in shortcuts:
                                shortcuts.append(shortcut)
    with open(OUTPUT, "w") as out:
        json.dump(found, out, indent=1, sort_keys=True)
        out.write("\n")


if __name__ == "__main__":
    main(sys.argv[1:])
