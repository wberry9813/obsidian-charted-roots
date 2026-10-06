import { App, Modal, Notice } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type {
	FileMigrationPreview,
	MigrationPlan,
	MigrationPreview,
	MigrationPreviewAction
} from './types';

const STATUS_ORDER: Record<FileMigrationPreview['status'], number> = {
	blocked: 0,
	review: 1,
	ready: 2
};

function statusLabel(status: FileMigrationPreview['status']): string {
	switch (status) {
		case 'blocked': return 'Blocked';
		case 'review': return 'Review required';
		case 'ready': return 'Ready';
	}
}

function actionLabel(action: MigrationPreviewAction): string {
	switch (action.kind) {
		case 'create_assertions': return 'Create Assertions';
		case 'rewrite_frontmatter': return 'Rewrite frontmatter';
		case 'cleanup': return 'Cleanup';
		case 'review': return 'Manual review';
		case 'blocker': return 'Blocked';
		case 'info': return 'Info';
	}
}

function fileWord(count: number): string {
	return count === 1 ? 'file' : 'files';
}

/**
 * Schema v2 migration preview.
 *
 * The preview itself never mutates the vault. Ready files can proceed only
 * through a second explicit confirmation modal. Review/blocked files are never
 * passed to the executor.
 */
export class V2MigrationPreviewModal extends Modal {
	constructor(
		app: App,
		private readonly plugin: CanvasRootsPlugin
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-v2-migration-preview');

		contentEl.createEl('h2', {
			text: 'Schema v2 migration preview',
			cls: 'cr-v2-migration-preview__title'
		});

		contentEl.createEl('p', {
			text: 'Preview only. Nothing changes until you explicitly confirm migration of Ready files.',
			cls: 'cr-v2-migration-preview__notice'
		});

		const preview = this.plugin.buildV2MigrationPreview();
		this.renderSummary(contentEl, preview);
		this.renderFiles(contentEl, preview);

		const buttons = contentEl.createDiv({
			cls: 'modal-button-container cr-v2-migration-preview__buttons'
		});

		if (preview.readyFiles > 0) {
			const migrate = buttons.createEl('button', {
				text: `Migrate ${preview.readyFiles} ready ${fileWord(preview.readyFiles)}…`,
				cls: 'mod-cta cr-v2-migration-preview__migrate'
			});
			migrate.addEventListener('click', () => {
				this.close();
				new V2MigrationConfirmModal(this.app, this.plugin).open();
			});
		}

		const close = buttons.createEl('button', {
			text: 'Close',
			cls: 'cr-v2-migration-preview__close'
		});
		close.addEventListener('click', () => this.close());
	}

	private renderSummary(container: HTMLElement, preview: MigrationPreview): void {
		const summary = container.createDiv({ cls: 'cr-v2-migration-preview__summary' });

		const entries: Array<[string, number]> = [
			['Ready', preview.readyFiles],
			['Review required', preview.reviewFiles],
			['Blocked', preview.blockedFiles]
		];

		for (const [label, count] of entries) {
			const item = summary.createDiv({ cls: 'cr-v2-migration-preview__summary-item' });
			item.createEl('strong', { text: String(count) });
			item.createSpan({ text: ` ${label}` });
		}

		if (preview.files.length === 0) {
			container.createEl('p', {
				text: 'No legacy Schema v1 data was detected.',
				cls: 'cr-v2-migration-preview__empty'
			});
		}
	}

	private renderFiles(container: HTMLElement, preview: MigrationPreview): void {
		const files = [...preview.files].sort((a, b) => {
			const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
			return byStatus || a.filePath.localeCompare(b.filePath);
		});

		for (const file of files) {
			const card = container.createDiv({
				cls: `cr-v2-migration-preview__file cr-v2-migration-preview__file--${file.status}`
			});
			const header = card.createDiv({ cls: 'cr-v2-migration-preview__file-header' });
			header.createEl('strong', {
				text: file.filePath,
				cls: 'cr-v2-migration-preview__file-path'
			});
			header.createSpan({
				text: statusLabel(file.status),
				cls: 'cr-v2-migration-preview__status'
			});

			const list = card.createEl('ul', { cls: 'cr-v2-migration-preview__actions' });
			for (const action of file.actions) {
				const item = list.createEl('li', { cls: 'cr-v2-migration-preview__action' });
				item.createEl('strong', { text: `${actionLabel(action)}: ` });
				item.createSpan({ text: action.description });
				if (action.fields.length > 0) {
					item.createEl('small', {
						text: ` Fields: ${action.fields.join(', ')}`,
						cls: 'cr-v2-migration-preview__fields'
					});
				}
			}
		}
	}
}

/**
 * Second-step confirmation for the ready subset only.
 *
 * The plan is frozen when this modal opens; the executor revalidates its
 * fingerprints against live Markdown immediately before mutation.
 */
export class V2MigrationConfirmModal extends Modal {
	private plan: MigrationPlan | null = null;

	constructor(
		app: App,
		private readonly plugin: CanvasRootsPlugin
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-v2-migration-confirm');

		this.plan = this.plugin.buildV2MigrationPlan();

		contentEl.createEl('h2', {
			text: 'Confirm Schema v2 migration',
			cls: 'cr-v2-migration-confirm__title'
		});

		const ready = this.plan.executableFiles;
		const unresolved = this.plan.reviewFiles + this.plan.blockedFiles;

		contentEl.createEl('p', {
			text: `This will migrate ${ready} Ready ${fileWord(ready)}. ${unresolved} Review/Blocked ${fileWord(unresolved)} will remain unchanged.`,
			cls: 'cr-v2-migration-confirm__summary'
		});

		contentEl.createEl('p', {
			text: 'Exact source Markdown is backed up before any mutation. If a source changed after this plan was created, execution stops instead of using stale data.',
			cls: 'cr-v2-migration-confirm__safety'
		});

		contentEl.createEl('p', {
			text: 'Backups and the migration manifest are stored under .charted-roots/migration/.',
			cls: 'cr-v2-migration-confirm__backup'
		});

		const status = contentEl.createDiv({
			cls: 'cr-v2-migration-confirm__status'
		});

		const buttons = contentEl.createDiv({
			cls: 'modal-button-container cr-v2-migration-confirm__buttons'
		});

		const cancel = buttons.createEl('button', {
			text: 'Cancel',
			cls: 'cr-v2-migration-confirm__cancel'
		});
		cancel.addEventListener('click', () => this.close());

		const execute = buttons.createEl('button', {
			text: `Migrate ${ready} ready ${fileWord(ready)}`,
			cls: 'mod-cta cr-v2-migration-confirm__execute'
		});
		execute.disabled = ready === 0;

		execute.addEventListener('click', () => {
			void this.executePlan(execute, cancel, status);
		});
	}

	private async executePlan(
		execute: HTMLButtonElement,
		cancel: HTMLButtonElement,
		status: HTMLElement
	): Promise<void> {
		const plan = this.plan;
		if (!plan || plan.executableFiles === 0) return;

		execute.disabled = true;
		cancel.disabled = true;
		status.setText('Migrating Ready files…');

		const result = await this.plugin.executeV2MigrationReady(plan);

		if (!result.success) {
			const message = result.errors.map(error =>
				error.filePath ? `${error.filePath}: ${error.message}` : error.message
			).join(' ');
			status.setText(`Migration stopped: ${message || 'Unknown error.'}`);
			execute.disabled = false;
			cancel.disabled = false;
			new Notice('Schema v2 migration stopped. No unsafe partial migration was kept.');
			return;
		}

		const backup = result.backupDirectory
			? ` Backup: ${result.backupDirectory}`
			: '';
		new Notice(
			`Migrated ${result.filesMigrated} ready ${fileWord(result.filesMigrated)} and created ${result.assertionsCreated} Assertions.${backup}`,
			8000
		);

		this.close();

		// Re-analyze the vault after successful execution so the user
		// immediately sees what still needs review.
		new V2MigrationPreviewModal(this.app, this.plugin).open();
	}
}
