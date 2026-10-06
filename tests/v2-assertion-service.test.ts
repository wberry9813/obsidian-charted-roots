import { describe, expect, it } from 'vitest';
import { AssertionService } from '../src/v2';

function makeFile(path: string) {
	return { path } as never;
}

function makeApp(entries: Array<{ path: string; frontmatter?: Record<string, unknown> }>) {
	const files = entries.map(entry => makeFile(entry.path));
	const byPath = new Map(entries.map((entry, index) => [entry.path, {
		file: files[index],
		frontmatter: entry.frontmatter
	}]));

	return {
		vault: {
			getMarkdownFiles: () => files
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const entry = byPath.get(file.path);
				return entry?.frontmatter ? { frontmatter: entry.frontmatter } : null;
			}
		}
	} as never;
}

describe('v2 AssertionService', () => {
	it('returns valid v2 assertions and ignores unrelated notes', () => {
		const app = makeApp([
			{
				path: 'Assertions/Cao-Cao-Chancellor.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'a1',
					assertion_type: 'office_holding',
					subject: '[[People/Cao-Cao|曹操]]',
					predicate: 'holds_office',
					object: '[[Offices/Chancellor|丞相]]'
				}
			},
			{
				path: 'People/Cao-Cao.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'person',
					cr_id: 'p1',
					name: '曹操'
				}
			}
		]);

		const service = new AssertionService(app);
		const records = service.getAll();

		expect(records).toHaveLength(1);
		expect(records[0].filePath).toBe('Assertions/Cao-Cao-Chancellor.md');
		expect(records[0].assertion.predicate).toBe('holds_office');
	});

	it('reports malformed assertion notes instead of treating them as valid', () => {
		const app = makeApp([
			{
				path: 'Assertions/Broken.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'broken',
					assertion_type: 'relationship',
					subject: '[[A]]',
					predicate: 'ally_of'
				}
			}
		]);

		const service = new AssertionService(app);
		expect(service.getAll()).toHaveLength(0);
		expect(service.getInvalid()).toHaveLength(1);
		expect(service.getInvalid()[0].errors)
			.toContain('Assertion requires exactly one of object or value.');
	});

	it('queries by subject, object, predicate and assertion type', () => {
		const app = makeApp([
			{
				path: 'Assertions/A1.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'a1',
					assertion_type: 'relationship',
					subject: '[[A]]',
					predicate: 'ally_of',
					object: '[[B]]'
				}
			},
			{
				path: 'Assertions/A2.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'a2',
					assertion_type: 'relationship',
					subject: '[[A]]',
					predicate: 'hostile_to',
					object: '[[C]]'
				}
			}
		]);

		const service = new AssertionService(app);

		expect(service.getForSubject('[[A]]')).toHaveLength(2);
		expect(service.getForObject('[[B]]')).toHaveLength(1);
		expect(service.getByPredicate('ally_of')).toHaveLength(1);
		expect(service.getByAssertionType('relationship')).toHaveLength(2);
	});
});
