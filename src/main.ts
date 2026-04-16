import { App, FuzzySuggestModal, Menu, Modal, Notice, Plugin, TFile, Setting, PluginSettingTab } from 'obsidian';

interface MergeAsAliasSettings {
    concatenateTextFields: boolean;
    textSeparator: string;
    mergeListFields: boolean;
    addSeparatorBeforeContent: boolean;
    contentSeparator: string;
    showConfirmationDialog: boolean;   // ← New setting
}

const DEFAULT_SETTINGS: MergeAsAliasSettings = {
    concatenateTextFields: true,
    textSeparator: " | ",
    mergeListFields: true,
    addSeparatorBeforeContent: true,
    contentSeparator: "\n\n---\n\n# Merged from: ",
    showConfirmationDialog: true,      // ← New default (true = show dialog)
};

export default class MergeAsAliasPlugin extends Plugin {
    settings: MergeAsAliasSettings;

    async onload() {
        await this.loadSettings();

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

        // Add command for Command Palette
        this.addCommand({
            id: 'merge-file',
            name: 'Merge entire file as alias with...',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile?.extension === 'md') {
                    if (!checking) void this.mergeAsAlias(activeFile);
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
            new Notice('Merge cancelled — no note selected.');
            return;
        }

        if (targetFile.path === sourceFile.path) {
            new Notice('Cannot merge a note with itself.');
            return;
        }

        // Show confirmation only if the user hasn't disabled it
        if (this.settings.showConfirmationDialog) {
            const confirmed = await this.showMergeConfirmation(sourceFile, targetFile);
            if (!confirmed) {
                new Notice('Merge cancelled.');
                return;
            }
        }

        const alias = sourceFile.basename;
        const mainName = targetFile.basename;

        try {
            // 1. Add alias to target note
            await this.app.fileManager.processFrontMatter(targetFile, (fm: Record<string, unknown>) => {
                if (!fm.aliases) fm.aliases = [];
                if (!(fm.aliases as string[]).includes(alias)) (fm.aliases as string[]).push(alias);
            });

            // 2. Merge frontmatter
            await this.mergeFrontmatter(targetFile, sourceFile);

            // 3. Merge content
            await this.mergeContent(targetFile, sourceFile);

            // 4. Update all internal links
            await this.updateAllLinks(sourceFile, targetFile);

            // 5. Delete source file
            await this.app.fileManager.trashFile(sourceFile);

            // 6. Open the target note
            await this.app.workspace.getLeaf(false).openFile(targetFile);

            new Notice(`Successfully merged "${alias}" as alias into "${mainName}"`, 5000);
        } catch (err) {
            console.error('Merge error:', err);
            new Notice('Merge failed — check console (Ctrl+Shift+I)');
        }
    }

    /**
     * Shows a confirmation dialog similar to Obsidian's core merge dialog
     */
    private showMergeConfirmation(sourceFile: TFile, targetFile: TFile): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new MergeConfirmationModal(this.app, sourceFile, targetFile, resolve, this);
            modal.open();
        });
    }

    async chooseNoteModal(): Promise<TFile | null> {
        return new Promise((resolve) => {
            const modal = new ReliableNoteSelectorModal(this.app, (selected: TFile | null) => {
                resolve(selected);
            });
            modal.open();
        });
    }

    // ... keep the rest of your methods unchanged (mergeFrontmatter, mergeContent, updateAllLinks, loadSettings, saveSettings, onunload) ...

    async mergeFrontmatter(targetFile: TFile, sourceFile: TFile) {
        const sourceCache = this.app.metadataCache.getFileCache(sourceFile);
        const sourceFm = (sourceCache?.frontmatter || {}) as Record<string, unknown>;

        await this.app.fileManager.processFrontMatter(targetFile, (targetFm: Record<string, unknown>) => {
            for (const key in sourceFm) {
                if (key === 'position') continue;

                const sourceValue = sourceFm[key];
                const targetValue = targetFm[key];

                if (Array.isArray(sourceValue)) {
                    if (this.settings.mergeListFields) {
                        if (!targetFm[key]) targetFm[key] = [];
                        const existing = (targetFm[key] as unknown[]) || [];
                        const combined = [...new Set([...existing, ...(sourceValue as unknown[])])];
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

        sourceContent = sourceContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();

        let separator = '\n\n';

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
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as MergeAsAliasSettings;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
    }
}

/**
 * Confirmation Modal with "Don't ask again" functionality
 */
class MergeConfirmationModal extends Modal {
    private sourceFile: TFile;
    private targetFile: TFile;
    private resolve: (confirmed: boolean) => void;
    private plugin: MergeAsAliasPlugin;

    constructor(app: App, sourceFile: TFile, targetFile: TFile, resolve: (confirmed: boolean) => void, plugin: MergeAsAliasPlugin) {
        super(app);
        this.sourceFile = sourceFile;
        this.targetFile = targetFile;
        this.resolve = resolve;
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Confirm file merge' });

        contentEl.createEl('p', {
            text: `Are you sure you want to merge "${this.sourceFile.basename}" into "${this.targetFile.basename}"? "${this.sourceFile.basename}" will be deleted.`
        });

        // Checkbox
        const checkboxContainer = contentEl.createDiv({ cls: 'setting-item' });
        const checkbox = checkboxContainer.createEl('input', { type: 'checkbox' });
        const label = checkboxContainer.createEl('label', { text: " Don't ask again" });
        label.prepend(checkbox);

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const mergeButton = buttonContainer.createEl('button', { text: 'Merge', cls: 'mod-warning' });
        mergeButton.addEventListener('click', () => {
            void (async () => {
                if (checkbox.checked) {
                    this.plugin.settings.showConfirmationDialog = false;
                    await this.plugin.saveSettings();
                }
                this.resolve(true);
                this.close();
            })();
        });

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => {
            this.resolve(false);
            this.close();
        });
    }

    onClose() {
        this.resolve(false);
    }
}

// Keep the rest of your existing classes unchanged
class ReliableNoteSelectorModal extends FuzzySuggestModal<TFile> {
    private callback: (file: TFile | null) => void;

    constructor(app: App, callback: (file: TFile | null) => void) {
        super(app);
        this.callback = callback;
        this.setPlaceholder("Choose the note to merge this file into...");
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
        setTimeout(() => this.callback(null), 50);
    }
}

class MergeAsAliasSettingTab extends PluginSettingTab {
    plugin: MergeAsAliasPlugin;

    constructor(app: App, plugin: MergeAsAliasPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

        display(): void {
        const { containerEl } = this;
        containerEl.empty();

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
            .setDesc('When both notes have the same text field (such as description or summary), combine them.')
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

        // New option - matching Obsidian core style
        new Setting(containerEl)
            .setName('Confirm file merge')
            .setDesc('Prompt before merge two files.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showConfirmationDialog)
                .onChange(async (value) => {
                    this.plugin.settings.showConfirmationDialog = value;
                    await this.plugin.saveSettings();
                }));
    }
}