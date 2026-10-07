import type CanvasRootsPlugin from '../../main';

export interface WorkspaceTransferFolders {
	people: string;
	places: string;
	events: string;
	sources: string;
	citations: string;
	notes: string;
}

/**
 * Resolve entity-transfer folders from the active Workspace first, while
 * preserving legacy settings as a fallback for vaults that still need manual
 * Workspace setup.
 */
export function resolveWorkspaceTransferFolders(
	plugin: Pick<CanvasRootsPlugin, 'getWorkspaceService' | 'settings'>
): WorkspaceTransferFolders {
	const workspace = plugin.getWorkspaceService();

	return {
		people: workspace?.getFolder('people')
			?? plugin.settings.peopleFolder
			?? 'People',
		places: workspace?.getFolder('places')
			?? plugin.settings.placesFolder
			?? 'Places',
		events: workspace?.getFolder('events')
			?? plugin.settings.eventsFolder
			?? 'Events',
		sources: workspace?.getFolder('sources')
			?? plugin.settings.sourcesFolder
			?? 'Sources',
		citations: workspace?.getFolder('citations')
			?? plugin.settings.citationsFolder
			?? 'Charted Roots/Citations',
		notes: workspace?.getFolder('notes')
			?? plugin.settings.notesFolder
			?? 'Charted Roots/Notes'
	};
}
