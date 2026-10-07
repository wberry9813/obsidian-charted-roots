import {
	ItemView,
	WorkspaceLeaf,
	setIcon
} from 'obsidian';
import {
	pointer,
	scaleLinear,
	select,
	zoom,
	zoomIdentity,
	type D3ZoomEvent
} from 'd3';
import type CanvasRootsPlugin from '../../../../main';
import type { CalendarProvider } from '../../time/calendar-provider';
import { astronomicalYearToHistorical } from '../../time/historical-year';
import {
	buildTimelineLanes,
	buildTimelineModel,
	generateHistoricalYearTicks,
	matchesTimelineFilter,
	timelineWindowBounds,
	type TemporalItemKind,
	type TimelineConstraintWindow,
	type TimelineGroupBy,
	type TimelineModel,
	type TimelineSpan
} from '../index';

export const VIEW_TYPE_TEMPORAL_TIMELINE = 'charted-roots-temporal-timeline';

const LEFT_MARGIN = 190;
const RIGHT_MARGIN = 28;
const AXIS_Y = 42;
const ROW_HEIGHT = 34;
const ROW_TOP = 72;
const MIN_WIDTH = 720;
const MIN_HEIGHT = 300;

type TimelineKindFilter = 'all' | TemporalItemKind;

interface TemporalTimelineViewState {
	search?: string;
	kind?: TimelineKindFilter;
	groupBy?: TimelineGroupBy;
}

interface TimelineVisualRow {
	key: string;
	label: string;
	laneKey?: string;
	laneHeader: boolean;
	span?: TimelineSpan;
	window?: TimelineConstraintWindow;
}

function kindOpacity(kind: TimelineSpan['item']['kind']): number {
	switch (kind) {
		case 'event':
			return 0.88;
		case 'process':
			return 0.58;
		case 'period':
			return 0.24;
		case 'assertion':
			return 0.42;
	}
}

function isTimelineKindFilter(value: unknown): value is TimelineKindFilter {
	return value === 'all'
		|| value === 'event'
		|| value === 'process'
		|| value === 'period'
		|| value === 'assertion';
}

function isTimelineGroupBy(value: unknown): value is TimelineGroupBy {
	return value === 'none'
		|| value === 'person'
		|| value === 'place'
		|| value === 'organization'
		|| value === 'universe';
}

function buildVisualRows(
	model: TimelineModel,
	groupBy: TimelineGroupBy
): TimelineVisualRow[] {
	if (groupBy === 'none') {
		return [
			...model.spans.map(span => ({
				key: `span:${span.item.id}`,
				label: span.item.title,
				laneHeader: false,
				span
			})),
			...model.windows.map(window => ({
				key: `window:${window.item.id}`,
				label: `${window.item.title} · possible`,
				laneHeader: false,
				window
			}))
		];
	}

	const rows: TimelineVisualRow[] = [];
	for (const lane of buildTimelineLanes(model, groupBy)) {
		rows.push({
			key: `lane:${lane.key}`,
			label: lane.label,
			laneKey: lane.key,
			laneHeader: true
		});
		for (const span of lane.spans) {
			rows.push({
				key: `${lane.key}:span:${span.item.id}`,
				label: span.item.title,
				laneKey: lane.key,
				laneHeader: false,
				span
			});
		}
		for (const window of lane.windows) {
			rows.push({
				key: `${lane.key}:window:${window.item.id}`,
				label: `${window.item.title} · possible`,
				laneKey: lane.key,
				laneHeader: false,
				window
			});
		}
	}
	return rows;
}

function formatFocusPoint(
	position: number,
	calendar: CalendarProvider
): string {
	const solar = calendar.julianDayToSolar(position);
	const historical = astronomicalYearToHistorical(solar.year);
	const month = String(solar.month).padStart(2, '0');
	const day = String(solar.day).padStart(2, '0');
	return `${historical.year} ${historical.era} · ${month}-${day}`;
}

export class TemporalTimelineView extends ItemView {
	private readonly plugin: CanvasRootsPlugin;
	private refreshTimeout: number | null = null;
	private currentSearch = '';
	private currentKind: TimelineKindFilter = 'all';
	private currentGroupBy: TimelineGroupBy = 'none';
	private resetZoom: (() => void) | null = null;
	private focusUnsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: CanvasRootsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_TEMPORAL_TIMELINE;
	}

	getDisplayText(): string {
		return 'Timeline';
	}

	getIcon(): string {
		return 'history';
	}

	async onOpen(): Promise<void> {
		this.refresh();
		this.focusUnsubscribe = this.plugin.getTemporalFocusService().subscribe(
			focus => {
				if (focus?.source !== 'timeline') {
					this.refresh();
				}
			}
		);
		this.registerEvent(
			this.app.vault.on('create', () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on('modify', () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on('delete', () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on('rename', () => this.scheduleRefresh())
		);
	}

	async onClose(): Promise<void> {
		if (this.refreshTimeout !== null) {
			window.clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}
		this.resetZoom = null;
		this.focusUnsubscribe?.();
		this.focusUnsubscribe = null;
	}

	public refresh(): void {
		this.renderView();
	}

	getState(): Record<string, unknown> {
		return {
			search: this.currentSearch,
			kind: this.currentKind,
			groupBy: this.currentGroupBy
		};
	}

	async setState(state: Partial<TemporalTimelineViewState>): Promise<void> {
		if (typeof state.search === 'string') {
			this.currentSearch = state.search;
		}
		if (isTimelineKindFilter(state.kind)) {
			this.currentKind = state.kind;
		}
		if (isTimelineGroupBy(state.groupBy)) {
			this.currentGroupBy = state.groupBy;
		}
		this.renderView();
	}

	private scheduleRefresh(): void {
		if (this.refreshTimeout !== null) {
			window.clearTimeout(this.refreshTimeout);
		}
		this.refreshTimeout = window.setTimeout(() => {
			this.refreshTimeout = null;
			this.refresh();
		}, 350);
	}

	private renderView(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('cr-v2-timeline');

		const header = container.createDiv({ cls: 'cr-v2-timeline__header' });
		const titleBlock = header.createDiv({ cls: 'cr-v2-timeline__title-block' });
		titleBlock.createEl('h2', {
			text: 'Timeline',
			cls: 'cr-v2-timeline__title'
		});

		const workspaceName = this.plugin.getWorkspaceService()?.getActive().name;
		if (workspaceName) {
			titleBlock.createDiv({
				text: workspaceName,
				cls: 'cr-v2-timeline__workspace'
			});
		}

		const actions = header.createDiv({ cls: 'cr-v2-timeline__actions' });
		const fitButton = actions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Fit timeline' }
		});
		setIcon(fitButton, 'maximize-2');
		fitButton.addEventListener('click', () => this.resetZoom?.());

		const refreshButton = actions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Refresh timeline' }
		});
		setIcon(refreshButton, 'refresh-cw');
		refreshButton.addEventListener('click', () => this.refresh());

		const controls = container.createDiv({
			cls: 'cr-v2-timeline__controls'
		});
		const searchInput = controls.createEl('input', {
			cls: 'cr-v2-timeline__search',
			type: 'search',
			placeholder: 'Search temporal items…',
			attr: { 'aria-label': 'Search temporal items' }
		});
		searchInput.value = this.currentSearch;

		const kindSelect = controls.createEl('select', {
			cls: 'cr-v2-timeline__kind-filter',
			attr: { 'aria-label': 'Filter timeline item kind' }
		});
		for (const [value, label] of [
			['all', 'All kinds'],
			['event', 'Events'],
			['process', 'Processes'],
			['period', 'Periods'],
			['assertion', 'Assertions']
		] as const) {
			const option = kindSelect.createEl('option', { text: label });
			option.value = value;
		}
		kindSelect.value = this.currentKind;

		const groupSelect = controls.createEl('select', {
			cls: 'cr-v2-timeline__group-filter',
			attr: { 'aria-label': 'Group timeline by entity' }
		});
		for (const [value, label] of [
			['none', 'No grouping'],
			['person', 'Group by person'],
			['place', 'Group by place'],
			['organization', 'Group by organization'],
			['universe', 'Group by universe']
		] as const) {
			const option = groupSelect.createEl('option', { text: label });
			option.value = value;
		}
		groupSelect.value = this.currentGroupBy;

		const results = container.createDiv({
			cls: 'cr-v2-timeline__results'
		});

		const renderResults = (): void => {
			this.renderResults(results);
			this.app.workspace.requestSaveLayout();
		};

		searchInput.addEventListener('input', () => {
			this.currentSearch = searchInput.value;
			renderResults();
		});

		kindSelect.addEventListener('change', () => {
			this.currentKind = isTimelineKindFilter(kindSelect.value)
				? kindSelect.value
				: 'all';
			renderResults();
		});

		groupSelect.addEventListener('change', () => {
			this.currentGroupBy = isTimelineGroupBy(groupSelect.value)
				? groupSelect.value
				: 'none';
			renderResults();
		});

		this.renderResults(results);
	}

	private renderResults(container: HTMLElement): void {
		container.empty();
		this.resetZoom = null;

		const dates = this.plugin.getHistoricalDateService();
		const calendar = dates.getCalendarProvider('tyme');
		if (!calendar) {
			container.createDiv({
				text: 'Historical calendar provider is unavailable.',
				cls: 'cr-v2-timeline__empty'
			});
			return;
		}

		const allItems = this.plugin.getTemporalProjectionService().getAll();
		const filter = {
			...(this.currentSearch.trim()
				? { text: this.currentSearch }
				: {}),
			...(this.currentKind !== 'all'
				? { kinds: [this.currentKind] }
				: {})
		};
		const items = allItems.filter(item =>
			matchesTimelineFilter(item, filter)
		);
		const model = buildTimelineModel(items, calendar);

		container.createDiv({
			text: `${model.spans.length} plotted · ${model.windows.length} possible · ${model.review.length} review`,
			cls: 'cr-v2-timeline__summary'
		});

		if (items.length === 0) {
			container.createDiv({
				text: allItems.length > 0
					? 'No temporal items match the current filters.'
					: 'No temporal items are available in the active Workspace.',
				cls: 'cr-v2-timeline__empty'
			});
			return;
		}

		if (!model.domain || (model.spans.length === 0 && model.windows.length === 0)) {
			container.createDiv({
				text: model.review.length > 0
					? 'No resolved temporal coordinates are available to plot yet.'
					: 'No temporal coordinates are available for the current filters.',
				cls: 'cr-v2-timeline__empty'
			});
			this.renderReview(container, model);
			return;
		}

		this.renderChart(container, model, calendar, this.currentGroupBy);
		this.renderReview(container, model);
	}

	private renderChart(
		container: HTMLElement,
		model: TimelineModel,
		calendar: CalendarProvider,
		groupBy: TimelineGroupBy
	): void {
		if (!model.domain) return;

		const viewport = container.createDiv({ cls: 'cr-v2-timeline__viewport' });
		const measured = Math.floor(
			viewport.clientWidth || container.clientWidth || MIN_WIDTH
		);
		const width = Math.max(MIN_WIDTH, measured);
		const rows = buildVisualRows(model, groupBy);
		const rowIndex = new Map(rows.map((row, index) => [row.key, index]));
		const spanRows = rows.filter(
			(row): row is TimelineVisualRow & { span: TimelineSpan } => Boolean(row.span)
		);
		const windowRows = rows.filter(
			(row): row is TimelineVisualRow & { window: TimelineConstraintWindow } =>
				Boolean(row.window)
		);
		const height = Math.max(
			MIN_HEIGHT,
			ROW_TOP + rows.length * ROW_HEIGHT + 34
		);

		const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svgNode.setAttribute('class', 'cr-v2-timeline__svg');
		svgNode.setAttribute('width', String(width));
		svgNode.setAttribute('height', String(height));
		svgNode.setAttribute('viewBox', `0 0 ${width} ${height}`);
		svgNode.setAttribute('data-scale', 'julian-day');
		viewport.appendChild(svgNode);

		const svg = select(svgNode);
		const baseScale = scaleLinear()
			.domain([model.domain.start, model.domain.endExclusive])
			.range([LEFT_MARGIN, width - RIGHT_MARGIN]);

		const axisGroup = svg.append('g')
			.attr('class', 'cr-v2-timeline__axis');
		const gridGroup = svg.append('g')
			.attr('class', 'cr-v2-timeline__grid');
		const labelsGroup = svg.append('g')
			.attr('class', 'cr-v2-timeline__labels');
		const spansGroup = svg.append('g')
			.attr('class', 'cr-v2-timeline__spans');
		const windowsGroup = svg.append('g')
			.attr('class', 'cr-v2-timeline__windows');
		const focusGroup = svg.append('g')
			.attr('class', 'cr-v2-timeline__focus');

		labelsGroup
			.selectAll<SVGTextElement, TimelineVisualRow>('text')
			.data(rows, row => row.key)
			.join('text')
			.attr(
				'class',
				row => row.laneHeader
					? 'cr-v2-timeline__lane-label'
					: row.window
						? 'cr-v2-timeline__item-label cr-v2-timeline__window-label'
						: 'cr-v2-timeline__item-label cr-v2-timeline__span-label'
			)
			.attr('data-lane-key', row => row.laneHeader ? row.laneKey ?? '' : null)
			.attr('x', row => row.laneHeader ? 12 : LEFT_MARGIN - 12)
			.attr(
				'y',
				row => ROW_TOP + (rowIndex.get(row.key) ?? 0) * ROW_HEIGHT + 17
			)
			.attr('text-anchor', row => row.laneHeader ? 'start' : 'end')
			.text(row => row.label);

		const rects = spansGroup
			.selectAll<SVGRectElement, TimelineVisualRow & { span: TimelineSpan }>('rect')
			.data(spanRows, row => row.key)
			.join('rect')
			.attr(
				'class',
				row => `cr-v2-timeline__span cr-v2-timeline__span--${row.span.item.kind}`
			)
			.attr('data-item-id', row => row.span.item.id)
			.attr('data-item-kind', row => row.span.item.kind)
			.attr('data-lane-key', row => row.laneKey ?? '')
			.attr(
				'y',
				row => ROW_TOP + (rowIndex.get(row.key) ?? 0) * ROW_HEIGHT + 5
			)
			.attr('height', 18)
			.attr('fill-opacity', row => kindOpacity(row.span.item.kind))
			.on('click', (_event, row) => {
				void this.app.workspace.getLeaf(false).openFile(row.span.item.file);
			});

		rects.append('title')
			.text(row => {
				const start = row.span.item.start?.expression ?? '';
				const end = row.span.item.end?.expression;
				return end
					? `${row.span.item.title} · ${start} → ${end}`
					: `${row.span.item.title} · ${start}`;
			});

		const windowRects = windowsGroup
			.selectAll<SVGRectElement, TimelineVisualRow & { window: TimelineConstraintWindow }>('rect')
			.data(windowRows, row => row.key)
			.join('rect')
			.attr('class', 'cr-v2-timeline__window')
			.attr('data-window-id', row => row.window.item.id)
			.attr('data-item-kind', row => row.window.item.kind)
			.attr('data-lane-key', row => row.laneKey ?? '')
			.attr(
				'data-open-start',
				row => timelineWindowBounds(row.window).lower === undefined ? 'true' : 'false'
			)
			.attr(
				'data-open-end',
				row => timelineWindowBounds(row.window).upper === undefined ? 'true' : 'false'
			)
			.attr(
				'y',
				row => ROW_TOP + (rowIndex.get(row.key) ?? 0) * ROW_HEIGHT + 5
			)
			.attr('height', 18)
			.on('click', (_event, row) => {
				void this.app.workspace.getLeaf(false).openFile(row.window.item.file);
			});

		windowRects.append('title')
			.text(row => {
				const window = row.window;
				const bounds = [
					window.item.start?.expression
						? `start ${window.item.start.expression}`
						: null,
					window.item.end?.expression
						? `end ${window.item.end.expression}`
						: null,
					window.item.notBefore?.expression
						? `not before ${window.item.notBefore.expression}`
						: null,
					window.item.notAfter?.expression
						? `not after ${window.item.notAfter.expression}`
						: null
				].filter(Boolean).join(' · ');
				return `${window.item.title} · possible window${bounds ? ` · ${bounds}` : ''}`;
			});

		let activeScale = baseScale;
		const focusService = this.plugin.getTemporalFocusService();

		const renderFocus = (xScale: typeof baseScale): void => {
			focusGroup.selectAll('*').remove();
			const focus = focusService.get();
			if (!focus) return;

			if (focus.kind === 'point') {
				if (
					focus.position < model.domain!.start
					|| focus.position >= model.domain!.endExclusive
				) {
					return;
				}
				const x = xScale(focus.position);
				focusGroup.append('line')
					.attr('class', 'cr-v2-timeline__focus-line')
					.attr('data-focus-kind', 'point')
					.attr('x1', x)
					.attr('x2', x)
					.attr('y1', AXIS_Y + 7)
					.attr('y2', height - 16);
				focusGroup.append('text')
					.attr('class', 'cr-v2-timeline__focus-label')
					.attr('x', x + 6)
					.attr('y', AXIS_Y + 18)
					.text(formatFocusPoint(focus.position, calendar));
				return;
			}

			const start = Math.max(focus.start, model.domain!.start);
			const end = Math.min(focus.endExclusive, model.domain!.endExclusive);
			if (end <= start) return;
			focusGroup.append('rect')
				.attr('class', 'cr-v2-timeline__focus-range')
				.attr('data-focus-kind', 'range')
				.attr('x', xScale(start))
				.attr('y', AXIS_Y + 7)
				.attr('width', Math.max(1, xScale(end) - xScale(start)))
				.attr('height', Math.max(1, height - AXIS_Y - 23));
		};

		const maxTicks = Math.max(
			4,
			Math.floor((width - LEFT_MARGIN - RIGHT_MARGIN) / 100)
		);

		const renderScale = (xScale: typeof baseScale): void => {
			const rawDomain = xScale.domain();
			const visibleStart = Math.max(model.domain!.start, rawDomain[0]);
			const visibleEnd = Math.min(model.domain!.endExclusive, rawDomain[1]);
			const visibleDomain = visibleEnd > visibleStart
				? { start: visibleStart, endExclusive: visibleEnd }
				: model.domain!;

			const ticks = generateHistoricalYearTicks(
				visibleDomain,
				calendar,
				{ maxTicks }
			);

			axisGroup.selectAll('*').remove();
			gridGroup.selectAll('*').remove();

			axisGroup.append('line')
				.attr('class', 'cr-v2-timeline__axis-line')
				.attr('x1', LEFT_MARGIN)
				.attr('x2', width - RIGHT_MARGIN)
				.attr('y1', AXIS_Y)
				.attr('y2', AXIS_Y);

			const tickGroups = axisGroup
				.selectAll<SVGGElement, typeof ticks[number]>('g')
				.data(ticks, tick => `${tick.era}-${tick.historicalYear}`)
				.join('g')
				.attr('class', 'cr-v2-timeline__tick')
				.attr('data-year-label', tick => tick.label)
				.attr('transform', tick => `translate(${xScale(tick.position)},0)`);

			tickGroups.append('line')
				.attr('class', 'cr-v2-timeline__tick-mark')
				.attr('y1', AXIS_Y - 5)
				.attr('y2', AXIS_Y + 5);

			tickGroups.append('text')
				.attr('class', 'cr-v2-timeline__tick-label')
				.attr('y', AXIS_Y - 10)
				.attr('text-anchor', 'middle')
				.text(tick => tick.label);

			gridGroup
				.selectAll<SVGLineElement, typeof ticks[number]>('line')
				.data(ticks, tick => `${tick.era}-${tick.historicalYear}`)
				.join('line')
				.attr('class', 'cr-v2-timeline__grid-line')
				.attr('x1', tick => xScale(tick.position))
				.attr('x2', tick => xScale(tick.position))
				.attr('y1', AXIS_Y + 7)
				.attr('y2', height - 16);

			rects
				.attr('x', row => xScale(row.span.start))
				.attr('width', row => Math.max(
					3,
					xScale(row.span.endExclusive) - xScale(row.span.start)
				));

			windowRects
				.attr('x', row => {
					const { lower } = timelineWindowBounds(row.window);
					return xScale(lower ?? model.domain!.start);
				})
				.attr('width', row => {
					const { lower, upper } = timelineWindowBounds(row.window);
					const start = lower ?? model.domain!.start;
					const end = upper ?? model.domain!.endExclusive;
					return Math.max(3, xScale(end) - xScale(start));
				});

			activeScale = xScale;
			renderFocus(xScale);
		};

		renderScale(baseScale);

		const zoomBehavior = zoom<SVGSVGElement, unknown>()
			.scaleExtent([1, 80])
			.on(
				'zoom',
				(event: D3ZoomEvent<SVGSVGElement, unknown>) => {
					renderScale(event.transform.rescaleX(baseScale));
				}
			);

		svg.call(zoomBehavior);
		svg.on('click.temporal-focus', (event: MouseEvent) => {
			if (event.defaultPrevented) return;
			const target = event.target;
			if (
				target instanceof Element
				&& target.closest(
					'.cr-v2-timeline__span, .cr-v2-timeline__window'
				)
			) {
				return;
			}
			const [x] = pointer(event, svgNode);
			if (x < LEFT_MARGIN || x > width - RIGHT_MARGIN) return;
			const position = activeScale.invert(x);
			if (
				position < model.domain!.start
				|| position >= model.domain!.endExclusive
			) {
				return;
			}
			focusService.setPoint(position, 'timeline');
			renderFocus(activeScale);
		});
		this.resetZoom = () => {
			svg.call(zoomBehavior.transform, zoomIdentity);
		};
	}

	private renderReview(
		container: HTMLElement,
		model: TimelineModel
	): void {
		if (model.review.length === 0) return;

		const details = container.createEl('details', {
			cls: 'cr-v2-timeline__review'
		});
		details.createEl('summary', {
			text: `Needs review (${model.review.length})`
		});
		const list = details.createEl('ul', {
			cls: 'cr-v2-timeline__review-list'
		});
		for (const entry of model.review) {
			const li = list.createEl('li');
			li.createEl('span', {
				text: entry.item.title,
				cls: 'cr-v2-timeline__review-title'
			});
			li.createEl('span', {
				text: ` — ${entry.reasons.join(', ')}`,
				cls: 'cr-v2-timeline__review-reasons'
			});
		}
	}
}
