import type { App } from 'obsidian';
import type { CanvasRootsSettings } from '../../settings';
import { createConfiguredFamilyGraph, type FamilyGraphService } from '../../core/family-graph';
import { EventService } from '../../events/services/event-service';
import type { EventNote } from '../../events/types/event-types';
import {
	TimelineCanvasExporter,
	type TimelineCanvasOptions
} from '../../events/services/timeline-canvas-exporter';
import type {
	TimelineEntry,
	TimelineExportFormat,
	TimelineReportOptions,
	TimelineReportResult
} from '../types/report-types';
import {
	TimelineGenerator,
	type TimelineVisualExportResult
} from './timeline-generator';
import type { ReportGenerationContext } from './report-context';

/**
 * Private renderer hooks already implemented by TimelineGenerator. This thin
 * compatibility adapter changes only data discovery; formatting/layout stays
 * in the mature upstream generator so we do not fork hundreds of renderer
 * lines merely to add Workspace scope.
 */
interface TimelineGeneratorInternals {
	applyFilters(events: EventNote[], options: TimelineReportOptions): EventNote[];
	eventToTimelineEntry(event: EventNote, familyGraph: FamilyGraphService): TimelineEntry;
	generateContent(
		format: TimelineExportFormat,
		events: EventNote[],
		dateRange: { from?: string; to?: string },
		summary: { eventCount: number; participantCount: number; placeCount: number },
		entries: TimelineEntry[],
		groupedEntries: Record<string, TimelineEntry[]> | undefined,
		options: TimelineReportOptions
	): string;
	groupEntries(
		entries: TimelineEntry[],
		grouping: TimelineReportOptions['grouping']
	): Record<string, TimelineEntry[]>;
	getSuggestedFilename(format: TimelineExportFormat, date: string): string;
}

export class WorkspaceTimelineGenerator extends TimelineGenerator {
	constructor(
		private readonly workspaceApp: App,
		private readonly workspaceSettings: CanvasRootsSettings,
		private readonly context: ReportGenerationContext
	) {
		super(workspaceApp, workspaceSettings);
	}

	private get internals(): TimelineGeneratorInternals {
		return this as unknown as TimelineGeneratorInternals;
	}

	private createEventService(): EventService {
		return new EventService(this.workspaceApp, this.workspaceSettings, {
			fileProvider: this.context.fileProvider,
			defaultFolderProvider: () =>
				this.context.folderProvider?.('events')
				?? this.workspaceSettings.eventsFolder
		});
	}

	override async generate(options: TimelineReportOptions): Promise<TimelineReportResult> {
		await Promise.resolve();
		const eventService = this.createEventService();
		const familyGraph = createConfiguredFamilyGraph(
			this.workspaceApp,
			this.workspaceSettings,
			this.context.fileProvider,
			this.context.scopeKeyProvider
		);

		const events = this.internals.applyFilters(eventService.getAllEvents(), options);
		const entries = events.map(event =>
			this.internals.eventToTimelineEntry(event, familyGraph)
		);
		entries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

		const participantSet = new Set<string>();
		const placeSet = new Set<string>();
		for (const entry of entries) {
			for (const person of entry.participants) participantSet.add(person.crId);
			if (entry.placeCrId) placeSet.add(entry.placeCrId);
		}

		const summary = {
			eventCount: entries.length,
			participantCount: participantSet.size,
			placeCount: placeSet.size
		};
		const dateRange: { from?: string; to?: string } = {};
		if (entries.length > 0) {
			dateRange.from = entries[0].date || entries[0].sortDate;
			dateRange.to = entries[entries.length - 1].date || entries[entries.length - 1].sortDate;
		}

		const groupedEntries = options.grouping !== 'none'
			? this.internals.groupEntries(entries, options.grouping)
			: undefined;
		const format: TimelineExportFormat = options.format || 'markdown_table';
		const content = this.internals.generateContent(
			format,
			events,
			dateRange,
			summary,
			entries,
			groupedEntries,
			options
		);
		const date = new Date().toISOString().split('T')[0];

		return {
			success: true,
			content,
			suggestedFilename: this.internals.getSuggestedFilename(format, date),
			stats: {
				peopleCount: participantSet.size,
				eventsCount: entries.length,
				sourcesCount: 0
			},
			warnings: [],
			dateRange,
			summary,
			entries,
			groupedEntries
		};
	}

	override async exportToCanvas(
		options: TimelineReportOptions
	): Promise<TimelineVisualExportResult> {
		const events = this.internals.applyFilters(
			this.createEventService().getAllEvents(),
			options
		);
		if (events.length === 0) {
			return { success: false, error: 'No events to export after filtering' };
		}

		const canvasOptions: TimelineCanvasOptions = {
			title: 'Timeline Report',
			colorScheme: options.canvasOptions?.colorScheme || 'event_type',
			layoutStyle: options.canvasOptions?.layoutStyle || 'horizontal',
			nodeWidth: options.canvasOptions?.nodeWidth || 200,
			nodeHeight: options.canvasOptions?.nodeHeight || 100,
			spacingX: options.canvasOptions?.spacingX || 50,
			spacingY: options.canvasOptions?.spacingY || 50,
			includeOrderingEdges: options.canvasOptions?.includeOrderingEdges ?? true,
			groupByPerson: options.grouping === 'by_person',
			filterGroup: options.groupFilter
		};
		if (options.personFilter && options.personFilter.length > 0) {
			canvasOptions.filterPerson = `[[${options.personFilter[0]}]]`;
		}

		return new TimelineCanvasExporter(
			this.workspaceApp,
			this.workspaceSettings
		).exportToCanvas(events, canvasOptions);
	}
}
