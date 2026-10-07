import { describe, expect, it } from 'vitest';
import {
	findDuplicatePlacesByFullName,
	findPlaceNameVariants,
	mergeDuplicatePlaces,
	type PlaceDuplicateGroup
} from '../src/ui/standardize-place-variants-modal';

type FakeFile = {
	path: string;
	basename: string;
};

function file(path: string): FakeFile {
	const name = path.split('/').pop() ?? path;
	return {
		path,
		basename: name.replace(/\.md$/, '')
	};
}

describe('Workspace-scoped destructive place helpers', () => {
	it('finds duplicate places only inside the provided Workspace files', () => {
		const historyA = file('History/Places/Xian-A.md');
		const historyB = file('History/Places/Xian-B.md');
		const fiction = file('Fiction/Places/Xian.md');

		const frontmatter = new Map<string, Record<string, unknown>>([
			[historyA.path, { cr_type: 'place', full_name: 'Xi’an, Shaanxi' }],
			[historyB.path, { cr_type: 'place', full_name: 'Xi’an, Shaanxi' }],
			[fiction.path, { cr_type: 'place', full_name: 'Xi’an, Shaanxi' }]
		]);

		const app = {
			vault: {
				getMarkdownFiles: () => [historyA, historyB, fiction]
			},
			metadataCache: {
				getFileCache: (target: FakeFile) => ({
					frontmatter: frontmatter.get(target.path)
				}),
				getFirstLinkpathDest: () => null
			}
		} as never;

		const groups = findDuplicatePlacesByFullName(
			app,
			() => [historyA, historyB] as never
		);

		expect(groups).toHaveLength(1);
		expect(groups[0].files.map(item => item.path).sort()).toEqual([
			historyA.path,
			historyB.path
		]);
		expect(groups[0].files.some(item => item.path === fiction.path)).toBe(false);
	});

	it('scans place variants only inside the supplied Workspace file set', () => {
		const history = file('History/People/A.md');
		const fiction = file('Fiction/People/B.md');

		const frontmatter = new Map<string, Record<string, unknown>>([
			[history.path, { cr_type: 'person', birth_place: 'United States' }],
			[fiction.path, { cr_type: 'person', birth_place: 'United States of America' }]
		]);

		const app = {
			vault: {
				getMarkdownFiles: () => [history, fiction]
			},
			metadataCache: {
				getFileCache: (target: FakeFile) => ({
					frontmatter: frontmatter.get(target.path)
				})
			}
		} as never;

		const matches = findPlaceNameVariants(
			app,
			() => [history] as never
		);

		expect(matches).toHaveLength(1);
		expect(matches[0]).toMatchObject({
			variant: 'United States',
			canonical: 'USA',
			count: 1
		});
		expect(matches[0].files.map(item => item.path)).toEqual([history.path]);
	});

	it('rewrites references only in the supplied Workspace during a merge', async () => {
		const canonical = file('History/Places/Xian.md');
		const duplicate = file('History/Places/Old-Xian.md');
		const historyPerson = file('History/People/A.md');
		const fictionPerson = file('Fiction/People/B.md');

		const frontmatter = new Map<string, Record<string, unknown>>([
			[historyPerson.path, {
				cr_type: 'person',
				birth_place: '[[History/Places/Old-Xian|Xi’an]]'
			}],
			[fictionPerson.path, {
				cr_type: 'person',
				birth_place: '[[History/Places/Old-Xian|Xi’an]]'
			}]
		]);
		const trashed: string[] = [];

		const app = {
			vault: {
				getMarkdownFiles: () => [historyPerson, fictionPerson, canonical, duplicate]
			},
			metadataCache: {
				getFileCache: (target: FakeFile) => ({
					frontmatter: frontmatter.get(target.path)
				}),
				getFirstLinkpathDest: (target: string) =>
					target === 'History/Places/Old-Xian'
						? duplicate
						: null
			},
			fileManager: {
				processFrontMatter: async (
					target: FakeFile,
					callback: (fm: Record<string, unknown>) => void
				) => {
					const fm = frontmatter.get(target.path);
					if (!fm) throw new Error('Missing fake frontmatter');
					callback(fm);
				},
				trashFile: async (target: FakeFile) => {
					trashed.push(target.path);
				}
			}
		} as never;

		const group: PlaceDuplicateGroup = {
			fullName: 'Xi’an, Shaanxi',
			files: [canonical, duplicate] as never,
			refCounts: new Map(),
			recommendedCanonical: canonical as never
		};

		const result = await mergeDuplicatePlaces(
			app,
			group,
			canonical as never,
			() => [historyPerson, canonical, duplicate] as never
		);

		expect(result).toEqual({
			updatedLinks: 1,
			deletedFiles: 1
		});
		expect(frontmatter.get(historyPerson.path)?.birth_place)
			.toBe('[[Xian|Xi’an]]');
		expect(frontmatter.get(fictionPerson.path)?.birth_place)
			.toBe('[[History/Places/Old-Xian|Xi’an]]');
		expect(trashed).toEqual([duplicate.path]);
	});
});
