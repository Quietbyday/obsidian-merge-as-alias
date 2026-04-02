# Merge as Alias

Merge one note into another while turning the original note name into an **alias** and automatically updating all internal links in your vault.

This is especially useful when consolidating duplicate or near-duplicate notes without breaking existing links.

## Features

- Adds the source note’s name as an alias to the target note
- Updates every internal link from `[[Old Note]]` → `[[Target Note|Old Note]]`
- Merges both content and YAML frontmatter
- Configurable frontmatter merging behavior
- Automatically opens the target note after merging
- Available from the three-dots menu and Command Palette

## How to Install (Beta)

1. Install the **BRAT** plugin from the Obsidian Community Plugins store.
2. Go to **Settings → Community plugins → BRAT** .
3. Click **Add Beta plugin**.
4. Paste the following repository URL: `https://github.com/quietbyday/obsidian-merge-as-alias`
5. Click **Add Plugin**. 
6. Enable **"Merge as Alias"** in Community plugins.

To update to the latest beta version, go to BRAT and click **Check for updates** (or restart Obsidian).

## Settings

You can configure the merge behavior in **Settings → Merge as Alias**:

- **Merge list fields** — Combine arrays (tags, aliases, categories, etc.) without duplicates 
- **Concatenate text fields** — Join string fields when both notes have the same key (e.g. description, summary)
- **Text separator** — Separator used when concatenating text fields (default: `" | "`)
- **Add separator before merged content** — Insert a divider before the appended content
- **Content separator text** — Custom text shown before merged content

Even when the separator option is disabled, merged content always starts on a new line for clean formatting.

## Usage

1. Open the note you want to merge away (source note).
2. Click the **three dots** menu (or use Command Palette) and select **"Merge entire file as alias with..."**.
3. Choose the target note you want to merge into.
4. The plugin will handle the rest and open the target note when finished.

## Changelog

### 0.4.0-beta (Current)
- Added Changelog

### 0.3.0-beta
- Added **"Confirm file merge"** setting in the options panel
- The confirmation dialog now properly respects "Don't ask again"
- Users can re-enable the confirmation dialog anytime from Settings
- Improved safety before destructive merge operations

### 0.2.0-beta
- Added confirmation dialog before merging (similar to Obsidian's core merge behavior)
- Minor UI and stability improvements

### 0.1.0-beta
- Initial beta release
- Core merge functionality with alias creation
- Automatic internal link updating
- Configurable frontmatter merging
- Settings panel

## License

MIT License
