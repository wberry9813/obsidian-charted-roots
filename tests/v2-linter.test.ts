import { describe, expect, it } from 'vitest';
import {
	AssertionService,
	V2Linter,
	createV2OntologyRegistry
} from '../src/v2';

function makeFile(path: string) {
	return { path } as never;
}

function makeApp(entries: Array<{ path: string; frontmatter?: Record<string, unknown> }>) {
	const files = entries.map(entry => makeFile(entry.path));
	const map = new Map(entries.map((entry, index) => [entry.path, {
		file: files[index],
		frontmatter: entry.frontmatter
	}]));

	return {
		vault: {
			getMarkdownFiles: () => files
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const item = map.get(file.path);
				return item?.frontmatter ? { frontmatter: item.frontmatter } : null;
			}
		}
	} as never;
}

describe('v2 foundation linter', () => {
	it('accepts a small valid v2 graph', () => {
		const app = makeApp([
			{
				path: 'People/Cao-Cao.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'person',
					cr_id: 'p1',
					name: '曹操'
				}
			},
			{
				path: 'Offices/Chancellor.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'office',
					cr_id: 'o1',
					name: '丞相'
				}
			},
			{
				path: 'Assertions/Holding.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'a1',
					assertion_type: 'office_holding',
					subject: '[[People/Cao-Cao|曹操]]',
					predicate: 'holds_office',
					object: '[[Offices/Chancellor|丞相]]'
				}
			}
		]);

		const assertions = new AssertionService(app);
		const linter = new V2Linter(app, createV2OntologyRegistry(), assertions);

		expect(linter.lint()).toEqual([]);
	});

	it('reports duplicate ids and unknown predicates', () => {
		const app = makeApp([
			{
				path: 'People/A.md',
				frontmatter: { cr_schema: 2, cr_type: 'person', cr_id: 'dup' }
			},
			{
				path: 'People/B.md',
				frontmatter: { cr_schema: 2, cr_type: 'person', cr_id: 'dup' }
			},
			{
				path: 'Assertions/Unknown.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'a1',
					assertion_type: 'relationship',
					subject: '[[People/A]]',
					predicate: 'invented_relation',
					object: '[[People/B]]'
				}
			}
		]);

		const assertions = new AssertionService(app);
		const issues = new V2Linter(app, createV2OntologyRegistry(), assertions).lint();

		expect(issues).toEqual(expect.arrayContaining([
			expect.objectContaining({ code: 'duplicate_cr_id' }),
			expect.objectContaining({ code: 'unknown_predicate' })
		]));
	});

	it('keeps content lint Workspace-scoped while enforcing cr_id globally', () => {
		const app = makeApp([
			{
				path: 'History/People/A.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'person',
					cr_id: 'dup-global',
					name: 'History A'
				}
			},
			{
				path: 'Fiction/Assertions/Bad.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'dup-global',
					assertion_type: 'relationship',
					subject: '[[Fiction/People/X]]',
					predicate: 'invented_relation',
					object: '[[Fiction/People/Y]]'
				}
			},
			{
				path: 'Fiction/People/Missing-Id.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'person'
				}
			}
		]);

		const historyFiles = () => app.vault.getMarkdownFiles()
			.filter((file: { path: string }) => file.path.startsWith('History/'));
		const assertions = new AssertionService(
			app,
			undefined,
			{ fileProvider: historyFiles as never }
		);
		const issues = new V2Linter(
			app,
			createV2OntologyRegistry(),
			assertions,
			{
				fileProvider: historyFiles as never,
				globalFileProvider: () => app.vault.getMarkdownFiles()
			}
		).lint();

		expect(issues).toEqual(expect.arrayContaining([
			expect.objectContaining({
				code: 'duplicate_cr_id',
				crId: 'dup-global',
				filePath: 'Fiction/Assertions/Bad.md'
			})
		]));
		expect(issues.some(issue =>
			issue.code === 'unknown_predicate'
			&& issue.filePath === 'Fiction/Assertions/Bad.md'
		)).toBe(false);
		expect(issues.some(issue =>
			issue.code === 'missing_cr_id'
			&& issue.filePath === 'Fiction/People/Missing-Id.md'
		)).toBe(false);
	});

});
