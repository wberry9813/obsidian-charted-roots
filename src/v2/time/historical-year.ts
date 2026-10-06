export type HistoricalEra = 'BCE' | 'CE';

export interface HistoricalYear {
	era: HistoricalEra;
	year: number;
}

/**
 * Convert historical era numbering (which has no year zero) to astronomical
 * year numbering (which does).
 *
 * 1 BCE -> 0
 * 2 BCE -> -1
 * 453 BCE -> -452
 * 1 CE -> 1
 */
export function historicalYearToAstronomical(
	year: number,
	era: HistoricalEra
): number {
	if (!Number.isInteger(year) || year < 1) {
		throw new Error('Historical year must be a positive integer; there is no year zero.');
	}
	return era === 'BCE' ? 1 - year : year;
}

/**
 * Convert an astronomical year back to historical BCE/CE numbering.
 */
export function astronomicalYearToHistorical(
	astronomicalYear: number
): HistoricalYear {
	if (!Number.isInteger(astronomicalYear)) {
		throw new Error('Astronomical year must be an integer.');
	}
	return astronomicalYear <= 0
		? { era: 'BCE', year: 1 - astronomicalYear }
		: { era: 'CE', year: astronomicalYear };
}

export function formatHistoricalYearZhCN(
	astronomicalYear: number
): string {
	const historical = astronomicalYearToHistorical(astronomicalYear);
	return historical.era === 'BCE'
		? `前${historical.year}年`
		: `公元${historical.year}年`;
}

export function formatHistoricalYearEn(
	astronomicalYear: number
): string {
	const historical = astronomicalYearToHistorical(astronomicalYear);
	return historical.era === 'BCE'
		? `${historical.year} BCE`
		: `${historical.year} CE`;
}
