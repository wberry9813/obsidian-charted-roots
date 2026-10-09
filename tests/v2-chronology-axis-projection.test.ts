import { describe, expect, it } from 'vitest';
import { DateService } from '../src/dates/services/date-service';
import {
	projectTemporalBoundaryToChronologyYear,
	type TemporalBoundaryProjection
} from '../src/v2';

function dates(): DateService {
	return new DateService({
		enableFictionalDates: true,
		showBuiltInDateSystems: false,
		fictionalDateSystems: [{
			id: 'galactic-standard',
			name: 'Galactic Standard Calendar',
			universe: 'Star Wars',
			eras: [
				{
					id: 'bby',
					name: 'Before the Battle of Yavin',
					abbrev: 'BBY',
					epoch: 0,
					direction: 'backward'
				},
				{
					id: 'aby',
					name: 'After the Battle of Yavin',
					abbrev: 'ABY',
					epoch: 0,
					direction: 'forward'
				}
			]
		}]
	});
}

function boundary(expression: string): TemporalBoundaryProjection {
	return {
		expression,
		precisionConflict: false,
		result: {
			status: 'unresolved',
			original: expression,
			reason: 'not a historical/JDN expression'
		}
	};
}

describe('chronology-year temporal projection', () => {
	it('projects a fictional era year onto its canonical chronology axis', () => {
		const result = projectTemporalBoundaryToChronologyYear(
			boundary('BBY 82'),
			'Star Wars',
			'galactic-standard',
			dates()
		);

		expect(result).toEqual({
			scale: 'chronology_year',
			chronologyId: 'galactic-standard',
			start: -82,
			endExclusive: -81,
			original: 'BBY 82',
			label: 'Galactic Standard Calendar',
			universe: 'Star Wars',
			granularity: 'year',
			approximate: false
		});
	});

	it('keeps sub-year precision as metadata without inventing JDN coordinates', () => {
		const result = projectTemporalBoundaryToChronologyYear(
			boundary('ABY 4-03-15'),
			'Star Wars',
			'galactic-standard',
			dates()
		);

		expect(result).toMatchObject({
			start: 4,
			endExclusive: 5,
			granularity: 'day'
		});
	});

	it('preserves approximation metadata on the chronology-local interval', () => {
		const result = projectTemporalBoundaryToChronologyYear(
			boundary('BBY ~82'),
			'Star Wars',
			'galactic-standard',
			dates()
		);

		expect(result?.approximate).toBe(true);
	});

	it('rejects dates from a different chronology instead of mixing axes', () => {
		expect(projectTemporalBoundaryToChronologyYear(
			boundary('BBY 82'),
			'Star Wars',
			'another-calendar',
			dates()
		)).toBeNull();
	});

	it('does not reinterpret standard dates as fictional chronology years', () => {
		expect(projectTemporalBoundaryToChronologyYear(
			boundary('453 CE'),
			undefined,
			'galactic-standard',
			dates()
		)).toBeNull();
	});
});
