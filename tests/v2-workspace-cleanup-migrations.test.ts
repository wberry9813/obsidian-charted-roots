import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { SourceMigrationService } from '../src/sources/services/source-migration-service';
import { SourcedFactsMigrationService } from '../src/sources/services/sourced-facts-migration-service';
import { EventPersonMigrationService } from '../src/events/services/event-person-migration-service';
import { LifeEventsMigrationService } from '../src/events/services/life-events-migration-service';

interface FakeFile {
	path: string;
	basename: string;
}

function file(path: string): FakeFile {
	const name = path.split('/').pop() ?? path;
	return {
		path,
		basename: name.replace(/\.md$/, '')
	};
}

function appWithFrontmatter(
	files: FakeFile[],
	frontmatter: Map<string, Record<string, unknown>>
) {
	return {
		vault: {
			getMarkdownFiles: () => files
		},
		metadataCache: {
			getFileCache: (entry: FakeFile) => ({
				frontmatter: frontmatter.get(entry.path)
			})
		}
	} as never;
}

describe('Workspace-scoped cleanup migrations', () => {
	it('does not detect indexed source fields outside the supplied Workspace', () => {
		const history = file('History/People/A.md');
		const fiction = file('Fiction/People/B.md');
		const fm = new Map([
			[history.path, { cr_type: 'person', cr_id: 'a', source: '[[History Source]]' }],
			[fiction.path, { cr_type: 'person', cr_id: 'b', source: '[[Fiction Source]]' }]
		]);
		const app = appWithFrontmatter([history, fiction], fm);
		const service = new SourceMigrationService(
			app,
			DEFAULT_SETTINGS,
			() => [history] as never[]
		);

		expect(service.detectIndexedSources().map(note => note.file.path))
			.toEqual([history.path]);
		expect(service.getIndexedSourceCount()).toBe(1);
	});

	it('does not detect sourced_facts outside the supplied Workspace', () => {
		const history = file('History/People/A.md');
		const fiction = file('Fiction/People/B.md');
		const sourcedFacts = {
			birth_date: { sources: ['[[Source]]'] }
		};
		const fm = new Map([
			[history.path, { cr_type: 'person', cr_id: 'a', sourced_facts: sourcedFacts }],
			[fiction.path, { cr_type: 'person', cr_id: 'b', sourced_facts: sourcedFacts }]
		]);
		const app = appWithFrontmatter([history, fiction], fm);
		const service = new SourcedFactsMigrationService(
			app,
			DEFAULT_SETTINGS,
			() => [history] as never[]
		);

		expect(service.detectLegacySourcedFacts().map(note => note.file.path))
			.toEqual([history.path]);
		expect(service.hasLegacySourcedFacts()).toBe(true);
	});

	it('does not detect legacy Event person fields outside the supplied Workspace', () => {
		const history = file('History/Events/A.md');
		const fiction = file('Fiction/Events/B.md');
		const fm = new Map([
			[history.path, { cr_type: 'event', cr_id: 'event-a', person: '[[A]]' }],
			[fiction.path, { cr_type: 'event', cr_id: 'event-b', person: '[[B]]' }]
		]);
		const app = appWithFrontmatter([history, fiction], fm);
		const service = new EventPersonMigrationService(
			app,
			DEFAULT_SETTINGS,
			() => [history] as never[]
		);

		expect(service.detectLegacyPersonProperty().map(note => note.file.path))
			.toEqual([history.path]);
		expect(service.hasLegacyPersonProperties()).toBe(true);
	});

	it('scopes inline Life Events discovery and creates Event notes in the Workspace folder', async () => {
		const history = file('History/People/A.md');
		const fiction = file('Fiction/People/B.md');
		const fm = new Map([
			[history.path, {
				cr_type: 'person',
				cr_id: 'a',
				name: 'A',
				events: [{ event_type: 'residence', date_from: '2000' }]
			}],
			[fiction.path, {
				cr_type: 'person',
				cr_id: 'b',
				name: 'B',
				events: [{ event_type: 'residence', date_from: '2001' }]
			}]
		]);
		const created: string[] = [];
		const app = {
			vault: {
				getMarkdownFiles: () => [history, fiction],
				getAbstractFileByPath: () => null,
				createFolder: async () => undefined,
				create: async (path: string) => {
					created.push(path);
					return file(path);
				}
			},
			metadataCache: {
				getFileCache: (entry: FakeFile) => ({
					frontmatter: fm.get(entry.path)
				})
			},
			fileManager: {
				processFrontMatter: async () => undefined
			}
		} as never;

		const service = new LifeEventsMigrationService(
			app,
			DEFAULT_SETTINGS,
			() => [history] as never[],
			() => 'History/Events'
		);

		const notes = service.detectInlineEvents();
		expect(notes.map(note => note.file.path)).toEqual([history.path]);
		expect(service.hasInlineEvents()).toBe(true);

		const result = await service.migrateToEventNotes(notes);
		expect(result.eventNotesCreated).toBe(1);
		expect(created).toHaveLength(1);
		expect(created[0]).toMatch(/^History\/Events\//);
	});
});
