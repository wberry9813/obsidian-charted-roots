import { BceCeYearProvider } from './providers/bce-ce-provider';
import { TymeCalendarProvider } from './providers/tyme-calendar-provider';
import { SolarDayProvider } from './providers/solar-day-provider';
import type { CalendarProvider } from './calendar-provider';
import type {
	HistoricalDateProvider,
	TemporalParseContext,
	TemporalParseResult,
	TemporalValue
} from './types';

export interface HistoricalDateServiceOptions {
	providers?: HistoricalDateProvider[];
	includeBuiltInBceCeProvider?: boolean;
	calendarProviders?: CalendarProvider[];
	includeTymeCalendarProvider?: boolean;
	includeSolarDayProvider?: boolean;
}

function temporalSignature(value: TemporalValue): string {
	const { scale, start, end } = value.canonical;
	return [
		scale,
		start,
		end,
		value.precision,
		value.certainty,
		value.calendar ?? '',
		value.chronology ?? ''
	].join(':');
}

/**
 * Provider-oriented historical date resolver.
 *
 * Providers return null when they do not recognize an expression. If multiple
 * providers resolve the same expression to different canonical values, the
 * service reports ambiguity instead of silently choosing one.
 */
export class HistoricalDateService {
	private readonly providers: HistoricalDateProvider[] = [];
	private readonly calendarProviders = new Map<string, CalendarProvider>();

	constructor(options: HistoricalDateServiceOptions = {}) {
		const includeTyme = options.includeTymeCalendarProvider ?? true;

		if (includeTyme) {
			this.registerCalendarProvider(new TymeCalendarProvider());
		}
		for (const provider of options.calendarProviders ?? []) {
			this.registerCalendarProvider(provider);
		}

		if (options.includeBuiltInBceCeProvider ?? true) {
			this.registerProvider(new BceCeYearProvider());
		}

		const includeSolarDay = options.includeSolarDayProvider ?? includeTyme;
		if (includeSolarDay) {
			const calendar = this.getCalendarProvider('tyme');
			if (!calendar) {
				throw new Error('Solar day provider requires the Tyme calendar provider.');
			}
			this.registerProvider(new SolarDayProvider(calendar));
		}

		for (const provider of options.providers ?? []) {
			this.registerProvider(provider);
		}
	}

	registerProvider(provider: HistoricalDateProvider): void {
		if (this.providers.some(existing => existing.id === provider.id)) {
			throw new Error(`Historical date provider already registered: ${provider.id}`);
		}
		this.providers.push(provider);
	}

	listProviders(): string[] {
		return this.providers.map(provider => provider.id);
	}

	registerCalendarProvider(provider: CalendarProvider): void {
		if (this.calendarProviders.has(provider.id)) {
			throw new Error(`Calendar provider already registered: ${provider.id}`);
		}
		this.calendarProviders.set(provider.id, provider);
	}

	getCalendarProvider(id: string): CalendarProvider | undefined {
		return this.calendarProviders.get(id);
	}

	listCalendarProviders(): string[] {
		return [...this.calendarProviders.keys()];
	}

	parse(
		expression: string,
		context: TemporalParseContext = {}
	): TemporalParseResult {
		if (!expression.trim()) {
			return {
				status: 'unresolved',
				original: expression,
				reason: 'Date expression is empty.'
			};
		}

		const recognized: TemporalParseResult[] = [];
		for (const provider of this.providers) {
			const result = provider.parse(expression, context);
			if (result) recognized.push(result);
		}

		if (recognized.length === 0) {
			return {
				status: 'unresolved',
				original: expression,
				reason: 'No historical date provider recognized this expression.'
			};
		}

		const resolved = recognized.filter(
			(result): result is Extract<TemporalParseResult, { status: 'resolved' }> =>
				result.status === 'resolved'
		);

		if (resolved.length > 0) {
			const bySignature = new Map<string, TemporalValue>();
			for (const result of resolved) {
				bySignature.set(temporalSignature(result.value), result.value);
			}

			if (bySignature.size === 1) {
				return {
					status: 'resolved',
					value: [...bySignature.values()][0]
				};
			}

			return {
				status: 'ambiguous',
				original: expression,
				reason: 'Multiple providers resolved this expression differently.',
				candidates: [...bySignature.values()]
			};
		}

		const ambiguous = recognized.filter(
			(result): result is Extract<TemporalParseResult, { status: 'ambiguous' }> =>
				result.status === 'ambiguous'
		);
		if (ambiguous.length > 0) {
			return {
				status: 'ambiguous',
				original: expression,
				reason: ambiguous.map(result => result.reason).join(' '),
				candidates: ambiguous.flatMap(result => result.candidates)
			};
		}

		return recognized[0];
	}

	private astronomicalYearBounds(value: TemporalValue): { start: number; end: number } | null {
		if (value.canonical.scale === 'astronomical_year') {
			return {
				start: value.canonical.start,
				end: value.canonical.end
			};
		}

		if (value.canonical.scale === 'julian_day') {
			const calendar = this.getCalendarProvider('tyme')
				?? [...this.calendarProviders.values()][0];
			if (!calendar) return null;

			try {
				const start = calendar.julianDayToSolar(value.canonical.start).year;
				const end = calendar.julianDayToSolar(value.canonical.end).year;
				return {
					start: Math.min(start, end),
					end: Math.max(start, end)
				};
			} catch {
				return null;
			}
		}

		return null;
	}

	/**
	 * Compare two temporal values without manufacturing false precision.
	 *
	 * Same-scale values are compared at their native precision. For mixed
	 * astronomical-year / Julian-day values, the day value is projected only
	 * to its astronomical year. Different years remain sortable; values that
	 * overlap the same year compare equal because a year-only expression does
	 * not justify ordering an exact day within that year.
	 */
	compare(a: TemporalValue, b: TemporalValue): number | null {
		if (a.canonical.scale === b.canonical.scale) {
			if (a.canonical.start < b.canonical.start) return -1;
			if (a.canonical.start > b.canonical.start) return 1;
			if (a.canonical.end < b.canonical.end) return -1;
			if (a.canonical.end > b.canonical.end) return 1;
			return 0;
		}

		const aYears = this.astronomicalYearBounds(a);
		const bYears = this.astronomicalYearBounds(b);
		if (!aYears || !bYears) return null;

		if (aYears.end < bYears.start) return -1;
		if (aYears.start > bYears.end) return 1;
		return 0;
	}
}
