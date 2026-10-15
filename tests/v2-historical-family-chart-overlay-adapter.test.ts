import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import {
	adaptHistoricalEdgesToRelationshipOverlay
} from '../src/v2/historical-family-chart/overlay-adapter';
import type { HistoricalFamilyChartEdge } from '../src/v2/historical-family-chart/types';
import type { RelationshipTypeDefinition } from '../src/relationships/types/relationship-types';

const fakeFile = { path: 'People/A.md' } as TFile;

function edge(
	overrides: Partial<HistoricalFamilyChartEdge> = {}
): HistoricalFamilyChartEdge {
	return {
		id: 'a-1',
		subject: {
			crId: 'p-a',
			name: '曹操',
			filePath: 'People/曹操.md',
			file: fakeFile
		},
		object: {
			crId: 'p-b',
			name: '刘备',
			filePath: 'People/刘备.md',
			file: fakeFile
		},
		predicate: 'ally',
		label: '同盟',
		directed: false,
		symmetric: true,
		temporalState: 'active',
		timeStart: '196 CE',
		timeEnd: '199 CE',
		sourceFilePath: 'Assertions/ally.md',
		...overrides
	};
}

describe('Historical Family Chart overlay adapter', () => {
	it('reuses existing relationship colors and line styles by predicate id', () => {
		const ally: RelationshipTypeDefinition = {
			id: 'ally',
			name: 'Ally',
			category: 'feudal',
			color: '#10b981',
			lineStyle: 'dashed',
			symmetric: true,
			builtIn: true
		};
		const [entry] = adaptHistoricalEdgesToRelationshipOverlay(
			[edge()],
			[ally]
		);

		expect(entry.type).toMatchObject({
			id: 'ally',
			name: '同盟',
			color: '#10b981',
			lineStyle: 'dashed',
			symmetric: true
		});
		expect(entry.rel).toMatchObject({
			sourceCrId: 'p-a',
			targetCrId: 'p-b',
			from: '196 CE',
			to: '199 CE'
		});
	});

	it('uses a neutral fallback for ontology predicates without legacy styling', () => {
		const [entry] = adaptHistoricalEdgesToRelationshipOverlay(
			[edge({
				predicate: 'political_partner',
				label: '政治合作',
				directed: true,
				symmetric: false
			})],
			[]
		);

		expect(entry.type).toMatchObject({
			id: 'political_partner',
			name: '政治合作',
			category: 'social',
			color: '#64748b',
			lineStyle: 'solid',
			symmetric: false
		});
	});

	it('forces possible temporal relations to dotted styling', () => {
		const rival: RelationshipTypeDefinition = {
			id: 'rival',
			name: 'Rival',
			category: 'feudal',
			color: '#ef4444',
			lineStyle: 'dashed',
			symmetric: true,
			builtIn: true
		};
		const [entry] = adaptHistoricalEdgesToRelationshipOverlay(
			[edge({
				predicate: 'rival',
				label: '竞争',
				temporalState: 'possible',
				confidence: 'low'
			})],
			[rival]
		);

		expect(entry.type.lineStyle).toBe('dotted');
		expect(entry.rel.notes).toContain('Possible at current temporal focus');
		expect(entry.rel.notes).toContain('Confidence: low');
	});
});
