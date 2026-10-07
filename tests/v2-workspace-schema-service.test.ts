import { describe, expect, it } from 'vitest';
import { SchemaService } from '../src/schemas/services/schema-service';

function schemaFile(path: string) {
	return {
		path,
		basename: path.split('/').pop()?.replace(/\.md$/, '') ?? path
	};
}

function schemaBody() {
	return [
		'# Schema',
		'',
		'```json',
		JSON.stringify({
			requiredProperties: [],
			properties: {},
			constraints: []
		}, null, 2),
		'```'
	].join('\n');
}

describe('SchemaService Workspace scope', () => {
	it('reloads schema cache when the active Workspace changes', async () => {
		const history = schemaFile('Workspace-E2E/History/Schemas/History-Schema.md');
		const fiction = schemaFile('Workspace-E2E/Shushan/Schemas/Fiction-Schema.md');
		let active = 'history-cn';

		const filesByWorkspace = {
			'history-cn': [history],
			shushan: [fiction]
		};

		const frontmatter = new Map([
			[history.path, {
				cr_type: 'schema',
				cr_id: 'history-schema',
				name: 'History Schema',
				applies_to_type: 'all'
			}],
			[fiction.path, {
				cr_type: 'schema',
				cr_id: 'fiction-schema',
				name: 'Fiction Schema',
				applies_to_type: 'all'
			}]
		]);

		const plugin = {
			settings: { schemasFolder: 'Charted Roots/Schemas' },
			app: {
				vault: {
					getMarkdownFiles: () => [history, fiction],
					read: async () => schemaBody()
				},
				metadataCache: {
					getFileCache: (file: { path: string }) => ({
						frontmatter: frontmatter.get(file.path)
					})
				}
			},
			getWorkspaceService: () => ({
				getActiveId: () => active,
				getScope: () => ({
					getMarkdownFiles: () => filesByWorkspace[active as keyof typeof filesByWorkspace]
				}),
				getFolder: (kind: string) => `Workspace-E2E/${active === 'history-cn' ? 'History' : 'Shushan'}/${kind === 'schemas' ? 'Schemas' : kind}`
			})
		} as never;

		const service = new SchemaService(plugin);

		expect((await service.getAllSchemas()).map(schema => schema.cr_id))
			.toEqual(['history-schema']);

		active = 'shushan';

		expect((await service.getAllSchemas()).map(schema => schema.cr_id))
			.toEqual(['fiction-schema']);
	});

	it('creates a schema under the active Workspace Schemas folder', async () => {
		let createdPath = '';
		let active = 'history-cn';

		const plugin = {
			settings: { schemasFolder: 'Charted Roots/Schemas' },
			app: {
				vault: {
					getMarkdownFiles: () => [],
					getAbstractFileByPath: () => null,
					createFolder: async () => {},
					create: async (path: string) => {
						createdPath = path;
						return schemaFile(path);
					},
					read: async () => schemaBody()
				},
				metadataCache: {
					getFileCache: () => null
				}
			},
			getWorkspaceService: () => ({
				getActiveId: () => active,
				getScope: () => ({ getMarkdownFiles: () => [] }),
				getFolder: () => active === 'history-cn'
					? 'Workspace-E2E/History/Schemas'
					: 'Workspace-E2E/Shushan/Schemas'
			})
		} as never;

		const service = new SchemaService(plugin);
		await service.createSchema({
			cr_id: 'created-schema',
			name: 'Created Schema',
			appliesToType: 'all',
			definition: {
				requiredProperties: [],
				properties: {},
				constraints: []
			}
		});

		expect(createdPath).toBe('Workspace-E2E/History/Schemas/Created Schema.md');

		active = 'shushan';
		await service.createSchema({
			cr_id: 'fiction-created-schema',
			name: 'Fiction Created Schema',
			appliesToType: 'all',
			definition: {
				requiredProperties: [],
				properties: {},
				constraints: []
			}
		});

		expect(createdPath).toBe('Workspace-E2E/Shushan/Schemas/Fiction Created Schema.md');
	});
});
