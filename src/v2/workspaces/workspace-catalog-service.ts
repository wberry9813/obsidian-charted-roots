import { normalizePath, type App } from 'obsidian';
import { validateWorkspaceCatalog } from './workspace-registry';
import type { WorkspaceCatalog } from './types';

export const WORKSPACE_CATALOG_PATH = '.charted-roots/workspaces.json';

export class WorkspaceCatalogService {
	constructor(private readonly app: App) {}

	async read(): Promise<WorkspaceCatalog | null> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(WORKSPACE_CATALOG_PATH))) return null;

		const raw = await adapter.read(WORKSPACE_CATALOG_PATH);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			throw new Error(
				`Invalid Workspace catalog JSON: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('Invalid Workspace catalog: expected an object.');
		}

		const record = parsed as Record<string, unknown>;
		if (record.version !== 1) {
			throw new Error('Invalid Workspace catalog: version must be 1.');
		}
		if (!Array.isArray(record.workspaces)) {
			throw new Error('Invalid Workspace catalog: workspaces must be an array.');
		}

		const catalog = parsed as WorkspaceCatalog;
		const validation = validateWorkspaceCatalog(catalog);
		if (!validation.valid) {
			throw new Error(
				`Invalid Workspace catalog: ${validation.issues
					.map(issue => issue.message)
					.join(' ')}`
			);
		}
		return catalog;
	}

	async write(catalog: WorkspaceCatalog): Promise<void> {
		if (catalog.version !== 1) {
			throw new Error('Refusing to write Workspace catalog with unsupported version.');
		}

		const validation = validateWorkspaceCatalog(catalog);
		if (!validation.valid) {
			throw new Error(
				`Refusing to write invalid Workspace catalog: ${validation.issues
					.map(issue => issue.message)
					.join(' ')}`
			);
		}

		await this.ensureDirectory(
			WORKSPACE_CATALOG_PATH.split('/').slice(0, -1).join('/')
		);
		await this.app.vault.adapter.write(
			WORKSPACE_CATALOG_PATH,
			JSON.stringify(catalog, null, 2)
		);
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
