import { describe, expect, it } from 'vitest';
import {
	CHINESE_HISTORY_V1_PACK,
	CORE_V2_PACK,
	OntologyRegistry,
	createV2OntologyRegistry
} from '../src/v2';

describe('v2 OntologyRegistry', () => {
	it('registers core and Chinese History packs', () => {
		const registry = createV2OntologyRegistry();

		expect(registry.listPacks()).toContain('core');
		expect(registry.listPacks()).toContain('chinese-history');
		expect(registry.hasType('organization_type', 'clan')).toBe(true);
		expect(registry.hasType('office_type', 'central_government')).toBe(true);
		expect(registry.hasPredicate('political_rival')).toBe(true);
	});

	it('resolves localized labels with fallback', () => {
		const registry = createV2OntologyRegistry();

		expect(registry.getTypeLabel('organization_type', 'clan', 'zh-CN')).toBe('宗族');
		expect(registry.getTypeLabel('organization_type', 'clan', 'en')).toBe('Clan');
		expect(registry.getTypeLabel('office_type', 'central_government', 'zh-CN')).toBe('中央官职');
		expect(registry.getTypeLabel('office_type', 'central_government', 'en')).toBe('Central government');
		expect(registry.getTypeLabel('organization_type', 'clan', 'fr')).toBe('Clan');
		expect(registry.getTypeLabel('organization_type', 'missing', 'zh-CN')).toBe('missing');
	});

	it('returns locale-specific aliases without changing the stable id', () => {
		const registry = createV2OntologyRegistry();

		expect(registry.getAliases('organization_type', 'political_faction', 'zh-CN'))
			.toEqual(['朋党', '派系']);
		expect(registry.getType('organization_type', 'political_faction')?.id)
			.toBe('political_faction');
	});

	it('validates predicate subject/object applicability', () => {
		const registry = createV2OntologyRegistry();

		expect(registry.isPredicateApplicable('holds_office', 'person', 'office')).toBe(true);
		expect(registry.isPredicateApplicable('holds_office', 'organization', 'office')).toBe(false);
		expect(registry.isPredicateApplicable('political_rival', 'person', 'person')).toBe(true);
		expect(registry.isPredicateApplicable('political_rival', 'person', 'organization')).toBe(false);
	});

	it('rejects duplicate definitions unless replace is explicit', () => {
		const registry = new OntologyRegistry();
		registry.registerPack(CORE_V2_PACK);

		expect(() => registry.registerPack(CORE_V2_PACK)).toThrow(/already registered/);
		expect(() => registry.registerPack(CORE_V2_PACK, true)).not.toThrow();
	});

	it('can omit the Chinese History pack', () => {
		const registry = createV2OntologyRegistry({ includeChineseHistory: false });

		expect(registry.listPacks()).toContain('core');
		expect(registry.listPacks()).not.toContain('chinese-history');
		expect(registry.hasType('organization_type', 'clan')).toBe(false);
	});

	it('validates reciprocal inverse predicates after packs are loaded', () => {
		const registry = createV2OntologyRegistry();

		expect(registry.validate().filter(issue => issue.severity === 'error')).toEqual([]);
		expect(registry.getPredicate('mentor_of')?.inverse).toBe('disciple_of');
		expect(registry.getPredicate('disciple_of')?.inverse).toBe('mentor_of');
	});

	it('reports a missing inverse predicate', () => {
		const registry = new OntologyRegistry();
		registry.registerPredicate({
			kind: 'predicate',
			id: 'broken_inverse',
			labels: { en: 'Broken inverse' },
			pack: 'test',
			builtIn: false,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: true,
			inverse: 'does_not_exist'
		});

		expect(registry.validate()).toEqual(expect.arrayContaining([
			expect.objectContaining({
				severity: 'error',
				code: 'missing_inverse_predicate',
				definitionId: 'broken_inverse'
			})
		]));
	});

	it('rejects a definition whose declared pack does not match its container', () => {
		const registry = new OntologyRegistry();
		const invalid = {
			...CHINESE_HISTORY_V1_PACK,
			types: [{
				kind: 'organization_type',
				id: 'bad_pack',
				labels: { en: 'Bad pack' },
				pack: 'other',
				builtIn: true
			}]
		};

		expect(() => registry.registerPack(invalid)).toThrow(/declares pack/);
	});
});
