import { describe, expect, it } from 'vitest';
import {
	createDefaultVaultSchemaMetadata,
	validateVaultSchemaMetadata
} from '../src/v2';

describe('v2 vault schema metadata', () => {
	it('creates a valid Chinese-history-first default without fixing a storage path', () => {
		const metadata = createDefaultVaultSchemaMetadata();

		expect(metadata.schemaVersion).toBe(2);
		expect(metadata.ontologyVersion).toBe(1);
		expect(metadata.enabledPacks).toEqual(['core', 'chinese-history']);
		expect(metadata.defaultLocale).toBe('zh-CN');
		expect(validateVaultSchemaMetadata(metadata).valid).toBe(true);
	});

	it('requires the core pack and current schema version', () => {
		const result = validateVaultSchemaMetadata({
			schemaVersion: 1,
			ontologyVersion: 1,
			enabledPacks: ['chinese-history'],
			defaultLocale: 'zh-CN',
			migrationHistory: []
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toContain('schemaVersion must be 2.');
		expect(result.errors).toContain('enabledPacks must include the core pack.');
	});
});
