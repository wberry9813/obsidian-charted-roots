export const CURRENT_VAULT_SCHEMA_VERSION = 2 as const;
export const CURRENT_ONTOLOGY_VERSION = 1;

export interface MigrationHistoryEntry {
	from: number;
	to: number;
	completedAt: string;
	sourceVersion?: string;
	reportPath?: string;
}

export interface VaultSchemaMetadata {
	schemaVersion: typeof CURRENT_VAULT_SCHEMA_VERSION;
	ontologyVersion: number;
	enabledPacks: string[];
	defaultLocale: string;
	migrationHistory: MigrationHistoryEntry[];
}

export interface VaultSchemaValidationResult {
	valid: boolean;
	errors: string[];
}

export function createDefaultVaultSchemaMetadata(): VaultSchemaMetadata {
	return {
		schemaVersion: CURRENT_VAULT_SCHEMA_VERSION,
		ontologyVersion: CURRENT_ONTOLOGY_VERSION,
		enabledPacks: ['core', 'chinese-history'],
		defaultLocale: 'zh-CN',
		migrationHistory: []
	};
}

/**
 * Validate vault-level schema metadata without assuming where it is stored.
 *
 * Persistence path is deliberately postponed until migration implementation.
 */
export function validateVaultSchemaMetadata(
	value: unknown
): VaultSchemaValidationResult {
	const errors: string[] = [];

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { valid: false, errors: ['Vault schema metadata must be an object.'] };
	}

	const record = value as Record<string, unknown>;

	if (record.schemaVersion !== CURRENT_VAULT_SCHEMA_VERSION) {
		errors.push(`schemaVersion must be ${CURRENT_VAULT_SCHEMA_VERSION}.`);
	}
	if (
		typeof record.ontologyVersion !== 'number'
		|| !Number.isInteger(record.ontologyVersion)
		|| record.ontologyVersion < 1
	) {
		errors.push('ontologyVersion must be a positive integer.');
	}
	if (
		!Array.isArray(record.enabledPacks)
		|| record.enabledPacks.some(item => typeof item !== 'string' || !item.trim())
	) {
		errors.push('enabledPacks must be an array of non-empty strings.');
	} else if (!record.enabledPacks.includes('core')) {
		errors.push('enabledPacks must include the core pack.');
	}
	if (typeof record.defaultLocale !== 'string' || !record.defaultLocale.trim()) {
		errors.push('defaultLocale must be a non-empty string.');
	}
	if (!Array.isArray(record.migrationHistory)) {
		errors.push('migrationHistory must be an array.');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
