import {
	assertValidGeographicCoordinate,
	CANONICAL_GEOGRAPHIC_CRS,
	type CoordinateTransformProvider,
	type GeographicCoordinate,
	type GeographicCRS
} from './types';

/**
 * Enforces the v2 historical-map coordinate policy:
 *
 * - vault geographic coordinates are canonical WGS84;
 * - GCJ-02 / BD-09 exist only at import/display/basemap boundaries;
 * - custom pixel-map coordinates are a separate existing coordinate space.
 */
export class CanonicalCoordinateService {
	constructor(
		private readonly provider: CoordinateTransformProvider
	) {}

	get canonicalCRS(): GeographicCRS {
		return CANONICAL_GEOGRAPHIC_CRS;
	}

	transform(
		coordinate: GeographicCoordinate,
		from: GeographicCRS,
		to: GeographicCRS
	): GeographicCoordinate {
		assertValidGeographicCoordinate(coordinate);
		const transformed = this.provider.transform(coordinate, from, to);
		assertValidGeographicCoordinate(transformed);
		return transformed;
	}

	toCanonical(
		coordinate: GeographicCoordinate,
		sourceCRS: GeographicCRS
	): GeographicCoordinate {
		return this.transform(
			coordinate,
			sourceCRS,
			CANONICAL_GEOGRAPHIC_CRS
		);
	}

	fromCanonical(
		coordinate: GeographicCoordinate,
		targetCRS: GeographicCRS
	): GeographicCoordinate {
		return this.transform(
			coordinate,
			CANONICAL_GEOGRAPHIC_CRS,
			targetCRS
		);
	}

	transformMany(
		coordinates: readonly GeographicCoordinate[],
		from: GeographicCRS,
		to: GeographicCRS
	): GeographicCoordinate[] {
		return coordinates.map(coordinate =>
			this.transform(coordinate, from, to)
		);
	}
}
