import { App, Modal } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type {
	FileMigrationPreview,
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

/**
 * Read-only Schema v2 migration preview.
 *
 * This modal intentionally contains no execute/migrate action. It presents a
 * frozen analyzer snapshot so users can understand what is safe, ambiguous or
 * blocked before destructive migration is implemented/enabled.
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
			text: 'Read-only preview. No vault files will be modified.',
			cls: 'cr-v2-migration-preview__notice'
		});

		const preview = this.plugin.buildV2MigrationPreview();
		this.renderSummary(contentEl, preview);
		this.renderFiles(contentEl, preview);

		const buttons = contentEl.createDiv({
			cls: 'modal-button-container cr-v2-migration-preview__buttons'
		});
		const close = buttons.createEl('button', {
			text: 'Close',
			cls: 'mod-cta cr-v2-migration-preview__close'
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
