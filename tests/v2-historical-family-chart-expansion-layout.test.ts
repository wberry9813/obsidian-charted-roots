import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import {
	layoutHistoricalFamilyChartLanes,
	type HistoricalFamilyChartExpansionResult,
	type HistoricalFamilyChartPersonRef
} from '../src/v2/historical-family-chart';

function person(id: string): HistoricalFamilyChartPersonRef {
	return {
		crId: id,
		name: id.toUpperCase(),
		filePath: 'People/' + id + '.md',
		file: {} as TFile
	};
}

function expansion(
	nodes: Array<[string, number | null, 'root' | 'historical' | 'family' | 'historical+family']>
): HistoricalFamilyChartExpansionResult {
	return {
		nodes: nodes.map(([id, historicalDepth, source]) => ({
			person: person(id),
			historicalDepth,
			source
		})),
		edges: [],
		requestedDepth: 4,
		appliedDepth: 4,
		maxPeople: 40,
		maxHistoricalDepthReached: Math.max(
			0,
			...nodes.map(([, depth]) => depth ?? 0)
		),
		truncated: false,
		truncatedHistoricalNeighbors: 0,
		truncatedFamilyContext: 0
	};
}

describe('Historical Family Chart expansion lane layout', () => {
	it('keeps structural people out of historical-only lanes', () => {
		const positions = new Map([
			['root', { x: 100, y: 50 }],
			['family', { x: 300, y: 120 }]
		]);
		const result = layoutHistoricalFamilyChartLanes(
			expansion([
				['root', 0, 'root'],
				['family', 1, 'historical+family'],
				['outside', 1, 'historical']
			]),
			positions,
			'root',
			{ cardWidth: 180, cardHeight: 70, laneGap: 100 }
		);

		expect(result.nodes.map(node => node.person.crId))
			.toEqual(['outside']);
		expect(result.nodes[0]).toMatchObject({
			historicalDepth: 1,
			x: 580,
			y: 50
		});
	});

	it('uses one stable column per historical relationship depth', () => {
		const positions = new Map([
			['root', { x: 0, y: 100 }],
			['relative', { x: 200, y: 0 }]
		]);
		const result = layoutHistoricalFamilyChartLanes(
			expansion([
				['root', 0, 'root'],
				['b', 1, 'historical'],
				['a', 1, 'historical'],
				['c', 2, 'historical']
			]),
			positions,
			'root',
			{
				cardWidth: 160,
				cardHeight: 60,
				laneGap: 80,
				rowGap: 20
			}
		);

		expect(result.nodes).toEqual([
			{
				person: person('a'),
				historicalDepth: 1,
				x: 440,
				y: 60
			},
			{
				person: person('b'),
				historicalDepth: 1,
				x: 440,
				y: 140
			},
			{
				person: person('c'),
				historicalDepth: 2,
				x: 680,
				y: 100
			}
		]);
		expect(result.laneCount).toBe(2);
		expect(result.rightmostX).toBe(680);
	});

	it('anchors lanes around the structural center when root is absent', () => {
		const positions = new Map([
			['family-a', { x: -50, y: -100 }],
			['family-b', { x: 50, y: 100 }]
		]);
		const result = layoutHistoricalFamilyChartLanes(
			expansion([
				['root', 0, 'root'],
				['outside', 1, 'historical']
			]),
			positions,
			'root',
			{ cardWidth: 100, cardHeight: 50 }
		);

		expect(result.nodes[0]).toMatchObject({
			x: 270,
			y: 0
		});
	});

	it('ignores family-context-only nodes that are not structural cards', () => {
		const result = layoutHistoricalFamilyChartLanes(
			expansion([
				['root', 0, 'root'],
				['family-only', null, 'family']
			]),
			new Map([['root', { x: 0, y: 0 }]]),
			'root',
			{ cardWidth: 100, cardHeight: 50 }
		);
		expect(result.nodes).toEqual([]);
		expect(result.laneCount).toBe(0);
	});
});
