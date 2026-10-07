import { describe, expect, it } from 'vitest';
import { MapDataService } from '../src/maps/map-data-service';

describe('MapDataService Workspace scope', () => {
	it('uses the active Workspace as the dataset boundary for both people and places', async () => {
		let activeWorkspaceId = 'history';
		const files = [
			{ path: 'Workspace-E2E/History/People/History-Person.md', basename: 'History-Person' },
			{ path: 'Workspace-E2E/History/Places/History-Place.md', basename: 'History-Place' },
			{ path: 'Workspace-E2E/Shushan/People/Fiction-Person.md', basename: 'Fiction-Person' },
			{ path: 'Workspace-E2E/Shushan/Places/Fiction-Place.md', basename: 'Fiction-Place' }
		];
		const frontmatter = new Map<string, Record<string, unknown>>([
			['Workspace-E2E/History/People/History-Person.md', {
				cr_type: 'person',
				cr_id: 'history-person',
				name: 'History Person',
				born: '1900',
				birth_place: '[[History Place]]',
				birth_place_id: 'history-place'
			}],
			['Workspace-E2E/History/Places/History-Place.md', {
				cr_type: 'place',
				cr_id: 'history-place',
				name: 'History Place',
				latitude: 10,
				longitude: 20
			}],
			['Workspace-E2E/Shushan/People/Fiction-Person.md', {
				cr_type: 'person',
				cr_id: 'fiction-person',
				name: 'Fiction Person',
				born: '2000',
				birth_place: '[[Fiction Place]]',
				birth_place_id: 'fiction-place'
			}],
			['Workspace-E2E/Shushan/Places/Fiction-Place.md', {
				cr_type: 'place',
				cr_id: 'fiction-place',
				name: 'Fiction Place',
				latitude: 30,
				longitude: 40
			}]
		]);

		const filesForActiveWorkspace = () => files.filter(file =>
			activeWorkspaceId === 'history'
				? file.path.startsWith('Workspace-E2E/History/')
				: file.path.startsWith('Workspace-E2E/Shushan/')
		);

		const plugin = {
			settings: {
				// Deliberately wrong for both Workspaces. Workspace mode must not
				// stack this legacy global folder on top of Workspace scope.
				peopleFolder: 'Charted Roots/People',
				noteTypeDetection: undefined
			},
			app: {
				vault: { getMarkdownFiles: () => files },
				metadataCache: {
					getFileCache: (file: { path: string }) => ({
						frontmatter: frontmatter.get(file.path)
					})
				}
			},
			getWorkspaceService: () => ({
				getScope: () => ({ getMarkdownFiles: filesForActiveWorkspace })
			})
		} as never;

		const service = new MapDataService(plugin);

		const history = await service.getMapData({});
		expect(history.markers.map(marker => marker.personId)).toEqual(['history-person']);
		expect(history.placeMarkers.map(marker => marker.placeId)).toEqual(['history-place']);

		activeWorkspaceId = 'shushan';

		const shushan = await service.getMapData({});
		expect(shushan.markers.map(marker => marker.personId)).toEqual(['fiction-person']);
		expect(shushan.placeMarkers.map(marker => marker.placeId)).toEqual(['fiction-place']);
	});

	it('preserves legacy peopleFolder filtering when Workspace Foundation is unavailable', async () => {
		const files = [
			{ path: 'Legacy People/A.md', basename: 'A' },
			{ path: 'Elsewhere/B.md', basename: 'B' },
			{ path: 'Places/Place.md', basename: 'Place' }
		];
		const frontmatter = new Map<string, Record<string, unknown>>([
			['Legacy People/A.md', {
				cr_type: 'person',
				cr_id: 'a',
				name: 'A',
				birth_place_id: 'place'
			}],
			['Elsewhere/B.md', {
				cr_type: 'person',
				cr_id: 'b',
				name: 'B',
				birth_place_id: 'place'
			}],
			['Places/Place.md', {
				cr_type: 'place',
				cr_id: 'place',
				name: 'Place',
				latitude: 1,
				longitude: 2
			}]
		]);

		const plugin = {
			settings: {
				peopleFolder: 'Legacy People',
				noteTypeDetection: undefined
			},
			app: {
				vault: { getMarkdownFiles: () => files },
				metadataCache: {
					getFileCache: (file: { path: string }) => ({
						frontmatter: frontmatter.get(file.path)
					})
				}
			},
			getWorkspaceService: () => null
		} as never;

		const data = await new MapDataService(plugin).getMapData({});
		expect(data.markers.map(marker => marker.personId)).toEqual(['a']);
		expect(data.placeMarkers.map(marker => marker.placeId)).toEqual(['place']);
	});
	it('carries stable Place cr_id on migration-path endpoints', async () => {
		const files = [
			{ path: 'People/A.md', basename: 'A' },
			{ path: 'Places/Birth.md', basename: 'Birth' },
			{ path: 'Places/Death.md', basename: 'Death' }
		];
		const frontmatter = new Map<string, Record<string, unknown>>([
			['People/A.md', {
				cr_type: 'person',
				cr_id: 'person-a',
				name: 'A',
				born: '1900',
				died: '1950',
				birth_place: '[[Birth]]',
				birth_place_id: 'place-birth',
				death_place: '[[Death]]',
				death_place_id: 'place-death'
			}],
			['Places/Birth.md', {
				cr_type: 'place',
				cr_id: 'place-birth',
				name: 'Birth',
				latitude: 10,
				longitude: 20
			}],
			['Places/Death.md', {
				cr_type: 'place',
				cr_id: 'place-death',
				name: 'Death',
				latitude: 30,
				longitude: 40
			}]
		]);
		const plugin = {
			settings: {
				peopleFolder: 'People',
				noteTypeDetection: undefined
			},
			app: {
				vault: { getMarkdownFiles: () => files },
				metadataCache: {
					getFileCache: (file: { path: string }) => ({
						frontmatter: frontmatter.get(file.path)
					})
				}
			},
			getWorkspaceService: () => null
		} as never;

		const data = await new MapDataService(plugin).getMapData({});
		expect(data.paths).toHaveLength(1);
		expect(data.paths[0].origin).toMatchObject({
			name: 'Birth',
			placeId: 'place-birth'
		});
		expect(data.paths[0].destination).toMatchObject({
			name: 'Death',
			placeId: 'place-death'
		});
	});

});
