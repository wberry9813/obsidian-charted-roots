import { describe, expect, it } from 'vitest';
import { RecentFilesService } from '../src/core/recent-files-service';

describe('RecentFilesService Workspace visibility', () => {
	it('keeps global history but exposes only active Workspace entries', () => {
		let active = 'history';
		const entries = [
			{
				path: 'Workspace-E2E/History/People/History-Person.md',
				name: 'History Person',
				type: 'person',
				timestamp: 3
			},
			{
				path: 'Workspace-E2E/Shushan/People/Fiction-Person.md',
				name: 'Fiction Person',
				type: 'person',
				timestamp: 2
			},
			{
				path: 'Outside/Deleted.md',
				name: 'Deleted',
				type: 'person',
				timestamp: 1
			}
		];

		const plugin = {
			settings: {
				dashboardRecentFiles: entries
			},
			app: {
				vault: {
					getAbstractFileByPath: (path: string) =>
						path === 'Outside/Deleted.md' ? null : { path }
				}
			},
			getWorkspaceService: () => ({
				getScope: () => ({
					containsPath: (path: string) =>
						active === 'history'
							? path.startsWith('Workspace-E2E/History/')
							: path.startsWith('Workspace-E2E/Shushan/')
				})
			})
		} as never;

		const service = new RecentFilesService(plugin);

		expect(service.getValidRecentFiles().map(item => item.name))
			.toEqual(['History Person']);
		expect(service.getRecentFiles()).toHaveLength(3);

		active = 'shushan';

		expect(service.getValidRecentFiles().map(item => item.name))
			.toEqual(['Fiction Person']);
		expect(service.getRecentFiles()).toHaveLength(3);
	});
});
