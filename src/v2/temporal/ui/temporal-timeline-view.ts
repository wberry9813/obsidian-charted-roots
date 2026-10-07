import {
	ItemView,
	WorkspaceLeaf,
	setIcon
} from 'obsidian';
import {
	scaleLinear,
	select,
	zoom,
	zoomIdentity,
	type D3ZoomEvent
} from 'd3';
import type CanvasRootsPlugin from '../../../../main';
import type { CalendarProvider } from '../../time/calendar-provider';
import {
	buildTimelineModel,
	generateHistoricalYearTicks,
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

export class TemporalTimelineView extends ItemView {
	private readonly plugin: CanvasRootsPlugin;
	private refreshTimeout: number | null = null;

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
	}

	public refresh(): void {
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

		const refreshButton = actions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Refresh timeline' }
		});
		setIcon(refreshButton, 'refresh-cw');
		refreshButton.addEventListener('click', () => this.refresh());

		const dates = this.plugin.getHistoricalDateService();
		const calendar = dates.getCalendarProvider('tyme');
		if (!calendar) {
			container.createDiv({
				text: 'Historical calendar provider is unavailable.',
				cls: 'cr-v2-timeline__empty'
			});
			return;
		}

		const items = this.plugin.getTemporalProjectionService().getAll();
		const model = buildTimelineModel(items, calendar);

		container.createDiv({
			text: `${model.spans.length} plotted · ${model.windows.length} bounded · ${model.review.length} review`,
			cls: 'cr-v2-timeline__summary'
		});

		if (!model.domain || model.spans.length === 0) {
			container.createDiv({
				text: model.review.length > 0
					? 'No resolved temporal spans are available to plot yet.'
					: 'No temporal items are available in the active Workspace.',
				cls: 'cr-v2-timeline__empty'
			});
			this.renderReview(container, model);
			return;
		}

		this.renderChart(container, model, calendar, fitButton);
		this.renderReview(container, model);
	}

	private renderChart(
		container: HTMLElement,
		model: TimelineModel,
		calendar: CalendarProvider,
		fitButton: HTMLButtonElement
	): void {
		if (!model.domain) return;

		const viewport = container.createDiv({ cls: 'cr-v2-timeline__viewport' });
		const measured = Math.floor(
			viewport.clientWidth || container.clientWidth || MIN_WIDTH
		);
		const width = Math.max(MIN_WIDTH, measured);
		const height = Math.max(
			MIN_HEIGHT,
			ROW_TOP + model.spans.length * ROW_HEIGHT + 34
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

		labelsGroup
			.selectAll<SVGTextElement, TimelineSpan>('text')
			.data(model.spans, span => span.item.id)
			.join('text')
			.attr('class', 'cr-v2-timeline__item-label')
			.attr('x', LEFT_MARGIN - 12)
			.attr('y', (_span, index) => ROW_TOP + index * ROW_HEIGHT + 17)
			.attr('text-anchor', 'end')
			.text(span => span.item.title);

		const rects = spansGroup
			.selectAll<SVGRectElement, TimelineSpan>('rect')
			.data(model.spans, span => span.item.id)
			.join('rect')
			.attr(
				'class',
				span => `cr-v2-timeline__span cr-v2-timeline__span--${span.item.kind}`
			)
			.attr('data-item-id', span => span.item.id)
			.attr('data-item-kind', span => span.item.kind)
			.attr('y', (_span, index) => ROW_TOP + index * ROW_HEIGHT + 5)
			.attr('height', 18)
			.attr('fill-opacity', span => kindOpacity(span.item.kind))
			.on('click', (_event, span) => {
				void this.app.workspace.getLeaf(false).openFile(span.item.file);
			});

		rects.append('title')
			.text(span => {
				const start = span.item.start?.expression ?? '';
				const end = span.item.end?.expression;
				return end
					? `${span.item.title} · ${start} → ${end}`
					: `${span.item.title} · ${start}`;
			});

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
				.attr('x', span => xScale(span.start))
				.attr('width', span => Math.max(
					3,
					xScale(span.endExclusive) - xScale(span.start)
				));
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
		fitButton.addEventListener('click', () => {
			svg.call(zoomBehavior.transform, zoomIdentity);
		});
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
