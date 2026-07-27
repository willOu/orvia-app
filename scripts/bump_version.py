#!/usr/bin/env python3
"""
Bump automatique de version Orvia.
Lit le dernier message de commit pour déterminer le type de bump :
  - "fix:"       -> patch  (2.0.2 -> 2.0.3)
  - "feat:"      -> minor  (2.0.2 -> 2.1.0)
  - "breaking:"  -> major  (2.0.2 -> 3.0.0)
Met à jour APP_VERSION dans index.html ET CACHE_VERSION dans sw.js
pour qu'ils soient TOUJOURS synchronisés (fin du bug de cache-busting manuel).
"""
import re
import sys
import subprocess
from pathlib import Path

INDEX_PATH = Path("index.html")
SW_PATH = Path("sw.js")

def get_last_commit_message():
    try:
        return subprocess.check_output(
            ["git", "log", "-1", "--pretty=%B"], text=True
        ).strip().lower()
    except Exception:
        return ""

def get_current_version():
    content = INDEX_PATH.read_text(encoding="utf-8")
    m = re.search(r"const APP_VERSION\s*=\s*'([\d.]+)'", content)
    if not m:
        sys.exit("APP_VERSION introuvable dans index.html")
    return m.group(1), content

def bump(version, kind):
    major, minor, patch = (int(x) for x in version.split("."))
    if kind == "major":
        return f"{major+1}.0.0"
    if kind == "minor":
        return f"{major}.{minor+1}.0"
    return f"{major}.{minor}.{patch+1}"

def detect_kind(message):
    if message.startswith("breaking:") or "breaking change" in message:
        return "major"
    if message.startswith("feat:"):
        return "minor"
    return "patch"

def update_index(content, old_version, new_version):
    content = content.replace(
        f"const APP_VERSION = '{old_version}';",
        f"const APP_VERSION = '{new_version}';",
        1,
    )
    return content

def update_sw(new_version):
    sw_content = SW_PATH.read_text(encoding="utf-8")
    sw_content = re.sub(
        r"const CACHE_VERSION = 'orvia-v[\d.]+';",
        f"const CACHE_VERSION = 'orvia-v{new_version}';",
        sw_content,
        count=1,
    )
    SW_PATH.write_text(sw_content, encoding="utf-8")

def add_changelog_entry(content, new_version, kind, message):
    from datetime import date
    today = date.today().isoformat()
    label = {
        "major": "Nouveauté majeure",
        "minor": "Nouveauté",
        "patch": "Correctif",
    }[kind]
    summary = message.split(":", 1)[-1].strip().capitalize() or "Mise à jour."
    entry = (
        f"    {{ version: '{new_version}', date: '{today}', "
        f"items: ['{label} : {summary}'] }},\n    {{ version: '{{OLD}}'"
    )
    marker = "const CHANGELOG = [\n    { version: '{OLD}'"
    old_marker = marker.replace("{OLD}", re.search(
        r"const CHANGELOG = \[\n    \{ version: '([\d.]+)'", content
    ).group(1))
    new_block = entry.replace("{{OLD}}", re.search(
        r"const CHANGELOG = \[\n    \{ version: '([\d.]+)'", content
    ).group(1))
    content = content.replace(old_marker, new_block, 1)
    return content

def main():
    version, content = get_current_version()
    message = get_last_commit_message() or "fix: correctif automatique"
    kind = detect_kind(message)
    new_version = bump(version, kind)

    content = update_index(content, version, new_version)
    content = add_changelog_entry(content, new_version, kind, message)
    INDEX_PATH.write_text(content, encoding="utf-8")
    update_sw(new_version)

    print(f"Version bumpée : {version} -> {new_version} ({kind})")
    # Expose pour les étapes suivantes du workflow GitHub Actions
    gh_output = subprocess.os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a") as f:
            f.write(f"new_version={new_version}\n")
            f.write(f"bump_kind={kind}\n")

if __name__ == "__main__":
    main()
