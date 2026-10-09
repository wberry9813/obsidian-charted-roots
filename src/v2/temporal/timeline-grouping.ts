import type {
	TimelineConstraintWindow,
	TimelineModel,
	TimelineSpan
} from './timeline-model';
import type {
	TemporalGroupingKind,
	TemporalGroupingRef
} from './types';

export type TimelineGroupBy = 'none' | TemporalGroupingKind;

export interface TimelineLane {
	key: string;
	label: string;
	group?: TemporalGroupingRef;
	spans: TimelineSpan[];
	windows: TimelineConstraintWindow[];
}

const UNGROUPED_KEY = '__ungrouped__';

function laneKey(group: TemporalGroupingRef): string {
	return group.key;
}

function groupsFor(
	spanOrWindow: TimelineSpan | TimelineConstraintWindow,
	groupBy: TemporalGroupingKind
): TemporalGroupingRef[] {
	return spanOrWindow.item.groups.filter(group => group.kind === groupBy);
}

function ensureLane(
	lanes: Map<string, TimelineLane>,
	key: string,
	label: string,
	group?: TemporalGroupingRef
): TimelineLane {
	const existing = lanes.get(key);
	if (existing) return existing;
	const lane: TimelineLane = {
		key,
		label,
		group,
		spans: [],
		windows: []
	};
	lanes.set(key, lane);
	return lane;
}

/**
 * Build optional entity swimlanes from the timeline model.
 *
 * An item with multiple matching entity refs intentionally appears in more
 * than one lane. This represents a real many-to-many temporal relation rather
 * than choosing an arbitrary "primary" entity.
 */
export function buildTimelineLanes(
	model: TimelineModel,
	groupBy: TimelineGroupBy
): TimelineLane[] {
	if (groupBy === 'none') {
		return [{
			key: '__all__',
			label: 'All items',
			spans: [...model.spans],
			windows: [...model.windows]
		}];
	}

	const lanes = new Map<string, TimelineLane>();

	for (const span of model.spans) {
		const groups = groupsFor(span, groupBy);
		if (groups.length === 0) {
			ensureLane(lanes, UNGROUPED_KEY, 'Ungrouped').spans.push(span);
			continue;
		}
		for (const group of groups) {
			ensureLane(lanes, laneKey(group), group.label, group)
				.spans.push(span);
		}
	}

	for (const window of model.windows) {
		const groups = groupsFor(window, groupBy);
		if (groups.length === 0) {
			ensureLane(lanes, UNGROUPED_KEY, 'Ungrouped').windows.push(window);
			continue;
		}
		for (const group of groups) {
			ensureLane(lanes, laneKey(group), group.label, group)
				.windows.push(window);
		}
	}

	return [...lanes.values()].sort((a, b) => {
		if (a.key === UNGROUPED_KEY) return 1;
		if (b.key === UNGROUPED_KEY) return -1;
		return a.label.localeCompare(b.label);
	});
}
