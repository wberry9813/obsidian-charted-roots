import { describe, expect, it } from 'vitest';
import { AssertionService, buildAssertionMarkdown, createV2OntologyRegistry } from '../src/v2';

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


describe('v2 Assertion writer serialization', () => {
	it('serializes an entity-object Assertion with temporal metadata', () => {
		const markdown = buildAssertionMarkdown('abc-123-def-456', {
			assertionType: 'office_holding',
			subject: '[[People/Cao-Cao|曹操]]',
			predicate: 'holds_office',
			object: '[[Offices/Chancellor|丞相]]',
			timeStart: '建安十三年',
			timeStartPrecision: 'year',
			timeStartCertainty: 'certain',
			qualifiers: {
				organization: '[[汉朝廷]]'
			},
			title: '曹操任丞相'
		});

		expect(markdown).toContain('cr_schema: 2');
		expect(markdown).toContain('cr_type: assertion');
		expect(markdown).toContain('cr_id: "abc-123-def-456"');
		expect(markdown).toContain('assertion_type: "office_holding"');
		expect(markdown).toContain('subject: "[[People/Cao-Cao|曹操]]"');
		expect(markdown).toContain('predicate: "holds_office"');
		expect(markdown).toContain('object: "[[Offices/Chancellor|丞相]]"');
		expect(markdown).toContain('time_start: "建安十三年"');
		expect(markdown).toContain('time_start_precision: "year"');
		expect(markdown).toContain('time_start_certainty: "certain"');
		expect(markdown).toContain('organization: "[[汉朝廷]]"');
		expect(markdown).toContain('# 曹操任丞相');
	});

	it('serializes a literal Assertion and preserves scalar qualifier types', () => {
		const markdown = buildAssertionMarkdown('abc-123-def-456', {
			assertionType: 'designation',
			subject: '[[People/Cao-Cao|曹操]]',
			predicate: 'has_designation',
			value: '武皇帝',
			qualifiers: {
				posthumous: true,
				order: 1
			}
		});

		expect(markdown).toContain('value: "武皇帝"');
		expect(markdown).toContain('posthumous: true');
		expect(markdown).toContain('order: 1');
	});

	it('rejects both object and value', () => {
		expect(() => buildAssertionMarkdown('abc-123-def-456', {
			assertionType: 'generic',
			subject: '[[A]]',
			predicate: 'related_to',
			object: '[[B]]',
			value: 'B'
		})).toThrow(/exactly one of object or value/);
	});

	it('rejects reserved or invalid qualifier keys', () => {
		expect(() => buildAssertionMarkdown('abc-123-def-456', {
			assertionType: 'generic',
			subject: '[[A]]',
			predicate: 'related_to',
			object: '[[B]]',
			qualifiers: { subject: 'bad override' }
		})).toThrow(/collides with a reserved field/);

		expect(() => buildAssertionMarkdown('abc-123-def-456', {
			assertionType: 'generic',
			subject: '[[A]]',
			predicate: 'related_to',
			object: '[[B]]',
			qualifiers: { 'Bad Key': 'value' }
		})).toThrow(/lowercase snake_case/);
	});
});


describe('v2 Assertion writer ontology validation', () => {
	it('rejects an unknown predicate before touching the vault', async () => {
		const service = new AssertionService({} as never, createV2OntologyRegistry());

		await expect(service.createAssertion({
			assertionType: 'relationship',
			subject: '[[A]]',
			predicate: 'invented_relation',
			object: '[[B]]'
		})).rejects.toThrow(/Unknown predicate/);
	});

	it('rejects an unknown assertion type before touching the vault', async () => {
		const service = new AssertionService({} as never, createV2OntologyRegistry());

		await expect(service.createAssertion({
			assertionType: 'invented_type',
			subject: '[[A]]',
			predicate: 'spouse',
			object: '[[B]]'
		})).rejects.toThrow(/Unknown assertion_type/);
	});
});
