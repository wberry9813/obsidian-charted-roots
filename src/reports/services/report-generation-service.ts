/**
 * Report Generation Service
 *
 * Main orchestration service for generating genealogy reports.
 * Coordinates between specific report generators and handles output.
 */

import { App, TFolder, normalizePath } from 'obsidian';
import type { CanvasRootsSettings } from '../../settings';
import type {
	ReportType,
	ReportResult,
	FamilyGroupSheetOptions,
	IndividualSummaryOptions,
	AhnentafelOptions,
	GapsReportOptions,
	RegisterReportOptions,
	PedigreeChartOptions,
	DescendantChartOptions,
	SourceSummaryOptions,
	SourcesByRoleOptions,
	TimelineReportOptions,
	PlaceSummaryOptions,
	MediaInventoryOptions,
	UniverseOverviewOptions,
	CollectionOverviewOptions,
	ResearchReportExportOptions,
	BrickWallReportOptions,
	UnconnectedPeopleOptions,
	KinshipReportOptions
} from '../types/report-types';
import { FamilyGroupSheetGenerator } from './family-group-sheet-generator';
import { IndividualSummaryGenerator } from './individual-summary-generator';
import { AhnentafelGenerator } from './ahnentafel-generator';
import { GapsReportGenerator } from './gaps-report-generator';
import { RegisterReportGenerator } from './register-report-generator';
import { PedigreeChartGenerator } from './pedigree-chart-generator';
import { DescendantChartGenerator } from './descendant-chart-generator';
import { SourceSummaryGenerator } from './source-summary-generator';
import { SourcesByRoleGenerator } from './sources-by-role-generator';
import { TimelineGenerator } from './timeline-generator';
import { WorkspaceTimelineGenerator } from './workspace-timeline-generator';
import { PlaceSummaryGenerator } from './place-summary-generator';
import { MediaInventoryGenerator } from './media-inventory-generator';
import { UniverseOverviewGenerator } from './universe-overview-generator';
import { CollectionOverviewGenerator } from './collection-overview-generator';
import { ResearchReportExportGenerator } from './research-report-export-generator';
import { BrickWallReportGenerator } from './brick-wall-report-generator';
import { UnconnectedPeopleGenerator } from './unconnected-people-generator';
import { KinshipReportGenerator } from './kinship-report-generator';
import { SourceService } from '../../sources/services/source-service';
import {
	createReportScopedSettings,
	type ReportGenerationContext
} from './report-context';
import { getLogger } from '../../core/logging';

const logger = getLogger('ReportGenerationService');

function pathIsInsideRoot(path: string, root: string): boolean {
	const normalizedPath = normalizePath(path).replace(/^\/+|\/+$/g, '');
	const normalizedRoot = normalizePath(root).replace(/^\/+|\/+$/g, '');
	if (!normalizedPath || !normalizedRoot) return false;
	return normalizedPath === normalizedRoot
		|| normalizedPath.startsWith(`${normalizedRoot}/`);
}

/**
 * Service for generating and outputting genealogy reports.
 *
 * The optional context is runtime-only and is used by Multi-Workspace to
 * constrain discovery and output without mutating persisted legacy settings.
 */
export class ReportGenerationService {
	private app: App;
	private settings: CanvasRootsSettings;

	// Specific generators
	private familyGroupSheetGenerator: FamilyGroupSheetGenerator;
	private individualSummaryGenerator: IndividualSummaryGenerator;
	private ahnentafelGenerator: AhnentafelGenerator;
	private gapsReportGenerator: GapsReportGenerator;
	private registerReportGenerator: RegisterReportGenerator;
	private pedigreeChartGenerator: PedigreeChartGenerator;
	private descendantChartGenerator: DescendantChartGenerator;
	private sourceSummaryGenerator: SourceSummaryGenerator;
	private sourcesByRoleGenerator: SourcesByRoleGenerator;
	private timelineGenerator: TimelineGenerator;
	private placeSummaryGenerator: PlaceSummaryGenerator;
	private mediaInventoryGenerator: MediaInventoryGenerator;
	private universeOverviewGenerator: UniverseOverviewGenerator;
	private collectionOverviewGenerator: CollectionOverviewGenerator;
	private researchReportExportGenerator: ResearchReportExportGenerator;
	private brickWallReportGenerator: BrickWallReportGenerator;
	private unconnectedPeopleGenerator: UnconnectedPeopleGenerator;
	private kinshipReportGenerator: KinshipReportGenerator;

	constructor(
		app: App,
		settings: CanvasRootsSettings,
		private readonly context: ReportGenerationContext = {}
	) {
		this.app = app;
		this.settings = createReportScopedSettings(settings, context);

		// Initialize generators. Folder-aware legacy generators receive an
		// ephemeral settings view whose paths point into the active Workspace.
		this.familyGroupSheetGenerator = new FamilyGroupSheetGenerator(app, this.settings);
		this.individualSummaryGenerator = new IndividualSummaryGenerator(app, this.settings);
		this.ahnentafelGenerator = new AhnentafelGenerator(app, this.settings);
		this.gapsReportGenerator = new GapsReportGenerator(app, this.settings);
		this.registerReportGenerator = new RegisterReportGenerator(app, this.settings);
		this.pedigreeChartGenerator = new PedigreeChartGenerator(app, this.settings);
		this.descendantChartGenerator = new DescendantChartGenerator(app, this.settings);
		this.sourceSummaryGenerator = new SourceSummaryGenerator(
			app,
			this.settings,
			new SourceService(app, this.settings, {
				fileProvider: context.fileProvider,
				defaultFolderProvider: () =>
					context.folderProvider?.('sources') ?? this.settings.sourcesFolder
			})
		);
		this.sourcesByRoleGenerator = new SourcesByRoleGenerator(app, this.settings);
		this.timelineGenerator = new WorkspaceTimelineGenerator(app, this.settings, context);
		this.placeSummaryGenerator = new PlaceSummaryGenerator(app, this.settings);
		this.mediaInventoryGenerator = new MediaInventoryGenerator(app, this.settings);
		this.universeOverviewGenerator = new UniverseOverviewGenerator(app, this.settings);
		this.collectionOverviewGenerator = new CollectionOverviewGenerator(app, this.settings);
		this.researchReportExportGenerator = new ResearchReportExportGenerator(app, this.settings);
		this.brickWallReportGenerator = new BrickWallReportGenerator(app, this.settings);
		this.unconnectedPeopleGenerator = new UnconnectedPeopleGenerator(app, this.settings);
		this.kinshipReportGenerator = new KinshipReportGenerator(app, this.settings);
	}

	async generateReport(
		type: ReportType,
		options: FamilyGroupSheetOptions | IndividualSummaryOptions | AhnentafelOptions | GapsReportOptions | RegisterReportOptions | PedigreeChartOptions | DescendantChartOptions | SourceSummaryOptions | SourcesByRoleOptions | TimelineReportOptions | PlaceSummaryOptions | MediaInventoryOptions | UniverseOverviewOptions | CollectionOverviewOptions | ResearchReportExportOptions | BrickWallReportOptions | UnconnectedPeopleOptions | KinshipReportOptions
	): Promise<ReportResult> {
		logger.info('generate', `Generating ${type} report`);

		let result: ReportResult;
		switch (type) {
			case 'family-group-sheet': result = await this.familyGroupSheetGenerator.generate(options as FamilyGroupSheetOptions); break;
			case 'individual-summary': result = await this.individualSummaryGenerator.generate(options as IndividualSummaryOptions); break;
			case 'ahnentafel': result = await this.ahnentafelGenerator.generate(options as AhnentafelOptions); break;
			case 'gaps-report': result = await this.gapsReportGenerator.generate(options as GapsReportOptions); break;
			case 'register-report': result = await this.registerReportGenerator.generate(options as RegisterReportOptions); break;
			case 'pedigree-chart': result = await this.pedigreeChartGenerator.generate(options as PedigreeChartOptions); break;
			case 'descendant-chart': result = await this.descendantChartGenerator.generate(options as DescendantChartOptions); break;
			case 'source-summary': result = await this.sourceSummaryGenerator.generate(options as SourceSummaryOptions); break;
			case 'sources-by-role': result = await this.sourcesByRoleGenerator.generate(options as SourcesByRoleOptions); break;
			case 'timeline-report': result = await this.timelineGenerator.generate(options as TimelineReportOptions); break;
			case 'place-summary': result = await this.placeSummaryGenerator.generate(options as PlaceSummaryOptions); break;
			case 'media-inventory': result = await this.mediaInventoryGenerator.generate(options as MediaInventoryOptions); break;
			case 'universe-overview': result = await this.universeOverviewGenerator.generate(options as UniverseOverviewOptions); break;
			case 'collection-overview': result = await this.collectionOverviewGenerator.generate(options as CollectionOverviewOptions); break;
			case 'research-report-export': result = await this.researchReportExportGenerator.generate(options as ResearchReportExportOptions); break;
			case 'brick-wall-report': result = await this.brickWallReportGenerator.generate(options as BrickWallReportOptions); break;
			case 'unconnected-people': result = await this.unconnectedPeopleGenerator.generate(options as UnconnectedPeopleOptions); break;
			case 'kinship-report': result = await this.kinshipReportGenerator.generate(options as KinshipReportOptions); break;
			default:
				return {
					success: false,
					content: '',
					suggestedFilename: 'report.md',
					stats: { peopleCount: 0, eventsCount: 0, sourcesCount: 0 },
					error: `Unknown report type: ${type}`,
					warnings: []
				};
		}

		if (result.success && options.outputMethod === 'vault') {
			await this.saveToVault(
				result.content,
				options.filename ?? result.suggestedFilename,
				options.outputFolder
			);
		}
		return result;
	}

	async saveToVault(content: string, filename: string, folder?: string): Promise<string> {
		const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`;
		const selectedFolder = normalizePath(
			folder?.trim()
				|| this.context.folderProvider?.('reports')
				|| this.settings.reportsFolder
				|| ''
		);

		const workspaceRoot = this.context.workspaceRootProvider?.();
		if (workspaceRoot && !pathIsInsideRoot(selectedFolder, workspaceRoot)) {
			throw new Error(`Report output folder must stay inside the active Workspace: ${workspaceRoot}`);
		}

		if (selectedFolder) await this.ensureFolderExists(selectedFolder);
		let outputPath = selectedFolder
			? normalizePath(`${selectedFolder}/${normalizedFilename}`)
			: normalizePath(normalizedFilename);

		if (this.app.vault.getAbstractFileByPath(outputPath)) {
			const baseName = normalizedFilename.replace(/\.md$/, '');
			let counter = 1;
			while (this.app.vault.getAbstractFileByPath(
				selectedFolder
					? normalizePath(`${selectedFolder}/${baseName}-${counter}.md`)
					: normalizePath(`${baseName}-${counter}.md`)
			)) counter++;
			outputPath = selectedFolder
				? normalizePath(`${selectedFolder}/${baseName}-${counter}.md`)
				: normalizePath(`${baseName}-${counter}.md`);
		}

		await this.app.vault.create(outputPath, content);
		logger.info('save', `Report saved to ${outputPath}`);
		return outputPath;
	}

	downloadReport(content: string, filename: string): void {
		const normalizedFilename = filename.endsWith('.md') ? filename : `${filename}.md`;
		const blob = new Blob([content], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = activeDocument.createElement('a');
		a.href = url;
		a.download = normalizedFilename;
		activeDocument.body.appendChild(a);
		a.click();
		activeDocument.body.removeChild(a);
		URL.revokeObjectURL(url);
		logger.info('download', `Report downloaded as ${normalizedFilename}`);
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		const normalizedPath = normalizePath(folderPath);
		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (existing) {
			if (!(existing instanceof TFolder)) throw new Error(`Path exists but is not a folder: ${normalizedPath}`);
			return;
		}
		let current = '';
		for (const segment of normalizedPath.split('/').filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			const item = this.app.vault.getAbstractFileByPath(current);
			if (!item) await this.app.vault.createFolder(current);
			else if (!(item instanceof TFolder)) throw new Error(`Path exists but is not a folder: ${current}`);
		}
	}

	getAvailableFolders(): string[] {
		const workspaceRoot = this.context.workspaceRootProvider?.();
		if (workspaceRoot) {
			const normalizedRoot = normalizePath(workspaceRoot);
			const root = this.app.vault.getAbstractFileByPath(normalizedRoot);
			if (!(root instanceof TFolder)) {
				return [this.context.folderProvider?.('reports') ?? normalizedRoot].filter(Boolean);
			}
			const folders: string[] = [normalizedRoot];
			const collect = (folder: TFolder): void => {
				for (const child of folder.children) {
					if (child instanceof TFolder) {
						folders.push(child.path);
						collect(child);
					}
				}
			};
			collect(root);
			return folders.sort();
		}

		const folders: string[] = [''];
		const collect = (folder: TFolder, prefix = ''): void => {
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					const path = prefix ? `${prefix}/${child.name}` : child.name;
					folders.push(path);
					collect(child, path);
				}
			}
		};
		collect(this.app.vault.getRoot());
		return folders.sort();
	}

	async exportTimelineToCanvas(options: TimelineReportOptions): Promise<{ success: boolean; path?: string; error?: string; warnings?: string[] }> {
		return this.timelineGenerator.exportToCanvas(options);
	}

	async exportTimelineToExcalidraw(options: TimelineReportOptions): Promise<{ success: boolean; path?: string; error?: string; warnings?: string[] }> {
		return this.timelineGenerator.exportToExcalidraw(options);
	}
}

export function createReportGenerationService(
	app: App,
	settings: CanvasRootsSettings,
	context: ReportGenerationContext = {}
): ReportGenerationService {
	return new ReportGenerationService(app, settings, context);
}
