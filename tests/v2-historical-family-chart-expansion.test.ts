import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import {
	DEFAULT_HISTORICAL_EXPANSION_PEOPLE,
	MAX_HISTORICAL_EXPANSION_DEPTH,
	MAX_HISTORICAL_EXPANSION_PEOPLE,
	expandHistoricalFamilyChartPeople
} from '../src/v2/historical-family-chart';
import type {
	HistoricalFamilyChartEdge,
	HistoricalFamilyChartPersonRef,
	HistoricalFamilyChartProjection
} from '../src/v2/historical-family-chart';

function person(id: string): HistoricalFamilyChartPersonRef {
	return {
		crId: id,
		name: id.toUpperCase(),
		filePath: 'People/' + id + '.md',
		file: {} as TFile
	};
}

function edge(
	id: string,
	left: HistoricalFamilyChartPersonRef,
	right: HistoricalFamilyChartPersonRef,
	directed = false
): HistoricalFamilyChartEdge {
	return {
		id,
		subject: left,
		object: right,
		predicate: directed ? 'mentor_of' : 'ally_of',
		label: directed ? 'Mentor of' : 'Ally of',
		directed,
		symmetric: !directed,
		temporalState: 'all_time',
		sourceFilePath: 'Assertions/' + id + '.md'
	};
}

function projection(edges: HistoricalFamilyChartEdge[]): HistoricalFamilyChartProjection {
	return {
		edges,
		focusApplied: false,
		skipped: {
			nonRelationship: 0,
			nonPersonEndpoint: 0,
			structuralFamilyPredicate: 0,
			outsideTemporalFocus: 0,
			undatedAtFocus: 0,
			symmetricDuplicate: 0
		}
	};
}

describe('Historical Family Chart person expansion', () => {
	it('expands one historical hop from the selected root', () => {
		const a = person('a');
		const b = person('b');
		const c = person('c');
		const result = expandHistoricalFamilyChartPeople(
			a,
			projection([
				edge('a-b', a, b),
				edge('b-c', b, c)
			]),
			{ depth: 1 }
		);

		expect(result.nodes.map(node => [
			node.person.crId,
			node.historicalDepth,
			node.source
		])).toEqual([
			['a', 0, 'root'],
			['b', 1, 'historical']
		]);
		expect(result.edges.map(item => item.id)).toEqual(['a-b']);
		expect(result.truncated).toBe(false);
	});

	it('supports bounded multi-hop traversal without changing edge direction', () => {
		const a = person('a');
		const b = person('b');
		const c = person('c');
		const directed = edge('a-b', a, b, true);
		const result = expandHistoricalFamilyChartPeople(
			a,
			projection([
				directed,
				edge('b-c', b, c)
			]),
			{ depth: 2 }
		);

		expect(result.nodes.map(node => node.person.crId))
			.toEqual(['a', 'b', 'c']);
		expect(result.nodes.map(node => node.historicalDepth))
			.toEqual([0, 1, 2]);
		expect(result.edges[0]).toBe(directed);
		expect(result.maxHistoricalDepthReached).toBe(2);
	});

	it('can discover against a directed edge from its object side', () => {
		const a = person('a');
		const b = person('b');
		const result = expandHistoricalFamilyChartPeople(
			b,
			projection([edge('a-b', a, b, true)]),
			{ depth: 1 }
		);
		expect(result.nodes.map(node => node.person.crId))
			.toEqual(['b', 'a']);
	});

	it('adds family context without using it as a traversal seed', () => {
		const root = person('root');
		const historical = person('historical');
		const family = person('family');
		const hidden = person('hidden');
		const result = expandHistoricalFamilyChartPeople(
			root,
			projection([
				edge('root-historical', root, historical),
				edge('family-hidden', family, hidden)
			]),
			{
				depth: 1,
				includeFamilyContext: true,
				familyContext: [family]
			}
		);

		expect(result.nodes.map(node => [
			node.person.crId,
			node.historicalDepth,
			node.source
		])).toEqual([
			['root', 0, 'root'],
			['historical', 1, 'historical'],
			['family', null, 'family']
		]);
		expect(result.nodes.some(node => node.person.crId === 'hidden'))
			.toBe(false);
	});

	it('marks people that are both historical neighbors and family context', () => {
		const root = person('root');
		const both = person('both');
		const result = expandHistoricalFamilyChartPeople(
			root,
			projection([edge('root-both', root, both)]),
			{
				depth: 1,
				includeFamilyContext: true,
				familyContext: [both]
			}
		);
		expect(result.nodes[1]?.source).toBe('historical+family');
	});

	it('enforces deterministic people and depth guards', () => {
		const root = person('root');
		const neighbors = Array.from({ length: 120 }, (_, index) =>
			person('p' + String(index).padStart(3, '0'))
		);
		const result = expandHistoricalFamilyChartPeople(
			root,
			projection(neighbors.map((item, index) =>
				edge('e' + String(index).padStart(3, '0'), root, item)
			)),
			{ depth: 999, maxPeople: 999 }
		);

		expect(result.appliedDepth).toBe(MAX_HISTORICAL_EXPANSION_DEPTH);
		expect(result.maxPeople).toBe(MAX_HISTORICAL_EXPANSION_PEOPLE);
		expect(result.nodes).toHaveLength(MAX_HISTORICAL_EXPANSION_PEOPLE);
		expect(result.nodes[1]?.person.crId).toBe('p000');
		expect(result.nodes.at(-1)?.person.crId).toBe('p098');
		expect(result.truncated).toBe(true);
		expect(result.truncatedHistoricalNeighbors).toBe(21);
	});

	it('keeps a root-only result valid when there are no historical edges', () => {
		const root = person('root');
		const result = expandHistoricalFamilyChartPeople(
			root,
			projection([]),
			{}
		);
		expect(result.nodes.map(node => node.person.crId)).toEqual(['root']);
		expect(result.edges).toEqual([]);
		expect(result.maxPeople).toBe(DEFAULT_HISTORICAL_EXPANSION_PEOPLE);
	});
});
