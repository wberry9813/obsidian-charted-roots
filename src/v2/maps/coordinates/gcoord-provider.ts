import gcoord from 'gcoord';
import {
	assertValidGeographicCoordinate,
	type CoordinateTransformProvider,
	type GeographicCoordinate,
	type GeographicCRS
} from './types';

const CRS_MAP = {
	wgs84: gcoord.WGS84,
	gcj02: gcoord.GCJ02,
	bd09: gcoord.BD09
} as const;

/**
 * Thin adapter around gcoord.
 *
 * Charted Roots owns the canonical/storage policy; gcoord is only the
 * coordinate-math backend at system boundaries.
 */
export class GcoordCoordinateTransformProvider
implements CoordinateTransformProvider {
	transform(
		coordinate: GeographicCoordinate,
		from: GeographicCRS,
		to: GeographicCRS
	): GeographicCoordinate {
		assertValidGeographicCoordinate(coordinate);

		if (from === to) {
			return { ...coordinate };
		}

		const result = gcoord.transform(
			[coordinate.longitude, coordinate.latitude],
			CRS_MAP[from],
			CRS_MAP[to]
		);

		const transformed = {
			longitude: result[0],
			latitude: result[1]
		};
		assertValidGeographicCoordinate(transformed);
		return transformed;
	}
}
