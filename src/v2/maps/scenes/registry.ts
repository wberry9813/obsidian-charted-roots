import type { GeographicBasemapRegistry } from '../basemaps';
import {
	BUILT_IN_HISTORICAL_GAZETTEER_PROVIDERS,
	BUILT_IN_HISTORICAL_MAP_SCENES
} from './builtins';
import type {
	HistoricalGazetteerProviderDefinition,
	HistoricalGazetteerProviderRegistryIssue,
	HistoricalMapSceneDefinition,
	HistoricalMapSceneRegistryIssue
} from './types';

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export class HistoricalGazetteerProviderRegistry {
	private readonly definitions = new Map<string, HistoricalGazetteerProviderDefinition>();

	constructor(
		definitions: readonly HistoricalGazetteerProviderDefinition[] =
			BUILT_IN_HISTORICAL_GAZETTEER_PROVIDERS
	) {
		for (const definition of definitions) {
			const issues = this.validate(definition);
			if (issues.length > 0) {
				throw new Error(
					`Invalid historical gazetteer provider ${definition.id}: ${issues
						.map(issue => issue.message)
						.join('; ')}`
				);
			}
			if (this.definitions.has(definition.id)) {
				throw new Error(`Duplicate historical gazetteer provider ID: ${definition.id}`);
			}
			this.definitions.set(definition.id, { ...definition });
		}
	}

	private validate(
		definition: HistoricalGazetteerProviderDefinition
	): HistoricalGazetteerProviderRegistryIssue[] {
		const issues: HistoricalGazetteerProviderRegistryIssue[] = [];
		if (!ID_PATTERN.test(definition.id)) {
			issues.push({
				providerId: definition.id,
				code: 'invalid_id',
				message: 'Provider ID must use lowercase letters, numbers, dots, underscores or hyphens.'
			});
		}
		if (!definition.label.trim()) {
			issues.push({
				providerId: definition.id,
				code: 'invalid_label',
				message: 'Provider label cannot be empty.'
			});
		}
		return issues;
	}

	get(id: string): HistoricalGazetteerProviderDefinition | undefined {
		const definition = this.definitions.get(id);
		return definition ? { ...definition } : undefined;
	}

	list(): HistoricalGazetteerProviderDefinition[] {
		return [...this.definitions.values()].map(definition => ({ ...definition }));
	}
}

export class HistoricalMapSceneRegistry {
	private readonly definitions = new Map<string, HistoricalMapSceneDefinition>();

	constructor(
		private readonly basemaps: GeographicBasemapRegistry,
		private readonly gazetteers: HistoricalGazetteerProviderRegistry =
			new HistoricalGazetteerProviderRegistry(),
		definitions: readonly HistoricalMapSceneDefinition[] =
			BUILT_IN_HISTORICAL_MAP_SCENES
	) {
		for (const definition of definitions) {
			const issues = this.validate(definition);
			if (issues.length > 0) {
				throw new Error(
					`Invalid historical map scene ${definition.id}: ${issues
						.map(issue => issue.message)
						.join('; ')}`
				);
			}
			if (this.definitions.has(definition.id)) {
				throw new Error(`Duplicate historical map scene ID: ${definition.id}`);
			}
			this.definitions.set(definition.id, {
				...definition,
				gazetteerProviderIds: [...definition.gazetteerProviderIds]
			});
		}
	}

	validate(definition: HistoricalMapSceneDefinition): HistoricalMapSceneRegistryIssue[] {
		const issues: HistoricalMapSceneRegistryIssue[] = [];
		if (!ID_PATTERN.test(definition.id)) {
			issues.push({
				sceneId: definition.id,
				code: 'invalid_id',
				message: 'Scene ID must use lowercase letters, numbers, dots, underscores or hyphens.'
			});
		}
		if (!definition.label.trim()) {
			issues.push({
				sceneId: definition.id,
				code: 'invalid_label',
				message: 'Scene label cannot be empty.'
			});
		}
		if (!this.basemaps.get(definition.basemapId)) {
			issues.push({
				sceneId: definition.id,
				code: 'missing_basemap_id',
				message: `Unknown basemap ID: ${definition.basemapId}`
			});
		}
		for (const providerId of definition.gazetteerProviderIds) {
			if (!this.gazetteers.get(providerId)) {
				issues.push({
					sceneId: definition.id,
					code: 'unknown_gazetteer_provider',
					message: `Unknown gazetteer provider ID: ${providerId}`
				});
			}
		}
		return issues;
	}

	get(id: string): HistoricalMapSceneDefinition | undefined {
		const definition = this.definitions.get(id);
		return definition
			? {
				...definition,
				gazetteerProviderIds: [...definition.gazetteerProviderIds]
			}
			: undefined;
	}

	list(): HistoricalMapSceneDefinition[] {
		return [...this.definitions.values()].map(definition => ({
			...definition,
			gazetteerProviderIds: [...definition.gazetteerProviderIds]
		}));
	}
}
