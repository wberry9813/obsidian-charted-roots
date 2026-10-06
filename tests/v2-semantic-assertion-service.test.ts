import { describe, expect, it } from 'vitest';
import { SemanticAssertionService } from '../src/v2';
import type { AssertionService } from '../src/v2';

function fakeFile(path: string) {
	const name = path.split('/').pop() ?? path;
	const basename = name.replace(/\.md$/, '');
	return { path, name, basename, extension: 'md' } as never;
}

describe('SemanticAssertionService', () => {
	it('projects compact father frontmatter as a virtual Assertion without materializing a note', () => {
		const caoCao = fakeFile('People/Cao-Cao.md');
		const caoSong = fakeFile('People/Cao-Song.md');
		const frontmatter = new Map([
			['People/Cao-Cao.md', {
				cr_schema: 2,
				cr_type: 'person',
				cr_id: 'person-cao-cao',
				name: '曹操',
				father: '[[People/Cao-Song|曹嵩]]'
			}],
			['People/Cao-Song.md', {
				cr_schema: 2,
				cr_type: 'person',
				cr_id: 'person-cao-song',
				name: '曹嵩'
			}]
		]);

		const app = {
			vault: {
				getMarkdownFiles: () => [caoCao, caoSong]
			},
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatter.get(file.path)
				})
			}
		} as never;

		const materialized = {
			getAll: () => []
		} as unknown as AssertionService;

		const service = new SemanticAssertionService(app, materialized);
		const all = service.getAll();

		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({
			assertionType: 'relationship',
			predicate: 'father',
			subject: '[[Cao-Cao|曹操]]',
			object: '[[People/Cao-Song|曹嵩]]',
			origin: 'frontmatter'
		});
		expect(all[0].materialized).toBeUndefined();
	});

	it('accepts v2 plural spouses and deduplicates reciprocal spouse edges', () => {
		const a = fakeFile('People/A.md');
		const b = fakeFile('People/B.md');
		const frontmatter = new Map([
			['People/A.md', {
				cr_schema: 2,
				cr_type: 'person',
				cr_id: 'a',
				name: 'A',
				spouses: ['[[People/B|B]]']
			}],
			['People/B.md', {
				cr_schema: 2,
				cr_type: 'person',
				cr_id: 'b',
				name: 'B',
				spouse: '[[People/A|A]]'
			}]
		]);

		const files = new Map([
			['People/A.md', a],
			['People/B.md', b]
		]);
		const byBasename = new Map([
			['A', a],
			['B', b]
		]);
		const app = {
			vault: {
				getMarkdownFiles: () => [a, b],
				getAbstractFileByPath: (path: string) => files.get(
					path.endsWith('.md') ? path : `${path}.md`
				) ?? null
			},
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatter.get(file.path)
				}),
				getFirstLinkpathDest: (linkPath: string) => {
					const normalized = linkPath.replace(/\.md$/, '');
					const exact = files.get(`${normalized}.md`);
					if (exact) return exact;
					return byBasename.get(normalized.split('/').pop() ?? normalized) ?? null;
				}
			}
		} as never;

		const materialized = { getAll: () => [] } as unknown as AssertionService;
		const service = new SemanticAssertionService(app, materialized);
		const spouseAssertions = service.getByPredicate('spouse');

		expect(spouseAssertions).toHaveLength(1);
		expect(spouseAssertions[0].origin).toBe('frontmatter');
	});

	it('keeps materialized Assertions in the same semantic stream', () => {
		const record = {
			file: fakeFile('Assertions/A.md'),
			filePath: 'Assertions/A.md',
			assertion: {
				cr_schema: 2,
				cr_type: 'assertion',
				cr_id: 'a1',
				assertion_type: 'office_holding',
				subject: '[[曹操]]',
				predicate: 'holds_office',
				object: '[[丞相]]'
			},
			raw: {}
		};

		const app = {
			vault: { getMarkdownFiles: () => [] },
			metadataCache: { getFileCache: () => null }
		} as never;
		const materialized = {
			getAll: () => [record]
		} as unknown as AssertionService;

		const service = new SemanticAssertionService(app, materialized);
		expect(service.getAll()[0]).toMatchObject({
			assertionType: 'office_holding',
			predicate: 'holds_office',
			origin: 'assertion_note'
		});
	});
});
