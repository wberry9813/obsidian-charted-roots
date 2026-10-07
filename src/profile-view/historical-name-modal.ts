import { Modal, Notice, Setting, TFile } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import type { CreateAssertionData } from '../v2/assertion-service';
import { getCanonicalLinktext } from '../utils/wikilink-resolver';

export interface HistoricalNameInput {
	name: string;
	timeStart?: string;
	timeEnd?: string;
	source?: string;
	notes?: string;
}

export function buildHistoricalNameAssertionData(
	subject: string,
	entityName: string,
	input: HistoricalNameInput
): CreateAssertionData {
	const name = input.name.trim();
	const source = input.source?.trim();
	return {
		assertionType: 'designation',
		subject,
		predicate: 'has_designation',
		value: name,
		timeStart: input.timeStart?.trim() || undefined,
		timeEnd: input.timeEnd?.trim() || undefined,
		notes: input.notes?.trim() || undefined,
		qualifiers: {
			designation_type: 'historical_name',
			...(source ? { source } : {})
		},
		title: `${entityName} — ${name}`
	};
}

function placeSubjectLink(
	plugin: CanvasRootsPlugin,
	file: TFile,
	entityName: string
): string {
	const target = getCanonicalLinktext(plugin.app, file);
	return target === entityName
		? `[[${target}]]`
		: `[[${target}|${entityName}]]`;
}

export class HistoricalNameModal extends Modal {
	private name = '';
	private timeStart = '';
	private timeEnd = '';
	private source = '';
	private notes = '';

	constructor(
		private readonly plugin: CanvasRootsPlugin,
		private readonly entityFile: TFile,
		private readonly entityName: string,
		private readonly onCreated?: (file: TFile) => void | Promise<void>
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.titleEl.setText(`Add historical name — ${this.entityName}`);
		this.contentEl.addClass('cr-historical-name-modal');

		new Setting(this.contentEl)
			.setName('Historical name')
			.setDesc('Name used for this same Place during the historical interval.')
			.addText(text => {
				text.setPlaceholder('长安');
				text.onChange(value => { this.name = value; });
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		new Setting(this.contentEl)
			.setName('Start')
			.setDesc('Historical date expression, e.g. BCE 202 or 建安十三年.')
			.addText(text => text
				.setPlaceholder('BCE 202')
				.onChange(value => { this.timeStart = value; }));

		new Setting(this.contentEl)
			.setName('End')
			.setDesc('Optional end expression. One of Start or End is required.')
			.addText(text => text
				.setPlaceholder('904 CE')
				.onChange(value => { this.timeEnd = value; }));

		new Setting(this.contentEl)
			.setName('Source reference')
			.setDesc('Optional source citation/reference. Wikilinks are accepted.')
			.addText(text => text
				.setPlaceholder('[[Sources/Book of Han]]')
				.onChange(value => { this.source = value; }));

		new Setting(this.contentEl)
			.setName('Notes')
			.addTextArea(text => text
				.setPlaceholder('Optional research note')
				.onChange(value => { this.notes = value; }));

		const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = buttons.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.close());

		const create = buttons.createEl('button', {
			text: 'Add historical name',
			cls: 'mod-cta'
		});
		create.addEventListener('click', () => {
			void this.createHistoricalName();
		});
	}

	private async createHistoricalName(): Promise<void> {
		const name = this.name.trim();
		const timeStart = this.timeStart.trim();
		const timeEnd = this.timeEnd.trim();
		if (!name) {
			new Notice('Enter a historical name.');
			return;
		}
		if (!timeStart && !timeEnd) {
			new Notice('Enter at least a start or end date.');
			return;
		}

		const dateService = this.plugin.getHistoricalDateService();
		for (const [label, expression] of [
			['Start', timeStart],
			['End', timeEnd]
		] as const) {
			if (!expression) continue;
			const parsed = dateService.parse(expression);
			if (parsed.status === 'unresolved') {
				new Notice(
					`${label} date could not be resolved: ${expression}`
				);
				return;
			}
		}

		const subject = placeSubjectLink(
			this.plugin,
			this.entityFile,
			this.entityName
		);
		const file = await this.plugin.getAssertionService().createAssertion(
			buildHistoricalNameAssertionData(subject, this.entityName, {
				name,
				timeStart,
				timeEnd,
				source: this.source,
				notes: this.notes
			})
		);

		await this.onCreated?.(file);
		new Notice(`Historical name added: ${name}`);
		this.close();
	}
}
