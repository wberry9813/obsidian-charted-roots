import type { DefinitionPack, TypeDefinition } from '../types';

function organizationType(
	id: string,
	en: string,
	zhCN: string,
	aliases?: string[]
): TypeDefinition {
	return {
		kind: 'organization_type',
		id,
		labels: { en, 'zh-CN': zhCN },
		aliases: aliases ? { 'zh-CN': aliases } : undefined,
		pack: 'chinese-history',
		builtIn: true
	};
}

function officeType(
	id: string,
	en: string,
	zhCN: string,
	aliases?: string[]
): TypeDefinition {
	return {
		kind: 'office_type',
		id,
		labels: { en, 'zh-CN': zhCN },
		aliases: aliases ? { 'zh-CN': aliases } : undefined,
		pack: 'chinese-history',
		builtIn: true
	};
}

export const CHINESE_HISTORY_V1_PACK: DefinitionPack = {
	id: 'chinese-history',
	types: [
		organizationType('dynasty', 'Dynasty', '王朝'),
		organizationType('polity', 'Polity', '政权', ['国家']),
		organizationType('court', 'Court', '朝廷'),
		organizationType('clan', 'Clan', '宗族'),
		organizationType('lineage', 'Lineage', '世系'),
		organizationType('house', 'House', '世家', ['家族', '门第']),
		organizationType('branch', 'Branch', '房支'),
		organizationType('government_office', 'Government office', '官署', ['机构']),
		organizationType('military_unit', 'Military unit', '军队', ['军事单位']),
		organizationType('political_faction', 'Political faction', '政治派系', ['朋党', '派系']),
		organizationType('party', 'Party', '党派'),
		organizationType('school', 'School of thought', '学派'),
		organizationType('religious_organization', 'Religious organization', '宗教组织'),
		organizationType('secret_society', 'Secret society', '秘密结社'),
		officeType('central_government', 'Central government', '中央官职'),
		officeType('local_government', 'Local government', '地方官职'),
		officeType('military', 'Military office', '军事官职'),
		officeType('court_household', 'Court / household office', '宫廷 / 内廷官职'),
		officeType('honorary', 'Honorary office', '荣誉官职'),
		officeType('acting', 'Acting / temporary office', '代理 / 临时官职'),
		{
			kind: 'designation_type',
			id: 'given_name',
			labels: { en: 'Given name', 'zh-CN': '名' },
			pack: 'chinese-history',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'courtesy_name',
			labels: { en: 'Courtesy name', 'zh-CN': '字' },
			pack: 'chinese-history',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'art_name',
			labels: { en: 'Art name', 'zh-CN': '号' },
			pack: 'chinese-history',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'childhood_name',
			labels: { en: 'Childhood name', 'zh-CN': '乳名' },
			pack: 'chinese-history',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'posthumous_name',
			labels: { en: 'Posthumous name', 'zh-CN': '谥号' },
			pack: 'chinese-history',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'temple_name',
			labels: { en: 'Temple name', 'zh-CN': '庙号' },
			pack: 'chinese-history',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'honorific',
			labels: { en: 'Honorific', 'zh-CN': '尊号' },
			pack: 'chinese-history',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'noble_title',
			labels: { en: 'Noble title', 'zh-CN': '爵位' },
			pack: 'chinese-history',
			builtIn: true
		},
		{
			kind: 'designation_type',
			id: 'enfeoffment_title',
			labels: { en: 'Enfeoffment title', 'zh-CN': '封号' },
			pack: 'chinese-history',
			builtIn: true
		}
	],
	predicates: [
		{
			kind: 'predicate',
			id: 'political_rival',
			labels: { en: 'Political rival', 'zh-CN': '政治竞争' },
			pack: 'chinese-history',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: true,
			symmetric: true
		},
		{
			kind: 'predicate',
			id: 'hostile_to',
			labels: { en: 'Hostile to', 'zh-CN': '敌对' },
			pack: 'chinese-history',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: true,
			symmetric: true
		},
		{
			kind: 'predicate',
			id: 'ally_of',
			labels: { en: 'Ally of', 'zh-CN': '同盟' },
			pack: 'chinese-history',
			builtIn: true,
			subjectTypes: ['person', 'organization'],
			objectTypes: ['person', 'organization'],
			temporal: true,
			symmetric: true
		},
		{
			kind: 'predicate',
			id: 'mentor_of',
			labels: { en: 'Mentor of', 'zh-CN': '师承' },
			pack: 'chinese-history',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: true,
			inverse: 'disciple_of'
		},
		{
			kind: 'predicate',
			id: 'disciple_of',
			labels: { en: 'Disciple of', 'zh-CN': '受业于' },
			pack: 'chinese-history',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: true,
			inverse: 'mentor_of'
		},
		{
			kind: 'predicate',
			id: 'recommends',
			labels: { en: 'Recommends', 'zh-CN': '举荐' },
			pack: 'chinese-history',
			builtIn: true,
			subjectTypes: ['person'],
			objectTypes: ['person'],
			temporal: true
		}
	]
};
