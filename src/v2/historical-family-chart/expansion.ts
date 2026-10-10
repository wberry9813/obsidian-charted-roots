import type {
	HistoricalFamilyChartEdge,
	HistoricalFamilyChartPersonRef,
	HistoricalFamilyChartProjection
} from './types';

export const DEFAULT_HISTORICAL_EXPANSION_DEPTH = 1;
export const MAX_HISTORICAL_EXPANSION_DEPTH = 4;
export const DEFAULT_HISTORICAL_EXPANSION_PEOPLE = 40;
export const MAX_HISTORICAL_EXPANSION_PEOPLE = 100;

export type HistoricalFamilyChartExpansionSource =
	| 'root'
	| 'historical'
	| 'family'
	| 'historical+family';

export interface HistoricalFamilyChartExpansionNode {
	person: HistoricalFamilyChartPersonRef;
	/**
	 * Number of historical-relationship hops from the root. Family-context-only
	 * people intentionally have null here because family inclusion does not
	 * become a traversal seed.
	 */
	historicalDepth: number | null;
	source: HistoricalFamilyChartExpansionSource;
}

export interface HistoricalFamilyChartExpansionOptions {
	/** Historical relationship hops from the selected root. */
	depth?: number;
	/** Total visible person budget, including optional family context. */
	maxPeople?: number;
	/**
	 * Existing genealogy people to retain as context. These are appended after
	 * historical traversal and never become traversal seeds by themselves.
	 */
	familyContext?: readonly HistoricalFamilyChartPersonRef[];
	includeFamilyContext?: boolean;
}

export interface HistoricalFamilyChartExpansionResult {
	nodes: HistoricalFamilyChartExpansionNode[];
	/**
	 * Historical edges whose two endpoints are both inside the visible person
	 * set. Direction/symmetry remain exactly as projected.
	 */
	edges: HistoricalFamilyChartEdge[];
	requestedDepth: number;
	appliedDepth: number;
	maxPeople: number;
	maxHistoricalDepthReached: number;
	truncated: boolean;
	truncatedHistoricalNeighbors: number;
	truncatedFamilyContext: number;
}

function clampInteger(
	value: number | undefined,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.max(minimum, Math.min(maximum, Math.floor(value!)));
}

function otherEndpoint(
	edge: HistoricalFamilyChartEdge,
	crId: string
): HistoricalFamilyChartPersonRef | null {
	if (edge.subject.crId === crId) return edge.object;
	if (edge.object.crId === crId) return edge.subject;
	return null;
}

function mergeSource(
	current: HistoricalFamilyChartExpansionSource,
	family: boolean
): HistoricalFamilyChartExpansionSource {
	if (!family) return current;
	if (current === 'historical') return 'historical+family';
	return current;
}

/**
 * Build a bounded, person-only historical neighborhood around a root Person.
 *
 * Traversal treats directed relationships as traversable in both directions:
 * direction belongs to edge semantics, while neighborhood discovery answers
 * "who is connected to this person?". Family context is display context only
 * and deliberately does not seed additional historical traversal.
 */
export function expandHistoricalFamilyChartPeople(
	root: HistoricalFamilyChartPersonRef,
	projection: HistoricalFamilyChartProjection,
	options: HistoricalFamilyChartExpansionOptions = {}
): HistoricalFamilyChartExpansionResult {
	const requestedDepth = clampInteger(
		options.depth,
		DEFAULT_HISTORICAL_EXPANSION_DEPTH,
		0,
		Number.MAX_SAFE_INTEGER
	);
	const appliedDepth = Math.min(
		requestedDepth,
		MAX_HISTORICAL_EXPANSION_DEPTH
	);
	const maxPeople = clampInteger(
		options.maxPeople,
		DEFAULT_HISTORICAL_EXPANSION_PEOPLE,
		1,
		MAX_HISTORICAL_EXPANSION_PEOPLE
	);

	const adjacency = new Map<string, HistoricalFamilyChartEdge[]>();
	for (const edge of projection.edges) {
		for (const id of [edge.subject.crId, edge.object.crId]) {
			const list = adjacency.get(id) ?? [];
			list.push(edge);
			adjacency.set(id, list);
		}
	}
	for (const list of adjacency.values()) {
		list.sort((left, right) =>
			left.id.localeCompare(right.id)
			|| left.subject.crId.localeCompare(right.subject.crId)
			|| left.object.crId.localeCompare(right.object.crId)
		);
	}

	const nodes = new Map<string, HistoricalFamilyChartExpansionNode>();
	nodes.set(root.crId, {
		person: root,
		historicalDepth: 0,
		source: 'root'
	});

	let frontier = [root.crId];
	let maxHistoricalDepthReached = 0;
	let truncatedHistoricalNeighbors = 0;

	for (let depth = 1; depth <= appliedDepth && frontier.length > 0; depth++) {
		const next: string[] = [];
		const candidates = new Map<string, HistoricalFamilyChartPersonRef>();

		for (const currentId of frontier) {
			for (const edge of adjacency.get(currentId) ?? []) {
				const other = otherEndpoint(edge, currentId);
				if (!other || nodes.has(other.crId)) continue;
				candidates.set(other.crId, other);
			}
		}

		for (const person of [...candidates.values()].sort((a, b) =>
			a.crId.localeCompare(b.crId)
		)) {
			if (nodes.size >= maxPeople) {
				truncatedHistoricalNeighbors++;
				continue;
			}
			nodes.set(person.crId, {
				person,
				historicalDepth: depth,
				source: 'historical'
			});
			next.push(person.crId);
			maxHistoricalDepthReached = depth;
		}

		frontier = next;
	}

	let truncatedFamilyContext = 0;
	if (options.includeFamilyContext) {
		const familyById = new Map(
			(options.familyContext ?? [])
				.filter(person => person.crId !== root.crId)
				.map(person => [person.crId, person])
		);
		for (const person of [...familyById.values()].sort((a, b) =>
			a.crId.localeCompare(b.crId)
		)) {
			const existing = nodes.get(person.crId);
			if (existing) {
				existing.source = mergeSource(existing.source, true);
				continue;
			}
			if (nodes.size >= maxPeople) {
				truncatedFamilyContext++;
				continue;
			}
			nodes.set(person.crId, {
				person,
				historicalDepth: null,
				source: 'family'
			});
		}
	}

	const visibleIds = new Set(nodes.keys());
	const edges = projection.edges.filter(edge =>
		visibleIds.has(edge.subject.crId)
		&& visibleIds.has(edge.object.crId)
	);

	return {
		nodes: [...nodes.values()],
		edges,
		requestedDepth,
		appliedDepth,
		maxPeople,
		maxHistoricalDepthReached,
		truncated:
			requestedDepth > appliedDepth
			|| truncatedHistoricalNeighbors > 0
			|| truncatedFamilyContext > 0,
		truncatedHistoricalNeighbors,
		truncatedFamilyContext
	};
}
