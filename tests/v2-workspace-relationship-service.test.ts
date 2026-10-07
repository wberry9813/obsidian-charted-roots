import { describe, expect, it } from 'vitest';
import { RelationshipService } from '../src/relationships/services/relationship-service';

describe('RelationshipService Workspace scope', () => {
	it('rebuilds relationship and cr_id caches when the active Workspace changes', () => {
		let activeWorkspaceId = 'history';
		const files = [
			{ path: 'Workspace-E2E/History/People/History-A.md' },
			{ path: 'Workspace-E2E/Shushan/People/Fiction-A.md' },
			{ path: 'Workspace-E2E/Shushan/People/Fiction-B.md' }
		];
		const frontmatter = new Map<string, Record<string, unknown>>([
			['Workspace-E2E/History/People/History-A.md', {
				cr_type: 'person',
				cr_id: 'history-a',
				name: 'History A',
				mentor: ['[[History Mentor]]'],
				mentor_id: ['history-mentor']
			}],
			['Workspace-E2E/Shushan/People/Fiction-A.md', {
				cr_type: 'person',
				cr_id: 'fiction-a',
				name: 'Fiction A',
				mentor: ['[[Fiction Mentor A]]'],
				mentor_id: ['fiction-mentor-a']
			}],
			['Workspace-E2E/Shushan/People/Fiction-B.md', {
				cr_type: 'person',
				cr_id: 'fiction-b',
				name: 'Fiction B',
				mentor: ['[[Fiction Mentor B]]'],
				mentor_id: ['fiction-mentor-b']
			}]
		]);

		const filesForActiveWorkspace = () => files.filter(file =>
			activeWorkspaceId === 'history'
				? file.path.startsWith('Workspace-E2E/History/')
				: file.path.startsWith('Workspace-E2E/Shushan/')
		);

		const plugin = {
			settings: {
				showBuiltInRelationshipTypes: true,
				customRelationshipTypes: [],
				customRelationshipCategories: [],
				relationshipCategoryCustomizations: {}
			},
			app: {
				vault: {
					getMarkdownFiles: () => files
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => ({
						frontmatter: frontmatter.get(file.path)
					})
				}
			},
			getWorkspaceService: () => ({
				getActiveId: () => activeWorkspaceId,
				getScope: () => ({
					getMarkdownFiles: filesForActiveWorkspace
				})
			}),
			saveSettings: async () => undefined
		} as never;

		const service = new RelationshipService(plugin);

		const historyRelationships = service.getAllRelationships();
		expect(historyRelationships).toHaveLength(1);
		expect(historyRelationships[0]).toMatchObject({
			sourceCrId: 'history-a',
			targetCrId: 'history-mentor',
			type: { id: 'mentor' }
		});
		expect(service.getFilePathByCrId('history-a'))
			.toBe('Workspace-E2E/History/People/History-A.md');
		expect(service.getFilePathByCrId('fiction-a')).toBeUndefined();

		// No forceRefresh call: changing the active Workspace must invalidate the
		// effective cache by itself.
		activeWorkspaceId = 'shushan';

		const fictionRelationships = service.getAllRelationships();
		expect(fictionRelationships).toHaveLength(2);
		expect(fictionRelationships.map(rel => rel.sourceCrId).sort())
			.toEqual(['fiction-a', 'fiction-b']);
		expect(service.getFilePathByCrId('history-a')).toBeUndefined();
		expect(service.getFilePathByCrId('fiction-a'))
			.toBe('Workspace-E2E/Shushan/People/Fiction-A.md');
	});

	it('falls back to whole-vault discovery when Workspace Foundation is unavailable', () => {
		const file = { path: 'People/A.md' };
		const plugin = {
			settings: {
				showBuiltInRelationshipTypes: true,
				customRelationshipTypes: [],
				customRelationshipCategories: [],
				relationshipCategoryCustomizations: {}
			},
			app: {
				vault: { getMarkdownFiles: () => [file] },
				metadataCache: {
					getFileCache: () => ({
						frontmatter: {
							cr_type: 'person',
							cr_id: 'a',
							mentor: ['[[B]]'],
							mentor_id: ['b']
						}
					})
				}
			},
			getWorkspaceService: () => null,
			saveSettings: async () => undefined
		} as never;

		const service = new RelationshipService(plugin);
		expect(service.getAllRelationships()).toHaveLength(1);
	});
});
