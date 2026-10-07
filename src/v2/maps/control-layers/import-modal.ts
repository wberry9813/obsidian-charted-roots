import {
	Modal,
	Notice,
	Setting,
	normalizePath,
	type App
} from 'obsidian';
import type CanvasRootsPlugin from '../../../../main';
import type { TemporalCertainty } from '../../types';
import type { GeographicCRS } from '../coordinates';
import {
	HistoricalControlLayerWriter,
	parseHistoricalControlFeatureCollection
} from './index';

export class HistoricalControlLayerImportModal extends Modal {
	private label = '';
	private sourceCRS: GeographicCRS = 'wgs84';
	private rawGeoJson = '';
	private universe = '';
	private source = '';
	private confidence = '';
	private uncertainty: TemporalCertainty | '' = '';
	private timeStart = '';
	private timeEnd = '';
	private timeNotBefore = '';
	private timeNotAfter = '';
	private geoJsonArea: HTMLTextAreaElement | null = null;
	private statusEl: HTMLElement | null = null;
	private importing = false;

	constructor(
		app: App,
		private readonly plugin: CanvasRootsPlugin
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-control-layer-import-modal');
		contentEl.createEl('h2', { text: 'Import historical control layer' });

		const workspace = this.plugin.getWorkspaceService()?.getActive();
		const targetFolder = workspace
			? normalizePath(`${workspace.rootFolder}/Layers`)
			: null;

		contentEl.createDiv({
			cls: 'setting-item-description',
			text: workspace
				? `Target: ${workspace.name} · ${targetFolder}`
				: 'An Active Workspace is required before importing a historical control layer.'
		});

		new Setting(contentEl)
			.setName('Layer name')
			.setDesc('Stable user-facing name for the control-layer manifest.')
			.addText(text => {
				text.inputEl.addClass('cr-control-layer-import__name');
				text.onChange(value => {
					this.label = value;
				});
			});

		new Setting(contentEl)
			.setName('Source coordinate system')
			.setDesc('Datum used by the imported GeoJSON. Stored geometry is always normalized to WGS84.')
			.addDropdown(dropdown => {
				dropdown.selectEl.addClass('cr-control-layer-import__crs');
				dropdown
					.addOption('wgs84', 'WGS84')
					.addOption('gcj02', 'GCJ-02')
					.addOption('bd09', 'BD-09')
					.setValue(this.sourceCRS)
					.onChange(value => {
						this.sourceCRS = value as GeographicCRS;
						this.updateStatus();
					});
			});

		const fileInput = contentEl.createEl('input', {
			type: 'file',
			cls: 'cr-control-layer-import__file'
		});
		fileInput.accept = '.geojson,application/geo+json,application/json';
		fileInput.style.display = 'none';
		fileInput.addEventListener('change', () => {
			const file = fileInput.files?.[0];
			if (!file) return;
			void file.text().then(raw => {
				this.rawGeoJson = raw;
				if (this.geoJsonArea) this.geoJsonArea.value = raw;
				if (!this.label.trim()) {
					this.label = file.name.replace(/\.geojson$/i, '');
					const input = contentEl.querySelector(
						'.cr-control-layer-import__name'
					);
					if (input instanceof HTMLInputElement) {
						input.value = this.label;
					}
				}
				this.updateStatus();
			}).catch(error => {
				new Notice(
					`Could not read GeoJSON file: ${error instanceof Error ? error.message : String(error)}`
				);
			});
		});

		new Setting(contentEl)
			.setName('GeoJSON file')
			.setDesc('Choose a .geojson file or paste a FeatureCollection below.')
			.addButton(button => button
				.setButtonText('Choose file')
				.onClick(() => fileInput.click()));

		new Setting(contentEl)
			.setName('GeoJSON')
			.addTextArea(area => {
				area.setPlaceholder('{"type":"FeatureCollection","features":[...]}');
				area.inputEl.addClass('cr-control-layer-import__geojson');
				area.inputEl.rows = 10;
				area.inputEl.style.width = '100%';
				this.geoJsonArea = area.inputEl;
				area.onChange(value => {
					this.rawGeoJson = value;
				});
			});

		const temporal = contentEl.createEl('details', {
			cls: 'cr-control-layer-import__metadata'
		});
		temporal.createEl('summary', { text: 'Time and provenance (optional)' });
		const temporalContent = temporal.createDiv({
			cls: 'cr-control-layer-import__metadata-content'
		});

		this.addTextSetting(temporalContent, 'Universe', 'e.g. History', value => {
			this.universe = value;
		});
		this.addTextSetting(temporalContent, 'Source', 'Wikilink or citation text', value => {
			this.source = value;
		});
		this.addTextSetting(temporalContent, 'Time start', 'e.g. BCE 202', value => {
			this.timeStart = value;
		}, 'cr-control-layer-import__time-start');
		this.addTextSetting(temporalContent, 'Time end', 'e.g. 220 CE', value => {
			this.timeEnd = value;
		}, 'cr-control-layer-import__time-end');
		this.addTextSetting(temporalContent, 'Not before', '', value => {
			this.timeNotBefore = value;
		});
		this.addTextSetting(temporalContent, 'Not after', '', value => {
			this.timeNotAfter = value;
		});
		this.addTextSetting(temporalContent, 'Confidence', 'e.g. high', value => {
			this.confidence = value;
		});

		new Setting(temporalContent)
			.setName('Uncertainty')
			.addDropdown(dropdown => {
				dropdown
					.addOption('', 'Not specified')
					.addOption('certain', 'Certain')
					.addOption('approximate', 'Approximate')
					.addOption('inferred', 'Inferred')
					.addOption('uncertain', 'Uncertain')
					.addOption('disputed', 'Disputed')
					.addOption('unknown', 'Unknown')
					.setValue(this.uncertainty)
					.onChange(value => {
						this.uncertainty = value as TemporalCertainty | '';
					});
			});

		this.statusEl = contentEl.createDiv({
			cls: 'cr-control-layer-import__status setting-item-description'
		});
		this.updateStatus();

		const actions = contentEl.createDiv({
			cls: 'cr-control-layer-import__actions'
		});
		const cancel = actions.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.close());

		const validate = actions.createEl('button', { text: 'Validate' });
		validate.addEventListener('click', () => this.updateStatus(true));

		const submit = actions.createEl('button', {
			text: 'Import layer',
			cls: 'mod-cta cr-control-layer-import__submit'
		});
		submit.disabled = !targetFolder;
		submit.addEventListener('click', () => {
			if (!targetFolder || this.importing) return;
			void this.importLayer(targetFolder, submit);
		});
	}

	private addTextSetting(
		container: HTMLElement,
		name: string,
		placeholder: string,
		onChange: (value: string) => void,
		className?: string
	): void {
		new Setting(container)
			.setName(name)
			.addText(text => {
				if (placeholder) text.setPlaceholder(placeholder);
				if (className) text.inputEl.addClass(className);
				text.onChange(onChange);
			});
	}

	private updateStatus(showNotice = false): void {
		if (!this.statusEl) return;
		const raw = this.rawGeoJson.trim();
		if (!raw) {
			this.statusEl.setText('Paste or choose a GeoJSON FeatureCollection.');
			this.statusEl.removeClass('is-success', 'is-error');
			return;
		}
		try {
			const collection = parseHistoricalControlFeatureCollection(raw);
			this.statusEl.setText(
				`Valid FeatureCollection · ${collection.features.length} feature${collection.features.length === 1 ? '' : 's'} · source ${this.sourceCRS.toUpperCase()} → stored WGS84`
			);
			this.statusEl.removeClass('is-error');
			this.statusEl.addClass('is-success');
			if (showNotice) new Notice('GeoJSON is valid.');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.statusEl.setText(message);
			this.statusEl.removeClass('is-success');
			this.statusEl.addClass('is-error');
			if (showNotice) new Notice(message);
		}
	}

	private async importLayer(
		targetFolder: string,
		submit: HTMLButtonElement
	): Promise<void> {
		const label = this.label.trim();
		if (!label) {
			new Notice('Layer name is required.');
			return;
		}

		let featureCollection;
		try {
			featureCollection = parseHistoricalControlFeatureCollection(
				this.rawGeoJson.trim()
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
			this.updateStatus();
			return;
		}

		this.importing = true;
		submit.disabled = true;
		submit.setText('Importing…');

		try {
			const result = await new HistoricalControlLayerWriter(this.app).create(
				{
					label,
					sourceCRS: this.sourceCRS,
					featureCollection,
					universe: this.universe.trim() || undefined,
					source: this.source.trim() || undefined,
					confidence: this.confidence.trim() || undefined,
					uncertainty: this.uncertainty || undefined,
					time_start: this.timeStart.trim() || undefined,
					time_end: this.timeEnd.trim() || undefined,
					time_not_before: this.timeNotBefore.trim() || undefined,
					time_not_after: this.timeNotAfter.trim() || undefined
				},
				{ folder: targetFolder }
			);
			new Notice(
				`Imported historical control layer “${label}” as canonical WGS84.`
			);
			this.close();
			await this.app.workspace.getLeaf(false).openFile(result.manifestFile);
		} catch (error) {
			new Notice(
				`Could not import control layer: ${error instanceof Error ? error.message : String(error)}`
			);
			this.importing = false;
			submit.disabled = false;
			submit.setText('Import layer');
		}
	}
}
