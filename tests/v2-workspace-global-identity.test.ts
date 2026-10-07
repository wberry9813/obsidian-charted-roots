import { describe, expect, it } from 'vitest';
import {
	AssertionService,
	V2Linter,
	WorkspaceRegistry,
	WorkspaceScope,
	createV2OntologyRegistry
} from '../src/v2';

function makeFile(path: string) {
	return { path } as never;
}

describe('Workspace identity boundary', () => {
	it('keeps cr_id uniqueness vault-global even when active Workspace discovery is isolated', () => {
		const history = makeFile('History/People/Same-Id.md');
		const fiction = makeFile('Fiction/People/Same-Id.md');
		const files = [history, fiction];
		const frontmatter = new Map([
			[history.path, {
				cr_schema: 2,
				cr_type: 'person',
				cr_id: 'globally-unique-id'
			}],
			[fiction.path, {
				cr_schema: 2,
				cr_type: 'person',
				cr_id: 'globally-unique-id'
			}]
		]);

		const app = {
			vault: {
				getMarkdownFiles: () => files
			},
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatter.get(file.path)
				})
			}
		} as never;

		const registry = new WorkspaceRegistry({
			version: 1,
			activeWorkspaceId: 'history',
			workspaces: [
				{
					id: 'history',
					name: 'History',
					rootFolder: 'History',
					mode: 'historical',
					enabledPacks: ['core']
				},
				{
					id: 'fiction',
					name: 'Fiction',
					rootFolder: 'Fiction',
					mode: 'worldbuilding',
					enabledPacks: ['core']
				}
			]
		});
		const scope = new WorkspaceScope(app, registry);

		// Ordinary discovery sees only the active Workspace.
		expect(scope.getMarkdownFiles().map(file => file.path)).toEqual([
			'History/People/Same-Id.md'
		]);

		// Identity integrity deliberately scans the whole Obsidian vault.
		const assertions = new AssertionService(app, createV2OntologyRegistry(), {
			fileProvider: () => scope.getMarkdownFiles()
		});
		const issues = new V2Linter(
			app,
			createV2OntologyRegistry(),
			assertions
		).lint();

		expect(issues).toEqual(expect.arrayContaining([
			expect.objectContaining({
				code: 'duplicate_cr_id',
				crId: 'globally-unique-id'
			})
		]));
	});
});
