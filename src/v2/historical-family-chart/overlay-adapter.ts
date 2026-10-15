import type {
	ParsedRelationship,
	RelationshipTypeDefinition
} from '../../relationships/types/relationship-types';
import type { HistoricalFamilyChartEdge } from './types';

export interface HistoricalOverlayEntry {
	rel: ParsedRelationship;
	type: RelationshipTypeDefinition;
}

const FALLBACK_COLOR = '#64748b';

function fallbackType(
	edge: HistoricalFamilyChartEdge
): RelationshipTypeDefinition {
	return {
		id: edge.predicate,
		name: edge.label,
		category: 'social',
		color: FALLBACK_COLOR,
		lineStyle: edge.temporalState === 'possible' ? 'dotted' : 'solid',
		symmetric: edge.symmetric,
		builtIn: false,
		includeOnFamilyChartOverlay: true
	};
}

/**
 * Bridge the v2 historical relationship model into the mature Family Chart
 * overlay renderer without leaking legacy frontmatter semantics back into v2.
 *
 * Existing relationship type styling wins when a predicate shares a known type
 * id (ally, rival, mentor, liege, ...). Unknown predicates get a neutral,
 * deterministic visual fallback. Possible temporal edges are always dotted.
 */
export function adaptHistoricalEdgesToRelationshipOverlay(
	edges: readonly HistoricalFamilyChartEdge[],
	relationshipTypes: readonly RelationshipTypeDefinition[]
): HistoricalOverlayEntry[] {
	const typeById = new Map(
		relationshipTypes.map(type => [type.id, type])
	);

	return edges.map(edge => {
		const configured = typeById.get(edge.predicate);
		const base = configured
			? {
				...configured,
				name: edge.label,
				symmetric: edge.symmetric
			}
			: fallbackType(edge);
		const type: RelationshipTypeDefinition = edge.temporalState === 'possible'
			? { ...base, lineStyle: 'dotted' }
			: base;

		const stateNote = edge.temporalState === 'possible'
			? 'Possible at current temporal focus'
			: undefined;
		const confidenceNote = edge.confidence
			? `Confidence: ${edge.confidence}`
			: undefined;
		const notes = [stateNote, confidenceNote]
			.filter((value): value is string => Boolean(value))
			.join(' · ') || undefined;

		return {
			type,
			rel: {
				type,
				sourceCrId: edge.subject.crId,
				sourceName: edge.subject.name,
				sourceFilePath: edge.subject.filePath,
				targetCrId: edge.object.crId,
				targetName: edge.object.name,
				targetFilePath: edge.object.filePath,
				from: edge.timeStart,
				to: edge.timeEnd,
				notes,
				isInferred: false
			}
		};
	});
}
