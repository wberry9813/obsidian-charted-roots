import type { App, TFile } from 'obsidian';
import type { CanvasRootsSettings } from '../../settings';
import { FamilyGraphService, createConfiguredFamilyGraph } from '../../core/family-graph';
import { EventService } from '../../events/services/event-service';
import { SourceService } from '../../sources/services/source-service';
import { EvidenceService } from '../../sources/services/evidence-service';
import { PlaceGraphService } from '../../core/place-graph';
import { FolderFilterService } from '../../core/folder-filter';

/**
 * Shared data boundary for all report generators.
 *
 * Report code deliberately knows nothing about WorkspaceService itself. The UI
 * or plugin entry point supplies dynamic providers, allowing the same report
 * objects to follow Active Workspace switches without being reconstructed.
 */
export interface ReportGenerationScope {
	markdownFileProvider?: () => TFile[];
	allFileProvider?: () => TFile[];
	scopeKeyProvider?: () => string | null;
	workspaceRootProvider?: () => string;
	reportsFolderProvider?: () => string;
}

export function createReportFamilyGraph(
	app: App,
	settings: CanvasRootsSettings,
	scope: ReportGenerationScope = {}
): FamilyGraphService {
	return createConfiguredFamilyGraph(
		app,
		settings,
		scope.markdownFileProvider,
		scope.scopeKeyProvider
	);
}

export function createReportEventService(
	app: App,
	settings: CanvasRootsSettings,
	scope: ReportGenerationScope = {}
): EventService {
	return new EventService(app, settings, {
		fileProvider: scope.markdownFileProvider
	});
}

export function createReportSourceService(
	app: App,
	settings: CanvasRootsSettings,
	scope: ReportGenerationScope = {}
): SourceService {
	return new SourceService(app, settings, {
		fileProvider: scope.markdownFileProvider
	});
}

export function createReportEvidenceService(
	app: App,
	settings: CanvasRootsSettings,
	sourceService: SourceService,
	scope: ReportGenerationScope = {}
): EvidenceService {
	return new EvidenceService(app, settings, sourceService, {
		fileProvider: scope.markdownFileProvider
	});
}

export function createReportPlaceGraph(
	app: App,
	settings: CanvasRootsSettings,
	scope: ReportGenerationScope = {}
): PlaceGraphService {
	const graph = new PlaceGraphService(app);
	graph.setSettings(settings);
	graph.setValueAliases(settings.valueAliases);
	if (scope.markdownFileProvider) {
		graph.setFileProvider(scope.markdownFileProvider, scope.scopeKeyProvider);
	}
	if (settings.folderFilterMode !== 'disabled') {
		graph.setFolderFilter(new FolderFilterService(settings));
	}
	graph.ensureCacheLoaded();
	return graph;
}

export function getReportMarkdownFiles(
	app: App,
	scope: ReportGenerationScope = {}
): TFile[] {
	return scope.markdownFileProvider?.() ?? app.vault.getMarkdownFiles();
}

export function getReportFiles(
	app: App,
	scope: ReportGenerationScope = {}
): TFile[] {
	return scope.allFileProvider?.() ?? app.vault.getFiles();
}
