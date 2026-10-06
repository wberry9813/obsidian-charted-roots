import type { App } from 'obsidian';
import type {
	FileMigrationAnalysis,
	LegacyAnalyzerOptions,
	MigrationAnalysisReport,
	MigrationFinding
} from './types';

const MEMBERSHIP_FIELDS = [
	'membership_orgs',
	'membership_org_ids',
	'membership_roles',
	'membership_from_dates',
	'membership_to_dates',
	'membership_notes'
] as const;

const PRESERVED_KINSHIP_FIELDS = new Set([
	'father',
	'mother',
	'spouse',
	'child',
	'children'
]);

function hasOwn(frontmatter: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(frontmatter, key);
}

function toArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (value === undefined || value === null || value === '') return [];
	return [value];
}

function nonEmpty(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === 'string') return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
}

function finding(
	filePath: string,
	code: MigrationFinding['code'],
	severity: MigrationFinding['severity'],
	message: string,
	fields: string[],
	autoMigrate: boolean,
	extras: Pick<MigrationFinding, 'count' | 'details'> = {}
): MigrationFinding {
	return {
		code,
		severity,
		filePath,
		message,
		fields,
		autoMigrate,
		...extras
	};
}

function checkParallelFields(
	filePath: string,
	frontmatter: Record<string, unknown>,
	primaryField: string,
	companionFields: string[]
): MigrationFinding | null {
	const primary = toArray(frontmatter[primaryField]);
	if (primary.length === 0) return null;

	const mismatches: Record<string, number> = {};
	for (const field of companionFields) {
		if (!hasOwn(frontmatter, field)) continue;
		const length = toArray(frontmatter[field]).length;
		if (length !== primary.length) {
			mismatches[field] = length;
		}
	}

	if (Object.keys(mismatches).length === 0) return null;

	return finding(
		filePath,
		'parallel_array_misaligned',
		'blocker',
		`Parallel fields for "${primaryField}" are misaligned. Manual review is required.`,
		[primaryField, ...Object.keys(mismatches)],
		false,
		{
			details: {
				expectedLength: primary.length,
				actualLengths: mismatches
			}
		}
	);
}

function analyzeMemberships(
	filePath: string,
	frontmatter: Record<string, unknown>,
	allowSimpleMembership: boolean
): MigrationFinding[] {
	const findings: MigrationFinding[] = [];
	const orgs = toArray(frontmatter.membership_orgs).filter(nonEmpty);

	if (orgs.length > 0) {
		const mismatch = checkParallelFields(
			filePath,
			frontmatter,
			'membership_orgs',
			MEMBERSHIP_FIELDS.filter(field => field !== 'membership_orgs')
		);
		if (mismatch) {
			findings.push(mismatch);
		} else {
			findings.push(finding(
				filePath,
				'membership_parallel_arrays',
				'info',
				`Convert ${orgs.length} legacy membership record(s) to Affiliation Assertions.`,
				[...MEMBERSHIP_FIELDS.filter(field => hasOwn(frontmatter, field))],
				true,
				{ count: orgs.length }
			));
		}
		return findings;
	}

	if (hasOwn(frontmatter, 'memberships') && Array.isArray(frontmatter.memberships)) {
		const memberships = frontmatter.memberships as unknown[];
		const malformed = memberships.filter(item =>
			!item
			|| typeof item !== 'object'
			|| !nonEmpty((item as Record<string, unknown>).org)
		);

		if (malformed.length > 0) {
			findings.push(finding(
				filePath,
				'membership_conflict',
				'blocker',
				'Legacy nested memberships contain malformed records. Manual review is required.',
				['memberships'],
				false,
				{ details: { malformedCount: malformed.length } }
			));
		} else if (memberships.length > 0) {
			findings.push(finding(
				filePath,
				'membership_nested',
				'info',
				`Convert ${memberships.length} nested membership record(s) to Affiliation Assertions.`,
				['memberships'],
				true,
				{ count: memberships.length }
			));
		}
		return findings;
	}

	const house = frontmatter.house;
	const organization = frontmatter.organization;
	if (allowSimpleMembership && (nonEmpty(house) || nonEmpty(organization))) {
		if (nonEmpty(house) && nonEmpty(organization) && house !== organization) {
			findings.push(finding(
				filePath,
				'membership_conflict',
				'review',
				'Both legacy house and organization fields are populated with different values.',
				['house', 'organization'],
				false
			));
		} else {
			findings.push(finding(
				filePath,
				'membership_simple',
				'info',
				'Convert the simple legacy organization/house membership to an Affiliation Assertion.',
				['house', 'house_id', 'organization', 'organization_id', 'role']
					.filter(field => hasOwn(frontmatter, field)),
				true,
				{ count: 1 }
			));
		}
	}

	return findings;
}

function isWikilink(value: unknown): boolean {
	return typeof value === 'string' && /^!?\[\[[^\]]+\]\]$/.test(value.trim());
}

function analyzeRelationships(
	filePath: string,
	frontmatter: Record<string, unknown>,
	relationshipTypeIds: string[]
): MigrationFinding[] {
	const findings: MigrationFinding[] = [];

	for (const typeId of relationshipTypeIds) {
		if (PRESERVED_KINSHIP_FIELDS.has(typeId)) continue;
		if (!nonEmpty(frontmatter[typeId])) continue;

		const targets = toArray(frontmatter[typeId]);
		const companionFields = [
			`${typeId}_id`,
			`${typeId}_from`,
			`${typeId}_to`,
			`${typeId}_notes`
		];

		const mismatch = checkParallelFields(
			filePath,
			frontmatter,
			typeId,
			companionFields
		);
		if (mismatch) {
			findings.push(mismatch);
			continue;
		}

		const invalidTargets = targets.filter(target => !isWikilink(target));
		if (invalidTargets.length > 0) {
			findings.push(finding(
				filePath,
				'invalid_relationship_target',
				'blocker',
				`Relationship "${typeId}" contains non-wikilink target values.`,
				[typeId],
				false,
				{ details: { invalidTargetCount: invalidTargets.length } }
			));
			continue;
		}

		findings.push(finding(
			filePath,
			'relationship_parallel_arrays',
			'info',
			`Convert ${targets.length} "${typeId}" relationship record(s) to Relationship Assertions.`,
			[typeId, ...companionFields.filter(field => hasOwn(frontmatter, field))],
			true,
			{
				count: targets.length,
				details: { relationshipType: typeId }
			}
		));
	}

	if (hasOwn(frontmatter, 'relationships') && Array.isArray(frontmatter.relationships)) {
		const raw = frontmatter.relationships as unknown[];
		const malformed = raw.filter(item => {
			if (!item || typeof item !== 'object') return true;
			const record = item as Record<string, unknown>;
			return typeof record.type !== 'string'
				|| !record.type.trim()
				|| !isWikilink(record.target);
		});

		if (malformed.length > 0) {
			findings.push(finding(
				filePath,
				'relationship_nested',
				'blocker',
				'Legacy nested relationships contain malformed records.',
				['relationships'],
				false,
				{ details: { malformedCount: malformed.length } }
			));
		} else if (raw.length > 0) {
			findings.push(finding(
				filePath,
				'relationship_nested',
				'info',
				`Convert ${raw.length} nested relationship record(s) to Relationship Assertions.`,
				['relationships'],
				true,
				{ count: raw.length }
			));
		}
	}

	return findings;
}

function analyzeEventFields(
	filePath: string,
	frontmatter: Record<string, unknown>
): MigrationFinding[] {
	const findings: MigrationFinding[] = [];

	const dateFields = ['date', 'date_end'].filter(field => hasOwn(frontmatter, field));
	if (dateFields.length > 0) {
		findings.push(finding(
			filePath,
			'legacy_event_date',
			'info',
			'Map legacy event date/date_end fields to v2 time_start/time_end.',
			dateFields,
			true
		));
	}

	if (hasOwn(frontmatter, 'date_precision')) {
		findings.push(finding(
			filePath,
			'legacy_date_precision',
			'review',
			'Legacy date_precision mixes precision, certainty and range semantics; normalize using the historical time parser.',
			['date_precision'],
			false
		));
	}

	const orderingFields = ['before', 'after'].filter(field => hasOwn(frontmatter, field));
	if (orderingFields.length > 0) {
		findings.push(finding(
			filePath,
			'legacy_event_relative_order',
			'info',
			'Legacy before/after fields use reversed semantics and can be deterministically renamed during migration.',
			orderingFields,
			true,
			{
				details: {
					before: 'chronologically_after',
					after: 'chronologically_before'
				}
			}
		));
	}

	return findings;
}

export function analyzeLegacyFrontmatter(
	filePath: string,
	frontmatter: Record<string, unknown>,
	options: LegacyAnalyzerOptions = {}
): FileMigrationAnalysis {
	const findings: MigrationFinding[] = [];
	const crType = typeof frontmatter.cr_type === 'string'
		? frontmatter.cr_type
		: typeof frontmatter.type === 'string'
			? frontmatter.type
			: undefined;

	const relationshipTypeIds = options.relationshipTypeIds ?? [];
	const hasExplicitMembershipData =
		MEMBERSHIP_FIELDS.some(field => hasOwn(frontmatter, field))
		|| hasOwn(frontmatter, 'memberships');
	const hasSimpleMembershipData =
		nonEmpty(frontmatter.house)
		|| nonEmpty(frontmatter.organization);
	const hasExplicitRelationshipData = relationshipTypeIds.some(typeId =>
		!PRESERVED_KINSHIP_FIELDS.has(typeId) && hasOwn(frontmatter, typeId)
	);
	const hasUntypedLegacyPersonShape =
		!crType
		&& typeof frontmatter.cr_id === 'string'
		&& !!frontmatter.cr_id.trim()
		&& (
			hasExplicitMembershipData
			|| hasSimpleMembershipData
			|| hasExplicitRelationshipData
			|| nonEmpty(frontmatter.occupation)
			|| nonEmpty(frontmatter.title)
		);
	const isPersonContext = crType === 'person' || hasUntypedLegacyPersonShape;

	if (isPersonContext) {
		findings.push(...analyzeMemberships(
			filePath,
			frontmatter,
			crType === 'person' || hasUntypedLegacyPersonShape
		));
		findings.push(...analyzeRelationships(
			filePath,
			frontmatter,
			relationshipTypeIds
		));
	}

	if (crType === 'event') {
		findings.push(...analyzeEventFields(filePath, frontmatter));
	}

	if (crType === 'organization' && nonEmpty(frontmatter.parent_org)) {
		findings.push(finding(
			filePath,
			'organization_parent',
			'info',
			'Convert legacy parent_org to a part_of Organization Relation Assertion.',
			['parent_org'],
			true
		));
	}

	if (isPersonContext) {
		for (const field of ['occupation', 'title']) {
			if (nonEmpty(frontmatter[field])) {
				findings.push(finding(
					filePath,
					'dynamic_identity_review',
					'review',
					`Legacy "${field}" may represent an office, title, status or free-text role and requires semantic review.`,
					[field],
					false
				));
			}
		}
	}

	if (nonEmpty(frontmatter.collection)) {
		findings.push(finding(
			filePath,
			'collection_review',
			'review',
			'Legacy collection may map to research_sets; review its intended semantics.',
			['collection'],
			false
		));
	}

	if (nonEmpty(frontmatter.group_name)) {
		findings.push(finding(
			filePath,
			'group_name_review',
			'review',
			'group_name may be a family-component label or a research-topic workaround; review before migration.',
			['group_name'],
			false
		));
	}

	if (frontmatter.cr_schema !== 2 && findings.length > 0) {
		findings.push(finding(
			filePath,
			'legacy_schema_candidate',
			'info',
			'This note contains legacy Charted Roots data and is a Schema v2 migration candidate.',
			['cr_schema'],
			false
		));
	}

	return {
		filePath,
		crType,
		findings,
		hasBlockers: findings.some(item => item.severity === 'blocker'),
		hasLegacyData: findings.length > 0
	};
}

export class V2MigrationAnalyzer {
	constructor(
		private readonly app: App,
		private readonly options: LegacyAnalyzerOptions = {}
	) {}

	analyze(): MigrationAnalysisReport {
		const files = this.app.vault.getMarkdownFiles();
		const analyses = files
			.map(file => {
				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				return frontmatter
					? analyzeLegacyFrontmatter(
						file.path,
						{ ...frontmatter } as Record<string, unknown>,
						this.options
					)
					: {
						filePath: file.path,
						crType: undefined,
						findings: [],
						hasBlockers: false,
						hasLegacyData: false
					};
			})
			.filter(result => result.hasLegacyData);

		const allFindings = analyses.flatMap(result => result.findings);

		return {
			filesScanned: files.length,
			filesWithLegacyData: analyses.length,
			safeConversions: allFindings.filter(item => item.autoMigrate && item.severity === 'info').length,
			reviewItems: allFindings.filter(item => item.severity === 'review').length,
			blockers: allFindings.filter(item => item.severity === 'blocker').length,
			files: analyses
		};
	}
}
