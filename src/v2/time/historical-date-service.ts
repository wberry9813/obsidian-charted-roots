import { BceCeYearProvider } from './providers/bce-ce-provider';
import type {
	HistoricalDateProvider,
	TemporalParseContext,
	TemporalParseResult,
	TemporalValue
} from './types';

export interface HistoricalDateServiceOptions {
	providers?: HistoricalDateProvider[];
	includeBuiltInBceCeProvider?: boolean;
}

function temporalSignature(value: TemporalValue): string {
	const { scale, start, end } = value.canonical;
	return [scale, start, end, value.precision, value.certainty].join(':');
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

	constructor(options: HistoricalDateServiceOptions = {}) {
		if (options.includeBuiltInBceCeProvider ?? true) {
			this.providers.push(new BceCeYearProvider());
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

	compare(a: TemporalValue, b: TemporalValue): number | null {
		if (a.canonical.scale !== b.canonical.scale) return null;
		if (a.canonical.start < b.canonical.start) return -1;
		if (a.canonical.start > b.canonical.start) return 1;
		if (a.canonical.end < b.canonical.end) return -1;
		if (a.canonical.end > b.canonical.end) return 1;
		return 0;
	}
}
