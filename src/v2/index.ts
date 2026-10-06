export * from './types';
export * from './ontology-registry';
export * from './schema-validation';
export * from './assertion-service';
export * from './packs/core';
export * from './packs/chinese-history';

import { OntologyRegistry } from './ontology-registry';
import { CORE_V2_PACK } from './packs/core';
import { CHINESE_HISTORY_V1_PACK } from './packs/chinese-history';

export interface CreateV2RegistryOptions {
	includeChineseHistory?: boolean;
}

export function createV2OntologyRegistry(
	options: CreateV2RegistryOptions = {}
): OntologyRegistry {
	const registry = new OntologyRegistry();
	registry.registerPack(CORE_V2_PACK);

	if (options.includeChineseHistory ?? true) {
		registry.registerPack(CHINESE_HISTORY_V1_PACK);
	}

	return registry;
}
