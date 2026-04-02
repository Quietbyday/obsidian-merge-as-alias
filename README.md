**Merge as Alias**

Merge one note into another while preserving the old name as an alias and updating all internal links.

### Features

- Adds the source note’s name as an **alias** to the target note
- Automatically updates every internal link in your vault from [[Old Note]] → [[Target Note|Old Note]]
- Merges both content and YAML frontmatter
- Deletes the source note after merging
- Opens the target note when complete

### Frontmatter Merge Options

- **Merge list fields** — Combine arrays (tags, aliases, categories, etc.) without duplicates
- **Concatenate text fields** — Join string fields (description, summary, etc.)
- **Text separator** — Choose how text fields are joined (default: " | ")
- **Add separator before merged content** — Insert a divider or heading before appended content
- **Content separator text** — Customize the text shown before merged content

Even when the separator is disabled, merged content always starts on a new line for clean formatting.

### Usage

1. Open the note you want to merge away.
2. Choose **"Merge entire file as alias with..."** from the three-dots menu or Command Palette.
3. Select the target note.
4. The merge happens automatically and the target note opens.

Ideal for cleaning up duplicate notes, consolidating similar topics, or refactoring your vault while keeping old links working.