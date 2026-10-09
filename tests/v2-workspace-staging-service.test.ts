import { describe, expect, it } from 'vitest';
import { StagingService } from '../src/core/staging-service';
import { WebClipperService } from '../src/core/web-clipper-service';

function fakeMarkdown(path: string) {
	const name = path.split('/').pop() ?? path;
	const dot = name.lastIndexOf('.');
	return {
		path,
		name,
		basename: dot >= 0 ? name.slice(0, dot) : name,
		extension: dot >= 0 ? name.slice(dot + 1) : ''
	};
}

describe('Workspace staging services', () => {
	it('uses the active Workspace staging folder dynamically', () => {
		let active = 'history';
		const files = [
			fakeMarkdown('Workspace-E2E/History/Staging/history.md'),
			fakeMarkdown('Workspace-E2E/Shushan/Staging/fiction.md'),
			fakeMarkdown('Outside/note.md')
		];

		const app = {
			vault: {
				getMarkdownFiles: () => files
			},
			metadataCache: {
				getFileCache: () => ({ frontmatter: {} })
			}
		} as never;

		const service = new StagingService(
			app,
			{
				enableStagingIsolation: true,
				stagingFolder: 'Charted Roots/Staging'
			} as never,
			{
				stagingFolderProvider: () => active === 'history'
					? 'Workspace-E2E/History/Staging'
					: 'Workspace-E2E/Shushan/Staging'
			}
		);

		expect(service.getStagingFiles().map(file => file.path))
			.toEqual(['Workspace-E2E/History/Staging/history.md']);

		active = 'shushan';

		expect(service.getStagingFiles().map(file => file.path))
			.toEqual(['Workspace-E2E/Shushan/Staging/fiction.md']);
	});

	it('promotes notes into the active Workspace entity folder', async () => {
		let active = 'history';
		const history = fakeMarkdown('Workspace-E2E/History/Staging/History-Event.md');
		const fiction = fakeMarkdown('Workspace-E2E/Shushan/Staging/Fiction-Event.md');
		const renamed: string[] = [];

		const app = {
			vault: {
				getMarkdownFiles: () => [history, fiction],
				getAbstractFileByPath: () => null,
				createFolder: async () => {}
			},
			metadataCache: {
				getFileCache: () => ({
					frontmatter: {
						cr_type: 'event',
						cr_id: 'event-id'
					}
				})
			},
			fileManager: {
				renameFile: async (_file: unknown, path: string) => {
					renamed.push(path);
				},
				processFrontMatter: async () => {}
			}
		} as never;

		const service = new StagingService(
			app,
			{
				enableStagingIsolation: true,
				stagingFolder: 'Charted Roots/Staging',
				eventsFolder: 'Charted Roots/Events',
				peopleFolder: 'Charted Roots/People'
			} as never,
			{
				stagingFolderProvider: () => active === 'history'
					? 'Workspace-E2E/History/Staging'
					: 'Workspace-E2E/Shushan/Staging',
				targetFolderProvider: noteType => noteType === 'event'
					? (active === 'history'
						? 'Workspace-E2E/History/Events'
						: 'Workspace-E2E/Shushan/Events')
					: undefined
			}
		);

		expect(await service.promoteFile(history as never)).toMatchObject({
			success: true,
			newPath: 'Workspace-E2E/History/Events/History-Event.md'
		});

		active = 'shushan';

		expect(await service.promoteFile(fiction as never)).toMatchObject({
			success: true,
			newPath: 'Workspace-E2E/Shushan/Events/Fiction-Event.md'
		});

		expect(renamed).toEqual([
			'Workspace-E2E/History/Events/History-Event.md',
			'Workspace-E2E/Shushan/Events/Fiction-Event.md'
		]);
	});

	it('Web Clipper discovery follows the active Workspace staging folder', () => {
		let active = 'history';
		const history = fakeMarkdown('Workspace-E2E/History/Staging/history-clip.md');
		const fiction = fakeMarkdown('Workspace-E2E/Shushan/Staging/fiction-clip.md');

		const app = {
			vault: {
				getMarkdownFiles: () => [history, fiction]
			},
			metadataCache: {
				getFileCache: () => ({
					frontmatter: { clipped_from: 'https://example.com' }
				})
			}
		} as never;

		const service = new WebClipperService(
			app,
			{
				enableStagingIsolation: true,
				stagingFolder: 'Charted Roots/Staging'
			} as never,
			{
				stagingFolderProvider: () => active === 'history'
					? 'Workspace-E2E/History/Staging'
					: 'Workspace-E2E/Shushan/Staging'
			}
		);

		expect(service.getClippedNotes().map(file => file.path))
			.toEqual(['Workspace-E2E/History/Staging/history-clip.md']);

		active = 'shushan';

		expect(service.getClippedNotes().map(file => file.path))
			.toEqual(['Workspace-E2E/Shushan/Staging/fiction-clip.md']);
	});
});
