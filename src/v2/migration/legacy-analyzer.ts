import type { App } from 'obsidian';
import { ALL_NOTE_TYPES, type NoteType } from '../../utils/note-type-detection';
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
	'spouses',
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

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, entry]) => [key, stableValue(entry)])
		);
	}
	return value;
}

/**
 * Non-cryptographic snapshot fingerprint used as an optimistic-concurrency
 * guard between Analyze/Preview and a future executor.
 */
export function fingerprintFrontmatter(frontmatter: Record<string, unknown>): string {
	const input = JSON.stringify(stableValue(frontmatter));
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
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
	companionFields: readonly string[]
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

function isWikilink(value: unknown): boolean {
	return typeof value === 'string' && /^!?\[\[[^\]]+\]\]$/.test(value.trim());
}

function membershipRecords(frontmatter: Record<string, unknown>): Array<Record<string, string | undefined>> {
	const orgs = toArray(frontmatter.membership_orgs);
	const orgIds = toArray(frontmatter.membership_org_ids);
	const roles = toArray(frontmatter.membership_roles);
	const fromDates = toArray(frontmatter.membership_from_dates);
	const toDates = toArray(frontmatter.membership_to_dates);
	const notes = toArray(frontmatter.membership_notes);

	return orgs.map((org, index) => ({
		org: stringValue(org),
		orgId: stringValue(orgIds[index]),
		role: stringValue(roles[index]),
		from: stringValue(fromDates[index]),
		to: stringValue(toDates[index]),
		notes: stringValue(notes[index])
	}));
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
			return findings;
		}

		const records = membershipRecords(frontmatter);
		const missingTarget = records.filter(record => !record.org || (!isWikilink(record.org) && !record.orgId));
		if (missingTarget.length > 0) {
			findings.push(finding(
				filePath,
				'membership_invalid_target',
				'blocker',
				'One or more legacy memberships have neither a wikilink organization target nor a usable organization id.',
				['membership_orgs', 'membership_org_ids'].filter(field => hasOwn(frontmatter, field)),
				false,
				{ details: { invalidCount: missingTarget.length } }
			));
			return findings;
		}

		const idOnlyTargets = records.filter(record => record.org && !isWikilink(record.org) && record.orgId);
		if (idOnlyTargets.length > 0) {
			findings.push(finding(
				filePath,
				'membership_invalid_target',
				'review',
				'One or more membership targets require cr_id-to-file resolution before they can be migrated safely.',
				['membership_orgs', 'membership_org_ids'],
				false,
				{ details: { records: idOnlyTargets } }
			));
			return findings;
		}

		findings.push(finding(
			filePath,
			'membership_parallel_arrays',
			'info',
			`Convert ${records.length} legacy membership record(s) to Affiliation Assertions.`,
			[...MEMBERSHIP_FIELDS.filter(field => hasOwn(frontmatter, field))],
			true,
			{ count: records.length, details: { records } }
		));
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
			const records = memberships.map(item => {
				const record = item as Record<string, unknown>;
				return {
					org: stringValue(record.org),
					orgId: stringValue(record.org_id),
					role: stringValue(record.role),
					from: stringValue(record.from),
					to: stringValue(record.to),
					notes: stringValue(record.notes)
				};
			});
			findings.push(finding(
				filePath,
				'membership_nested',
				'info',
				`Convert ${records.length} nested membership record(s) to Affiliation Assertions.`,
				['memberships'],
				true,
				{ count: records.length, details: { records } }
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
				false,
				{
					details: {
						house,
						organization
					}
				}
			));
		} else {
			const org = nonEmpty(house) ? house : organization;
			const orgId = nonEmpty(house) ? frontmatter.house_id : frontmatter.organization_id;
			const orgValue = stringValue(org);
			const details = {
				records: [{
					org: orgValue,
					orgId: stringValue(orgId),
					role: stringValue(frontmatter.role)
				}]
			};

			if (!orgValue || !isWikilink(orgValue)) {
				findings.push(finding(
					filePath,
					'membership_simple',
					'review',
					'Simple legacy membership requires a wikilink target before automatic migration.',
					['house', 'house_id', 'organization', 'organization_id', 'role']
						.filter(field => hasOwn(frontmatter, field)),
					false,
					{ count: 1, details }
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
					{ count: 1, details }
				));
			}
		}
	}

	return findings;
}

function relationshipRecords(
	frontmatter: Record<string, unknown>,
	typeId: string
): Array<Record<string, string | undefined>> {
	const targets = toArray(frontmatter[typeId]);
	const targetIds = toArray(frontmatter[`${typeId}_id`]);
	const fromDates = toArray(frontmatter[`${typeId}_from`]);
	const toDates = toArray(frontmatter[`${typeId}_to`]);
	const notes = toArray(frontmatter[`${typeId}_notes`]);

	return targets.map((target, index) => ({
		target: stringValue(target),
		targetId: stringValue(targetIds[index]),
		from: stringValue(fromDates[index]),
		to: stringValue(toDates[index]),
		notes: stringValue(notes[index])
	}));
}

function analyzeRelationships(
	filePath: string,
	frontmatter: Record<string, unknown>,
	relationshipTypeIds: readonly string[]
): MigrationFinding[] {
	const findings: MigrationFinding[] = [];

	for (const typeId of relationshipTypeIds) {
		if (PRESERVED_KINSHIP_FIELDS.has(typeId)) continue;
		if (!nonEmpty(frontmatter[typeId])) continue;

		const companionFields = [
			`${typeId}_id`,
			`${typeId}_from`,
			`${typeId}_to`,
			`${typeId}_notes`
		];

		const mismatch = checkParallelFields(filePath, frontmatter, typeId, companionFields);
		if (mismatch) {
			findings.push(mismatch);
			continue;
		}

		const records = relationshipRecords(frontmatter, typeId);
		const missingTarget = records.filter(record => !record.target || (!isWikilink(record.target) && !record.targetId));
		if (missingTarget.length > 0) {
			findings.push(finding(
				filePath,
				'invalid_relationship_target',
				'blocker',
				`Relationship "${typeId}" contains target values that cannot be resolved safely.`,
				[typeId, `${typeId}_id`].filter(field => hasOwn(frontmatter, field)),
				false,
				{ details: { relationshipType: typeId, invalidTargetCount: missingTarget.length } }
			));
			continue;
		}

		const idOnlyTargets = records.filter(record =>
			record.target && !isWikilink(record.target) && record.targetId
		);
		if (idOnlyTargets.length > 0) {
			findings.push(finding(
				filePath,
				'invalid_relationship_target',
				'review',
				`Relationship "${typeId}" requires cr_id-to-file resolution before migration.`,
				[typeId, `${typeId}_id`].filter(field => hasOwn(frontmatter, field)),
				false,
				{ details: { relationshipType: typeId, records: idOnlyTargets } }
			));
			continue;
		}

		findings.push(finding(
			filePath,
			'relationship_parallel_arrays',
			'info',
			`Convert ${records.length} "${typeId}" relationship record(s) to Relationship Assertions.`,
			[typeId, ...companionFields.filter(field => hasOwn(frontmatter, field))],
			true,
			{
				count: records.length,
				details: {
					relationshipType: typeId,
					records
				}
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
				|| (!isWikilink(record.target) && !nonEmpty(record.target_id));
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
			const records = raw.map(item => {
				const record = item as Record<string, unknown>;
				return {
					type: stringValue(record.type),
					target: stringValue(record.target),
					targetId: stringValue(record.target_id),
					from: stringValue(record.from),
					to: stringValue(record.to),
					notes: stringValue(record.notes)
				};
			});
			findings.push(finding(
				filePath,
				'relationship_nested',
				'info',
				`Convert ${records.length} nested relationship record(s) to Relationship Assertions.`,
				['relationships'],
				true,
				{ count: records.length, details: { records } }
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
			true,
			{
				details: {
					time_start: frontmatter.date,
					time_end: frontmatter.date_end
				}
			}
		));
	}

	if (hasOwn(frontmatter, 'date_precision')) {
		findings.push(finding(
			filePath,
			'legacy_date_precision',
			'review',
			'Legacy date_precision mixes precision, certainty and range semantics; normalize using the historical time parser.',
			['date_precision'],
			false,
			{ details: { legacyValue: frontmatter.date_precision } }
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
					before: {
						targetField: 'chronologically_after',
						value: frontmatter.before
					},
					after: {
						targetField: 'chronologically_before',
						value: frontmatter.after
					}
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

	const relationshipTypeIds = options.relationshipTypeIdProvider?.()
		?? options.relationshipTypeIds
		?? [];
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
		findings.push(...analyzeMemberships(filePath, frontmatter, true));
		findings.push(...analyzeRelationships(filePath, frontmatter, relationshipTypeIds));
	}

	if (crType === 'event') {
		findings.push(...analyzeEventFields(filePath, frontmatter));
	}

	if (crType === 'organization') {
		if (nonEmpty(frontmatter.parent_org)) {
			findings.push(finding(
				filePath,
				'organization_parent',
				'info',
				'Convert legacy parent_org to a part_of Organization Relation Assertion.',
				['parent_org'],
				true,
				{ details: { target: frontmatter.parent_org } }
			));
		}
		if (nonEmpty(frontmatter.members) || nonEmpty(frontmatter.members_id)) {
			findings.push(finding(
				filePath,
				'organization_members_mirror',
				'review',
				'Legacy organization member arrays are mirrored data. Verify against person-side memberships before removing them.',
				['members', 'members_id'].filter(field => hasOwn(frontmatter, field)),
				false
			));
		}
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
					false,
					{ details: { field, value: frontmatter[field] } }
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
			false,
			{ details: { value: frontmatter.collection } }
		));
	}

	if (nonEmpty(frontmatter.group_name)) {
		findings.push(finding(
			filePath,
			'group_name_review',
			'review',
			'group_name may be a family-component label or a research-topic workaround; review before migration.',
			['group_name'],
			false,
			{ details: { value: frontmatter.group_name } }
		));
	}

	const knownChartedRootsType =
		typeof crType === 'string'
		&& ALL_NOTE_TYPES.includes(crType as NoteType);

	// Every recognized Charted Roots note needs an explicit v2 schema marker,
	// even when its only data is intentionally-preserved compact genealogy.
	// Otherwise a vault could be finalized while silent v1 notes remain.
	if (frontmatter.cr_schema !== 2 && knownChartedRootsType) {
		const usedLegacyTypeField =
			typeof frontmatter.cr_type !== 'string'
			&& typeof frontmatter.type === 'string';

		findings.push(finding(
			filePath,
			'legacy_schema_candidate',
			'info',
			'This Charted Roots note still requires the Schema v2 marker.',
			[
				'cr_schema',
				...(usedLegacyTypeField ? ['type'] : [])
			],
			false,
			{
				details: {
					canonicalCrType: crType,
					usedLegacyTypeField
				}
			}
		));
	}

	return {
		filePath,
		crType,
		sourceFingerprint: fingerprintFrontmatter(frontmatter),
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
		const files = this.options.fileProvider?.()
			?? this.app.vault.getMarkdownFiles();
		const analyses = files
			.map(file => {
				const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
				return frontmatter
					? analyzeLegacyFrontmatter(
						file.path,
						{ ...frontmatter } as Record<string, unknown>,
						this.options
					)
					: null;
			})
			.filter((result): result is FileMigrationAnalysis =>
				!!result && result.hasLegacyData
			);

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
