import type { DefinitionPack } from '../types';
import { LEGACY_BUILTIN_RELATIONSHIP_PREDICATES } from '../adapters/relationship-type-adapter';

export const CORE_V2_PACK: DefinitionPack = {
	id: 'core',
	types: [
		{
			kind: 'assertion_type',
			id: 'relationship',
			labels: { en: 'Relationship', 'zh-CN': '关系' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'affiliation',
			labels: { en: 'Affiliation', 'zh-CN': '组织隶属' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'office_holding',
			labels: { en: 'Office holding', 'zh-CN': '任官' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'title_holding',
			labels: { en: 'Title holding', 'zh-CN': '头衔 / 爵位' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'designation',
			labels: { en: 'Designation', 'zh-CN': '称谓 / 名号' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'historical_name',
			labels: { en: 'Historical name', 'zh-CN': '历史名称' },
			descriptions: {
				en: 'A name used for an entity during a historical interval.',
				'zh-CN': '实体在某一历史时期使用的名称。'
			},
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'status',
			labels: { en: 'Status', 'zh-CN': '身份状态' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'residence',
			labels: { en: 'Residence', 'zh-CN': '居住' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'control',
			labels: { en: 'Control', 'zh-CN': '控制' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'organization_relation',
			labels: { en: 'Organization relation', 'zh-CN': '组织关系' },
			pack: 'core',
			builtIn: true
		},
		{
			kind: 'assertion_type',
			id: 'generic',
			labels: { en: 'Generic assertion', 'zh-CN': '通用断言' },
			pack: 'core',
			builtIn: true
		}
	],
	predicates: [
		{
			kind: 'predicate',
			id: 'father',
			labels: { en: 'Father', 'zh-CN': '父亲' },
			category: 'kinship',
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: false,
			includeOnFamilyTree: true,
			familyGraphMapping: 'father'
		},
		{
			kind: 'predicate',
			id: 'mother',
			labels: { en: 'Mother', 'zh-CN': '母亲' },
			category: 'kinship',
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: false,
			includeOnFamilyTree: true,
			familyGraphMapping: 'mother'
		},
		{
			kind: 'predicate',
			id: 'spouse',
			labels: { en: 'Spouse', 'zh-CN': '配偶' },
			category: 'kinship',
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: true,
			symmetric: true,
			includeOnFamilyTree: true,
			familyGraphMapping: 'spouse'
		},
		{
			kind: 'predicate',
			id: 'member_of',
			labels: { en: 'Member of', 'zh-CN': '属于' },
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['organization'],
			temporal: true
		},
		{
			kind: 'predicate',
			id: 'holds_office',
			labels: { en: 'Holds office', 'zh-CN': '担任' },
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['office'],
			temporal: true
		},
		{
			kind: 'predicate',
			id: 'holds_title',
			labels: { en: 'Holds title', 'zh-CN': '持有头衔' },
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person'],
			temporal: true
		},
		{
			kind: 'predicate',
			id: 'has_designation',
			labels: { en: 'Has designation', 'zh-CN': '具有名号' },
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person', 'place'],
			temporal: true,
			qualifiers: ['designation_type', 'source']
		},
		{
			kind: 'predicate',
			id: 'has_status',
			labels: { en: 'Has status', 'zh-CN': '具有身份状态' },
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person'],
			temporal: true
		},
		{
			kind: 'predicate',
			id: 'part_of',
			labels: { en: 'Part of', 'zh-CN': '隶属于' },
			pack: 'core',
			builtIn: true,
			subjectTypes: ['organization'],
			objectTypes: ['organization'],
			temporal: true
		},
		{
			kind: 'predicate',
			id: 'resides_at',
			labels: { en: 'Resides at', 'zh-CN': '居于' },
			pack: 'core',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['place'],
			temporal: true
		},
		{
			kind: 'predicate',
			id: 'controls',
			labels: { en: 'Controls', 'zh-CN': '控制' },
			pack: 'core',
			builtIn: true,
			subjectTypes: ['organization'],
			objectTypes: ['place'],
			temporal: true
		},
		...LEGACY_BUILTIN_RELATIONSHIP_PREDICATES
	]
};
