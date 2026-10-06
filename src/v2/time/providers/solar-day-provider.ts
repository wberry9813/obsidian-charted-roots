import type { CalendarProvider } from '../calendar-provider';
import { historicalYearToAstronomical } from '../historical-year';
import { stripApproximationPrefix } from '../expression-utils';
import type {
	HistoricalDateProvider,
	TemporalParseContext,
	TemporalParseResult
} from '../types';

interface ParsedSolarDate {
	year: number;
	month: number;
	day: number;
	approximate: boolean;
}

function parseSolarDateExpression(raw: string): ParsedSolarDate | null {
	const { expression, approximate } = stripApproximationPrefix(raw);
	let match: RegExpMatchArray | null;

	// ISO-like CE form. Bare ISO years are interpreted as CE historical years.
	match = expression.match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/u);
	if (match) {
		const historicalYear = Number(match[1]);
		if (historicalYear < 1) {
			return { year: Number.NaN, month: Number(match[2]), day: Number(match[3]), approximate };
		}
		return {
			year: historicalYearToAstronomical(historicalYear, 'CE'),
			month: Number(match[2]),
			day: Number(match[3]),
			approximate
		};
	}

	// Chinese BCE date, e.g. 公元前453年3月1日 / 前453年3月1日.
	match = expression.match(/^(?:公元)?前\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日$/u);
	if (match) {
		const historicalYear = Number(match[1]);
		if (historicalYear < 1) {
			return { year: Number.NaN, month: Number(match[2]), day: Number(match[3]), approximate };
		}
		return {
			year: historicalYearToAstronomical(historicalYear, 'BCE'),
			month: Number(match[2]),
			day: Number(match[3]),
			approximate
		};
	}

	// Chinese CE date, e.g. 公元453年3月1日 / 453年3月1日.
	match = expression.match(/^(?:公元)?\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日$/u);
	if (match) {
		const historicalYear = Number(match[1]);
		if (historicalYear < 1) {
			return { year: Number.NaN, month: Number(match[2]), day: Number(match[3]), approximate };
		}
		return {
			year: historicalYearToAstronomical(historicalYear, 'CE'),
			month: Number(match[2]),
			day: Number(match[3]),
			approximate
		};
	}

	return null;
}

export class SolarDayProvider implements HistoricalDateProvider {
	readonly id = 'solar-day';

	constructor(private readonly calendar: CalendarProvider) {}

	parse(
		expression: string,
		context?: TemporalParseContext
	): TemporalParseResult | null {
		if (
			context?.calendar
			&& !['solar', 'tyme', 'julian-gregorian-hybrid'].includes(context.calendar)
		) {
			return null;
		}

		const parsed = parseSolarDateExpression(expression);
		if (!parsed) return null;

		if (!Number.isFinite(parsed.year)) {
			return {
				status: 'unresolved',
				original: expression,
				reason: 'Historical BCE/CE notation has no year zero.'
			};
		}

		try {
			const julianDay = this.calendar.solarToJulianDay({
				year: parsed.year,
				month: parsed.month,
				day: parsed.day
			});

			return {
				status: 'resolved',
				value: {
					original: expression,
					precision: 'day',
					certainty: parsed.approximate ? 'approximate' : 'certain',
					calendar: 'julian-gregorian-hybrid',
					resolver: this.id,
					canonical: {
						scale: 'julian_day',
						start: julianDay,
						end: julianDay
					}
				}
			};
		} catch (error) {
			return {
				status: 'unresolved',
				original: expression,
				reason: error instanceof Error ? error.message : String(error)
			};
		}
	}
}
