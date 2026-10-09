import { describe, expect, it } from 'vitest';
import {
	WORKSPACE_CATALOG_PATH,
	WorkspaceCatalogService,
	WorkspaceService,
	deriveLegacyWorkspace,
	type WorkspaceCatalog
} from '../src/v2';

describe('legacy Workspace derivation', () => {
	it('derives the standard Charted Roots layout without moving files', () => {
		const result = deriveLegacyWorkspace({
			peopleFolder: 'Charted Roots/People',
			placesFolder: 'Charted Roots/Places',
			mapsFolder: 'Charted Roots/Places/Maps',
			schemasFolder: 'Charted Roots/Schemas',
			canvasesFolder: 'Charted Roots/Canvases',
			universesFolder: 'Charted Roots/Universes',
			organizationsFolder: 'Charted Roots/Organizations',
			sourcesFolder: 'Charted Roots/Sources',
			notesFolder: 'Charted Roots/Notes',
			basesFolder: 'Charted Roots/Bases',
			eventsFolder: 'Charted Roots/Events',
			timelinesFolder: 'Charted Roots/Timelines',
			citationsFolder: 'Charted Roots/Citations',
			reportsFolder: 'Charted Roots/Reports',
			stagingFolder: ''
		});

		expect(result.status).toBe('ready');
		expect(result.workspace).toEqual({
			id: 'default',
			name: 'Default',
			rootFolder: 'Charted Roots',
			mode: 'genealogy',
			enabledPacks: ['core']
		});
		expect(result.reasons).toEqual([]);
	});

	it('supports a custom dedicated root when legacy suffixes remain canonical', () => {
		const result = deriveLegacyWorkspace({
			peopleFolder: 'Projects/My Research/People',
			eventsFolder: 'Projects/My Research/Events',
			sourcesFolder: 'Projects/My Research/Sources',
			mapsFolder: 'Projects/My Research/Places/Maps'
		});

		expect(result.status).toBe('ready');
		expect(result.workspace?.rootFolder).toBe('Projects/My Research');
	});

	it('does not auto-infer custom/scattered folder semantics', () => {
		const result = deriveLegacyWorkspace({
			peopleFolder: 'Research/人物',
			eventsFolder: 'Research/History/Events',
			sourcesFolder: 'Research/史料'
		});

		expect(result.status).toBe('review');
		expect(result.workspace).toBeUndefined();
		expect(result.suggestedRoot).toBe('Research');
		expect(result.reasons.join(' ')).toMatch(/require review/);
	});

	it('does not make the whole vault a Workspace just because folders are at root', () => {
		const result = deriveLegacyWorkspace({
			peopleFolder: 'People',
			eventsFolder: 'Events',
			sourcesFolder: 'Sources'
		});

		expect(result.status).toBe('review');
		expect(result.workspace).toBeUndefined();
		expect(result.reasons.join(' ')).toMatch(/whole vault/);
	});
});

describe('WorkspaceCatalogService', () => {
	function mockApp(initial?: string) {
		const files = new Map<string, string>();
		if (initial !== undefined) files.set(WORKSPACE_CATALOG_PATH, initial);
		const dirs = new Set<string>();

		return {
			app: {
				vault: {
					adapter: {
						exists: async (path: string) => files.has(path) || dirs.has(path),
						read: async (path: string) => {
							const value = files.get(path);
							if (value === undefined) throw new Error('missing');
							return value;
						},
						write: async (path: string, value: string) => {
							files.set(path, value);
						},
						mkdir: async (path: string) => {
							dirs.add(path);
						}
					}
				}
			} as never,
			files,
			dirs
		};
	}

	const catalog: WorkspaceCatalog = {
		version: 1,
		workspaces: [
			{
				id: 'history-cn',
				name: '中国历史',
				rootFolder: 'History/Chinese-History',
				mode: 'historical',
				enabledPacks: ['core', 'chinese-history']
			}
		]
	};

	it('writes and reads a valid catalog independently from vault schema metadata', async () => {
		const { app, files, dirs } = mockApp();
		const service = new WorkspaceCatalogService(app);

		await service.write(catalog);

		expect(dirs.has('.charted-roots')).toBe(true);
		expect(files.has(WORKSPACE_CATALOG_PATH)).toBe(true);
		expect(JSON.parse(files.get(WORKSPACE_CATALOG_PATH)!)).toEqual(catalog);
		await expect(service.read()).resolves.toEqual(catalog);
	});

	it('returns null when no Workspace catalog exists', async () => {
		const { app } = mockApp();
		const service = new WorkspaceCatalogService(app);

		await expect(service.read()).resolves.toBeNull();
	});

	it('reports invalid hand-edited Workspace field types instead of throwing incidental runtime errors', async () => {
		const invalid = JSON.stringify({
			version: 1,
			workspaces: [{
				id: 'bad',
				name: 42,
				rootFolder: 'Bad',
				mode: 'unsupported-mode',
				enabledPacks: ['chinese-history'],
				folders: {
					people: '../Outside',
					unknown_bucket: 'Something'
				}
			}]
		});
		const { app } = mockApp(invalid);
		const service = new WorkspaceCatalogService(app);

		await expect(service.read()).rejects.toThrow(/Workspace name must be a string/);
	});

	it('refuses overlapping Workspace roots from disk', async () => {
		const invalid = JSON.stringify({
			version: 1,
			workspaces: [
				catalog.workspaces[0],
				{
					id: 'nested',
					name: 'Nested',
					rootFolder: 'History/Chinese-History/Nested',
					mode: 'worldbuilding',
					enabledPacks: ['core']
				}
			]
		});
		const { app } = mockApp(invalid);
		const service = new WorkspaceCatalogService(app);

		await expect(service.read()).rejects.toThrow(/overlap/);
	});
});

describe('WorkspaceService', () => {
	const catalog: WorkspaceCatalog = {
		version: 1,
		workspaces: [
			{
				id: 'history-cn',
				name: '中国历史',
				rootFolder: 'History/Chinese-History',
				mode: 'historical',
				enabledPacks: ['core', 'chinese-history']
			},
			{
				id: 'shushan',
				name: '蜀山',
				rootFolder: 'Novels/Shushan',
				mode: 'worldbuilding',
				enabledPacks: ['core']
			}
		]
	};

	function app() {
		return {
			vault: {
				getMarkdownFiles: () => [
					{ path: 'History/Chinese-History/People/Cao-Cao.md' },
					{ path: 'Novels/Shushan/People/Li-Yingqiong.md' }
				]
			}
		} as never;
	}

	it('uses a valid local active selection and falls back when it is stale', () => {
		const selected = new WorkspaceService(app(), catalog, 'shushan');
		expect(selected.getActiveId()).toBe('shushan');

		const fallback = new WorkspaceService(app(), catalog, 'missing');
		expect(fallback.getActiveId()).toBe('history-cn');
	});

	it('notifies on active switch and immediately changes scoped discovery', () => {
		const service = new WorkspaceService(app(), catalog, 'history-cn');
		const changes: string[] = [];
		service.onActiveChange((current, previous) => {
			changes.push(`${previous.id}->${current.id}`);
		});

		expect(service.getScope().getMarkdownFiles().map(file => file.path))
			.toEqual(['History/Chinese-History/People/Cao-Cao.md']);

		service.setActive('shushan');

		expect(changes).toEqual(['history-cn->shushan']);
		expect(service.getScope().getMarkdownFiles().map(file => file.path))
			.toEqual(['Novels/Shushan/People/Li-Yingqiong.md']);
	});

	it('resolves creation paths from the active Workspace', () => {
		const service = new WorkspaceService(app(), catalog, 'history-cn');

		expect(service.resolvePath('people', 'Cao-Cao.md'))
			.toBe('History/Chinese-History/People/Cao-Cao.md');

		service.setActive('shushan');

		expect(service.resolvePath('people', 'Li-Yingqiong.md'))
			.toBe('Novels/Shushan/People/Li-Yingqiong.md');
	});

	it('keeps a valid active id when the catalog is replaced and falls back otherwise', () => {
		const service = new WorkspaceService(app(), catalog, 'shushan');
		const changes: string[] = [];
		service.onActiveChange((current, previous) => {
			changes.push(`${previous.id}->${current.id}`);
		});

		service.replaceCatalog({
			version: 1,
			workspaces: [
				catalog.workspaces[1],
				{
					id: 'novel-b',
					name: '小说 B',
					rootFolder: 'Novels/B',
					mode: 'worldbuilding',
					enabledPacks: ['core']
				}
			]
		});
		expect(service.getActiveId()).toBe('shushan');
		expect(changes).toEqual([]);

		service.replaceCatalog({
			version: 1,
			workspaces: [{
				id: 'history-cn',
				name: '中国历史',
				rootFolder: 'History/Chinese-History',
				mode: 'historical',
				enabledPacks: ['core', 'chinese-history']
			}]
		});
		expect(service.getActiveId()).toBe('history-cn');
		expect(changes).toEqual(['shushan->history-cn']);
	});
});
