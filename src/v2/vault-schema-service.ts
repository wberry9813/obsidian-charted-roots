import { normalizePath, type App } from 'obsidian';
import {
	createDefaultVaultSchemaMetadata,
	validateVaultSchemaMetadata,
	type VaultSchemaMetadata
} from './vault-schema';

export const VAULT_SCHEMA_METADATA_PATH = '.charted-roots/vault.json';

export class VaultSchemaService {
	constructor(private readonly app: App) {}

	async read(): Promise<VaultSchemaMetadata | null> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(VAULT_SCHEMA_METADATA_PATH))) return null;

		const raw = await adapter.read(VAULT_SCHEMA_METADATA_PATH);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			throw new Error(
				`Invalid vault schema metadata JSON: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		const validation = validateVaultSchemaMetadata(parsed);
		if (!validation.valid) {
			throw new Error(
				`Invalid vault schema metadata: ${validation.errors.join(' ')}`
			);
		}

		return parsed as VaultSchemaMetadata;
	}

	async write(metadata: VaultSchemaMetadata): Promise<void> {
		const validation = validateVaultSchemaMetadata(metadata);
		if (!validation.valid) {
			throw new Error(
				`Refusing to write invalid vault schema metadata: ${validation.errors.join(' ')}`
			);
		}

		await this.ensureDirectory(
			VAULT_SCHEMA_METADATA_PATH.split('/').slice(0, -1).join('/')
		);
		await this.app.vault.adapter.write(
			VAULT_SCHEMA_METADATA_PATH,
			JSON.stringify(metadata, null, 2)
		);
	}

	async ensureDefault(): Promise<VaultSchemaMetadata> {
		const existing = await this.read();
		if (existing) return existing;

		const metadata = createDefaultVaultSchemaMetadata();
		await this.write(metadata);
		return metadata;
	}

	private async ensureDirectory(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (!normalized) return;

		let current = '';
		for (const segment of normalized.split('/').filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			if (await this.app.vault.adapter.exists(current)) continue;
			await this.app.vault.adapter.mkdir(current);
		}
	}
}
