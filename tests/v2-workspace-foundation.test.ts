import { describe, expect, it } from 'vitest';
import {
	WorkspacePathResolver,
	WorkspaceRegistry,
	WorkspaceScope,
	validateWorkspaceConfiguration,
	type WorkspaceConfiguration,
	type WorkspaceDefinition
} from '../src/v2';

const history: WorkspaceDefinition = {
	id: 'history-cn',
	name: '中国历史',
	rootFolder: 'History/Chinese-History',
	mode: 'historical',
	enabledPacks: ['core', 'chinese-history']
};

const shushan: WorkspaceDefinition = {
	id: 'shushan',
	name: '蜀山',
	rootFolder: 'Novels/Shushan',
	mode: 'worldbuilding',
	enabledPacks: ['core']
};

function config(
	workspaces: WorkspaceDefinition[] = [history, shushan],
	activeWorkspaceId = 'history-cn'
): WorkspaceConfiguration {
	return {
		version: 1,
		activeWorkspaceId,
		workspaces
	};
}

describe('Workspace configuration validation', () => {
	it('accepts independent workspace roots', () => {
		const result = validateWorkspaceConfiguration(config());

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it('rejects equal and nested workspace roots', () => {
		const duplicate = validateWorkspaceConfiguration(config([
			history,
			{ ...shushan, rootFolder: 'History/Chinese-History' }
		]));
		expect(duplicate.valid).toBe(false);
		expect(duplicate.issues.some(issue => issue.code === 'duplicate_root')).toBe(true);

		const nested = validateWorkspaceConfiguration(config([
			history,
			{ ...shushan, rootFolder: 'History/Chinese-History/Fiction' }
		]));
		expect(nested.valid).toBe(false);
		expect(nested.issues.some(issue => issue.code === 'overlapping_root')).toBe(true);
	});

	it('rejects an empty registry, missing active workspace, and unsafe root paths', () => {
		const empty = validateWorkspaceConfiguration({
			version: 1,
			activeWorkspaceId: '',
			workspaces: []
		});
		expect(empty.issues.some(issue => issue.code === 'empty_registry')).toBe(true);

		const missingActive = validateWorkspaceConfiguration(config([history], 'missing'));
		expect(missingActive.issues.some(issue => issue.code === 'missing_active_workspace')).toBe(true);

		for (const rootFolder of ['/Absolute', '../Outside', './Relative']) {
			const unsafe = validateWorkspaceConfiguration(config([
				{ ...history, rootFolder }
			]));
			expect(unsafe.issues.some(issue => issue.code === 'invalid_root')).toBe(true);
		}
	});

	it('rejects folder overrides that can escape the workspace root', () => {
		const result = validateWorkspaceConfiguration(config([
			{
				...history,
				folders: {
					people: '../People',
					sources: '/Sources'
				}
			}
		]));

		expect(result.valid).toBe(false);
		expect(result.issues.filter(issue => issue.code === 'invalid_folder_override'))
			.toHaveLength(2);
	});
});

describe('WorkspaceRegistry', () => {
	it('switches active workspace without changing definitions', () => {
		const registry = new WorkspaceRegistry(config());

		expect(registry.getActive().id).toBe('history-cn');
		registry.setActive('shushan');
		expect(registry.getActive().id).toBe('shushan');
		expect(registry.getAll().map(workspace => workspace.id))
			.toEqual(['history-cn', 'shushan']);
	});

	it('rejects updates that would introduce root overlap', () => {
		const registry = new WorkspaceRegistry(config());

		expect(() => registry.update('shushan', {
			...shushan,
			rootFolder: 'History/Chinese-History/Novel'
		})).toThrow(/overlap/);
	});

	it('moves active selection to a remaining workspace when the active one is removed', () => {
		const registry = new WorkspaceRegistry(config());

		registry.remove('history-cn');

		expect(registry.getActive().id).toBe('shushan');
		expect(registry.getAll()).toHaveLength(1);
		expect(() => registry.remove('shushan')).toThrow(/At least one Workspace/);
	});

	it('returns defensive copies of workspace definitions', () => {
		const registry = new WorkspaceRegistry(config());
		const copy = registry.getActive();

		copy.name = 'Mutated outside registry';
		copy.enabledPacks.push('unexpected');
		copy.folders = { people: 'Elsewhere' };

		const again = registry.getActive();
		expect(again.name).toBe('中国历史');
		expect(again.enabledPacks).toEqual(['core', 'chinese-history']);
		expect(again.folders).toBeUndefined();
	});
});

describe('WorkspacePathResolver', () => {
	it('resolves default folders under the workspace root', () => {
		const resolver = new WorkspacePathResolver();

		expect(resolver.getFolder(history, 'people'))
			.toBe('History/Chinese-History/People');
		expect(resolver.getFolder(history, 'assertions'))
			.toBe('History/Chinese-History/Assertions');
		expect(resolver.getFolder(history, 'timelines'))
			.toBe('History/Chinese-History/Timelines');
		expect(resolver.getFolder(history, 'reports'))
			.toBe('History/Chinese-History/Reports');
		expect(resolver.resolve(history, 'people', 'Cao-Cao.md'))
			.toBe('History/Chinese-History/People/Cao-Cao.md');
	});

	it('supports user-defined localized folder names without changing semantics', () => {
		const resolver = new WorkspacePathResolver();
		const localized: WorkspaceDefinition = {
			...history,
			folders: {
				people: '人物',
				places: '地理',
				sources: '史料/原始材料'
			}
		};

		expect(resolver.getFolder(localized, 'people'))
			.toBe('History/Chinese-History/人物');
		expect(resolver.getFolder(localized, 'places'))
			.toBe('History/Chinese-History/地理');
		expect(resolver.getFolder(localized, 'sources'))
			.toBe('History/Chinese-History/史料/原始材料');
	});
});

describe('WorkspaceScope', () => {
	function mockApp() {
		const files = [
			{ path: 'History/Chinese-History/People/Cao-Cao.md' },
			{ path: 'History/Chinese-History/Events/Guandu.md' },
			{ path: 'Novels/Shushan/People/Li-Yingqiong.md' },
			{ path: 'Novels/Shushan/Events/Battle.md' },
			{ path: 'Daily Notes/2026-10-07.md' }
		];
		return {
			app: {
				vault: {
					getMarkdownFiles: () => files
				}
			} as never,
			files
		};
	}

	it('returns only markdown files under the active workspace root', () => {
		const { app } = mockApp();
		const registry = new WorkspaceRegistry(config());
		const scope = new WorkspaceScope(app, registry);

		expect(scope.getMarkdownFiles().map(file => file.path)).toEqual([
			'History/Chinese-History/People/Cao-Cao.md',
			'History/Chinese-History/Events/Guandu.md'
		]);

		registry.setActive('shushan');

		expect(scope.getMarkdownFiles().map(file => file.path)).toEqual([
			'Novels/Shushan/People/Li-Yingqiong.md',
			'Novels/Shushan/Events/Battle.md'
		]);
	});

	it('ignores normal Obsidian notes outside every workspace', () => {
		const { app } = mockApp();
		const registry = new WorkspaceRegistry(config());
		const scope = new WorkspaceScope(app, registry);

		expect(scope.getWorkspaceForPath('Daily Notes/2026-10-07.md')).toBeUndefined();
		expect(scope.containsPath('Daily Notes/2026-10-07.md')).toBe(false);
	});

	it('derives ownership from the current path rather than frontmatter', () => {
		const { app } = mockApp();
		const registry = new WorkspaceRegistry(config());
		const scope = new WorkspaceScope(app, registry);

		expect(scope.getWorkspaceForPath(
			'History/Chinese-History/People/Same-Note.md'
		)?.id).toBe('history-cn');

		expect(scope.getWorkspaceForPath(
			'Novels/Shushan/People/Same-Note.md'
		)?.id).toBe('shushan');
	});

	it('can explicitly query a non-active workspace without changing active state', () => {
		const { app } = mockApp();
		const registry = new WorkspaceRegistry(config());
		const scope = new WorkspaceScope(app, registry);

		expect(scope.getActiveWorkspace().id).toBe('history-cn');
		expect(scope.getMarkdownFiles('shushan').map(file => file.path)).toEqual([
			'Novels/Shushan/People/Li-Yingqiong.md',
			'Novels/Shushan/Events/Battle.md'
		]);
		expect(scope.getActiveWorkspace().id).toBe('history-cn');
	});
});
