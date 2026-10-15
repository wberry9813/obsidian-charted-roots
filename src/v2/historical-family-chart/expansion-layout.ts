import type {
	HistoricalFamilyChartExpansionNode,
	HistoricalFamilyChartExpansionResult
} from './expansion';
import type { HistoricalFamilyChartPersonRef } from './types';

export interface HistoricalFamilyChartPoint {
	x: number;
	y: number;
}

export interface HistoricalFamilyChartLaneLayoutOptions {
	cardWidth: number;
	cardHeight: number;
	/** Empty space between the genealogy right edge and each historical lane. */
	laneGap?: number;
	/** Vertical gap between historical-only person cards in one lane. */
	rowGap?: number;
}

export interface HistoricalFamilyChartLaneNode {
	person: HistoricalFamilyChartPersonRef;
	historicalDepth: number;
	x: number;
	y: number;
}

export interface HistoricalFamilyChartLaneLayout {
	nodes: HistoricalFamilyChartLaneNode[];
	laneCount: number;
	rightmostX: number;
}

/**
 * Deterministic hybrid layout for F4.
 *
 * Existing genealogy cards keep their family-chart positions. Historical-only
 * people are placed in stable columns to the right, one column per relationship
 * depth. This avoids fake parent/spouse edges and avoids force-layout jitter
 * when TemporalFocus changes.
 */
export function layoutHistoricalFamilyChartLanes(
	expansion: HistoricalFamilyChartExpansionResult,
	structuralPositions: ReadonlyMap<string, HistoricalFamilyChartPoint>,
	rootCrId: string,
	options: HistoricalFamilyChartLaneLayoutOptions
): HistoricalFamilyChartLaneLayout {
	const laneGap = Math.max(24, options.laneGap ?? 120);
	const rowGap = Math.max(8, options.rowGap ?? 32);
	const cardWidth = Math.max(40, options.cardWidth);
	const cardHeight = Math.max(24, options.cardHeight);

	const structuralValues = [...structuralPositions.values()];
	const maxStructuralX = structuralValues.length > 0
		? Math.max(...structuralValues.map(point => point.x))
		: 0;
	const rootY = structuralPositions.get(rootCrId)?.y
		?? (
			structuralValues.length > 0
				? structuralValues.reduce((sum, point) => sum + point.y, 0)
					/ structuralValues.length
				: 0
		);

	const historicalOnly = expansion.nodes.filter(
		(node): node is HistoricalFamilyChartExpansionNode & {
			historicalDepth: number;
		} =>
			node.historicalDepth !== null
			&& node.historicalDepth > 0
			&& !structuralPositions.has(node.person.crId)
	);

	const byDepth = new Map<number, typeof historicalOnly>();
	for (const node of historicalOnly) {
		const list = byDepth.get(node.historicalDepth) ?? [];
		list.push(node);
		byDepth.set(node.historicalDepth, list);
	}

	const output: HistoricalFamilyChartLaneNode[] = [];
	const laneStep = cardWidth + laneGap;
	let rightmostX = maxStructuralX;
	const depths = [...byDepth.keys()].sort((a, b) => a - b);

	for (const depth of depths) {
		const lane = (byDepth.get(depth) ?? [])
			.slice()
			.sort((left, right) =>
				left.person.crId.localeCompare(right.person.crId)
			);
		const x = maxStructuralX + laneStep * depth;
		rightmostX = Math.max(rightmostX, x);

		const rowStep = cardHeight + rowGap;
		const offset = (lane.length - 1) / 2;
		lane.forEach((node, index) => {
			output.push({
				person: node.person,
				historicalDepth: depth,
				x,
				y: rootY + (index - offset) * rowStep
			});
		});
	}

	return {
		nodes: output,
		laneCount: depths.length,
		rightmostX
	};
}
