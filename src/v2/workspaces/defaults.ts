import type { WorkspaceFolderKey, WorkspaceMode } from './types';

export const DEFAULT_WORKSPACE_FOLDERS: Record<WorkspaceFolderKey, string> = {
	people: 'People',
	places: 'Places',
	organizations: 'Organizations',
	offices: 'Offices',
	events: 'Events',
	processes: 'Processes',
	periods: 'Periods',
	assertions: 'Assertions',
	claims: 'Claims',
	sources: 'Sources',
	citations: 'Citations',
	research: 'Research',
	maps: 'Maps',
	universes: 'Universes',
	schemas: 'Schemas',
	canvases: 'Canvases',
	staging: 'Staging',
	notes: 'Notes',
	bases: 'Bases',
	timelines: 'Timelines',
	reports: 'Reports'
};

export function defaultPacksForMode(mode: WorkspaceMode): string[] {
	switch (mode) {
		case 'historical':
			return ['core'];
		case 'genealogy':
		case 'worldbuilding':
			return ['core'];
	}
}
