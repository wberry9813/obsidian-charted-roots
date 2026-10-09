export type GeographicCRS = 'wgs84' | 'gcj02' | 'bd09';

export const CANONICAL_GEOGRAPHIC_CRS: GeographicCRS = 'wgs84';

export interface GeographicCoordinate {
	longitude: number;
	latitude: number;
}

export interface CoordinateTransformProvider {
	transform(
		coordinate: GeographicCoordinate,
		from: GeographicCRS,
		to: GeographicCRS
	): GeographicCoordinate;
}

export function assertValidGeographicCoordinate(
	coordinate: GeographicCoordinate
): void {
	if (
		!Number.isFinite(coordinate.longitude)
		|| !Number.isFinite(coordinate.latitude)
	) {
		throw new Error('Geographic coordinates must be finite numbers.');
	}
	if (coordinate.longitude < -180 || coordinate.longitude > 180) {
		throw new Error(
			`Longitude must be between -180 and 180: ${coordinate.longitude}`
		);
	}
	if (coordinate.latitude < -90 || coordinate.latitude > 90) {
		throw new Error(
			`Latitude must be between -90 and 90: ${coordinate.latitude}`
		);
	}
}
