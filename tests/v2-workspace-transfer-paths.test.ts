import { describe, expect, it } from 'vitest';
import { resolveWorkspaceTransferFolders } from '../src/ui/workspace-transfer-paths';

describe('Workspace import/export folder resolution', () => {
	it('prefers the active Workspace over legacy global settings', () => {
		const folders: Record<string, string> = {
			people: 'Workspace-E2E/Shushan/People',
			places: 'Workspace-E2E/Shushan/Places',
			events: 'Workspace-E2E/Shushan/Events',
			sources: 'Workspace-E2E/Shushan/Sources',
			citations: 'Workspace-E2E/Shushan/Citations',
			notes: 'Workspace-E2E/Shushan/Notes'
		};
		const plugin = {
			getWorkspaceService: () => ({
				getFolder: (key: string) => folders[key]
			}),
			settings: {
				peopleFolder: 'Charted Roots/People',
				placesFolder: 'Charted Roots/Places',
				eventsFolder: 'Charted Roots/Events',
				sourcesFolder: 'Charted Roots/Sources',
				citationsFolder: 'Charted Roots/Citations',
				notesFolder: 'Charted Roots/Notes'
			}
		} as never;

		expect(resolveWorkspaceTransferFolders(plugin)).toEqual({
			people: 'Workspace-E2E/Shushan/People',
			places: 'Workspace-E2E/Shushan/Places',
			events: 'Workspace-E2E/Shushan/Events',
			sources: 'Workspace-E2E/Shushan/Sources',
			citations: 'Workspace-E2E/Shushan/Citations',
			notes: 'Workspace-E2E/Shushan/Notes'
		});
	});

	it('falls back to legacy settings when Workspace setup is unavailable', () => {
		const plugin = {
			getWorkspaceService: () => null,
			settings: {
				peopleFolder: 'Legacy/People',
				placesFolder: 'Legacy/Places',
				eventsFolder: 'Legacy/Events',
				sourcesFolder: 'Legacy/Sources',
				citationsFolder: 'Legacy/Citations',
				notesFolder: 'Legacy/Notes'
			}
		} as never;

		expect(resolveWorkspaceTransferFolders(plugin)).toEqual({
			people: 'Legacy/People',
			places: 'Legacy/Places',
			events: 'Legacy/Events',
			sources: 'Legacy/Sources',
			citations: 'Legacy/Citations',
			notes: 'Legacy/Notes'
		});
	});
});
