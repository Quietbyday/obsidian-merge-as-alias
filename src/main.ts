import { App, FuzzySuggestModal, Menu, Notice, Plugin, TFile, Setting, PluginSettingTab } from 'obsidian';

interface MergeAsAliasSettings {
    concatenateTextFields: boolean;
    textSeparator: string;
    mergeListFields: boolean;
    addSeparatorBeforeContent: boolean;
    contentSeparator: string;
}

const DEFAULT_SETTINGS: MergeAsAliasSettings = {
    concatenateTextFields: true,
    textSeparator: " | ",
    mergeListFields: true,
    addSeparatorBeforeContent: true,
    contentSeparator: "\n\n---\n\n# Merged from: ",
};

export default class MergeAsAliasPlugin extends Plugin {
    settings: MergeAsAliasSettings;

    async onload() {
        await this.loadSettings();

        console.log('✅ Merge as Alias plugin loaded successfully!');

        // Add to the three-dots menu
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item
                            .setTitle('Merge entire file as alias with...')
                            .setIcon('git-merge')
                            .onClick(async () => {
                                await this.mergeAsAlias(file);
                            });
                    });
                }
            })
        );

        // Add command for Command Palette (Ctrl/Cmd + P)
        this.addCommand({
            id: 'merge-as-alias',
            name: 'Merge entire file as alias with...',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile?.extension === 'md') {
                    if (!checking) this.mergeAsAlias(activeFile);
                    return true;
                }
                return false;
            }
        });

        // Add settings tab
        this.addSettingTab(new MergeAsAliasSettingTab(this.app, this));
    }

    async mergeAsAlias(sourceFile: TFile) {
        const targetFile = await this.chooseNoteModal();

        if (!targetFile) {
            new Notice('❌ Merge cancelled — no note selected.');
            return;
        }

        if (targetFile.path === sourceFile.path) {
            new Notice('❌ Cannot merge a note with itself.');
            return;
        }

        const alias = sourceFile.basename;
        const mainName = targetFile.basename;

        try {
            // 1. Add alias to target note
            await this.app.fileManager.processFrontMatter(targetFile, (fm: any) => {
                if (!fm.aliases) fm.aliases = [];
                if (!fm.aliases.includes(alias)) fm.aliases.push(alias);
            });

            // 2. Merge frontmatter
            await this.mergeFrontmatter(targetFile, sourceFile);

            // 3. Merge content
            await this.mergeContent(targetFile, sourceFile);

            // 4. Update all internal links
            await this.updateAllLinks(sourceFile, targetFile);

            // 5. Delete source file
            await this.app.vault.delete(sourceFile);

            // 6. Open the target note
            await this.app.workspace.getLeaf(false).openFile(targetFile);

            new Notice(`✅ Successfully merged "${alias}" as alias into "${mainName}"`, 5000);
        } catch (err) {
            console.error('Merge error:', err);
            new Notice('❌ Merge failed — check console (Ctrl+Shift+I)');
        }
    }

    async chooseNoteModal(): Promise<TFile | null> {
        return new Promise((resolve) => {
            const modal = new ReliableNoteSelectorModal(this.app, (selected: TFile | null) => {
                resolve(selected);
            });
            modal.open();
        });
    }

    async mergeFrontmatter(targetFile: TFile, sourceFile: TFile) {
        const sourceCache = this.app.metadataCache.getFileCache(sourceFile);
        const sourceFm = sourceCache?.frontmatter || {};

        await this.app.fileManager.processFrontMatter(targetFile, (targetFm: any) => {
            for (const key in sourceFm) {
                if (key === 'position') continue;

                const sourceValue = sourceFm[key];
                const targetValue = targetFm[key];

                if (Array.isArray(sourceValue)) {
                    if (this.settings.mergeListFields) {
                        if (!targetFm[key]) targetFm[key] = [];
                        const combined = [...new Set([...(targetFm[key] || []), ...sourceValue])];
                        targetFm[key] = combined;
                    }
                }
                else if (typeof sourceValue === 'string' && this.settings.concatenateTextFields) {
                    if (!targetValue) {
                        targetFm[key] = sourceValue;
                    } else if (typeof targetValue === 'string') {
                        targetFm[key] = `${targetValue}${this.settings.textSeparator}${sourceValue}`;
                    }
                }
                else {
                    if (!(key in targetFm) || targetFm[key] === undefined) {
                        targetFm[key] = sourceValue;
                    }
                }
            }
        });
    }

    async mergeContent(targetFile: TFile, sourceFile: TFile) {
        const targetContent = await this.app.vault.read(targetFile);
        let sourceContent = await this.app.vault.read(sourceFile);

        // Remove frontmatter from source content
        sourceContent = sourceContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();

        let separator = '\n\n';   // Always start merged content on a new line

        if (this.settings.addSeparatorBeforeContent) {
            separator = this.settings.contentSeparator + sourceFile.basename + '\n\n';
        }

        const newContent = targetContent.trim() + separator + sourceContent;
        await this.app.vault.modify(targetFile, newContent);
    }

    async updateAllLinks(oldFile: TFile, newFile: TFile) {
        const oldName = oldFile.basename;
        const newName = newFile.basename;
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            let content = await this.app.vault.read(file);
            const regex = new RegExp(`\\[\\[${oldName}(?:\\|[^\\]]*)?\\]\\]`, 'g');
            const newContent = content.replace(regex, `[[${newName}|${oldName}]]`);

            if (newContent !== content) {
                await this.app.vault.modify(file, newContent);
            }
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        console.log('Merge as Alias plugin unloaded.');
    }
}

/**
 * Reliable modal (the version that worked for you)
 */
class ReliableNoteSelectorModal extends FuzzySuggestModal<TFile> {
    private callback: (file: TFile | null) => void;

    constructor(app: App, callback: (file: TFile | null) => void) {
        super(app);
        this.callback = callback;
        this.setPlaceholder("Choose the note to merge this file INTO...");
        this.setInstructions([
            { command: "↑↓", purpose: "navigate" },
            { command: "enter", purpose: "select" },
            { command: "esc", purpose: "cancel" }
        ]);
    }

    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles().filter(file => file.extension === "md");
    }

    getItemText(file: TFile): string {
        return file.basename;
    }

    onChooseItem(selectedFile: TFile) {
        this.callback(selectedFile);
        this.close();
    }

    onClose() {
        // Small delay to avoid race conditions
        setTimeout(() => this.callback(null), 50);
    }
}

/**
 * Settings Tab
 */
class MergeAsAliasSettingTab extends PluginSettingTab {
    plugin: MergeAsAliasPlugin;

    constructor(app: App, plugin: MergeAsAliasPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Merge as Alias Settings' });

        new Setting(containerEl)
            .setName('Merge list fields')
            .setDesc('Combine arrays such as tags, aliases, categories, etc. (removes duplicates)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.mergeListFields)
                .onChange(async (value) => {
                    this.plugin.settings.mergeListFields = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Concatenate text fields')
            .setDesc('When both notes have the same text field (e.g. description, summary), combine them')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.concatenateTextFields)
                .onChange(async (value) => {
                    this.plugin.settings.concatenateTextFields = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Text separator')
            .setDesc('Separator used when concatenating text fields')
            .addText(text => text
                .setValue(this.plugin.settings.textSeparator)
                .onChange(async (value) => {
                    this.plugin.settings.textSeparator = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Add separator before merged content')
            .setDesc('Insert a heading or divider before the content from the merged note')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.addSeparatorBeforeContent)
                .onChange(async (value) => {
                    this.plugin.settings.addSeparatorBeforeContent = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Content separator text')
            .setDesc('Text to show before merged content when the option above is enabled')
            .addTextArea(text => text
                .setValue(this.plugin.settings.contentSeparator)
                .onChange(async (value) => {
                    this.plugin.settings.contentSeparator = value;
                    await this.plugin.saveSettings();
                }));
    }
}