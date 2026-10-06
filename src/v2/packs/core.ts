import type { DefinitionPack } from '../types';

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
		}
	]
};
