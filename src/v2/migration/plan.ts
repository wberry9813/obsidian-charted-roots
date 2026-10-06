import type { OntologyRegistry } from '../ontology-registry';
import type {
	FileMigrationAnalysis,
	FileMigrationPlan,
	MigrationAnalysisReport,
	MigrationFinding,
	MigrationPlan,
	MigrationPlanOperation,
	MigrationPreviewStatus
} from './types';

interface LegacyMembershipRecord {
	org?: string;
	orgId?: string;
	role?: string;
	from?: string;
	to?: string;
	notes?: string;
}

interface LegacyRelationshipRecord {
	type?: string;
	target?: string;
	targetId?: string;
	from?: string;
	to?: string;
	notes?: string;
}

function fileStatus(file: FileMigrationAnalysis): MigrationPreviewStatus {
	if (file.findings.some(finding => finding.severity === 'blocker')) return 'blocked';
	if (file.findings.some(finding => finding.severity === 'review')) return 'review';
	return 'ready';
}

function sourceWikilink(filePath: string): string {
	return `[[${filePath.replace(/\.md$/i, '')}]]`;
}

function isWikilink(value: unknown): value is string {
	return typeof value === 'string' && /^!?\[\[[^\]]+\]\]$/.test(value.trim());
}

function records<T>(finding: MigrationFinding): T[] {
	const value = finding.details?.records;
	return Array.isArray(value) ? value as T[] : [];
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function addAll(target: Set<string>, values: string[]): void {
	for (const value of values) target.add(value);
}

/**
 * Build a concrete, immutable plan from one analyzer snapshot.
 *
 * The planner never reads the vault. All semantic inputs come from the frozen
 * analysis report. Files containing any review/blocker are deliberately given
 * zero operations, even when some sub-actions would otherwise be safe.
 */
export function buildMigrationPlan(
	report: MigrationAnalysisReport,
	ontology: OntologyRegistry
): MigrationPlan {
	const files = report.files.map(file => buildFilePlan(file, ontology));
	return {
		files,
		executableFiles: files.filter(file => file.status === 'ready').length,
		reviewFiles: files.filter(file => file.status === 'review').length,
		blockedFiles: files.filter(file => file.status === 'blocked').length,
		operationCount: files.reduce((sum, file) => sum + file.operations.length, 0)
	};
}

function buildFilePlan(
	file: FileMigrationAnalysis,
	ontology: OntologyRegistry
): FileMigrationPlan {
	let status = fileStatus(file);
	const reasons = file.findings
		.filter(finding => finding.severity !== 'info')
		.map(finding => finding.message);

	if (status !== 'ready') {
		return {
			filePath: file.filePath,
			sourceFingerprint: file.sourceFingerprint,
			status,
			operations: [],
			reasons
		};
	}

	const createOperations: MigrationPlanOperation[] = [];
	const removeFields = new Set<string>();
	const setFields: Record<string, unknown> = {};
	const subject = sourceWikilink(file.filePath);

	const requirePredicate = (predicate: string): boolean => {
		if (ontology.hasPredicate(predicate)) return true;
		status = 'review';
		reasons.push(
			`Predicate "${predicate}" is not registered in the v2 ontology; define or map it before migration.`
		);
		return false;
	};

	for (const finding of file.findings) {
		if (!finding.autoMigrate) continue;

		switch (finding.code) {
			case 'membership_parallel_arrays':
			case 'membership_nested':
			case 'membership_simple': {
				if (!requirePredicate('member_of')) break;
				for (const record of records<LegacyMembershipRecord>(finding)) {
					if (!isWikilink(record.org)) {
						status = 'review';
						reasons.push('Membership target is not a wikilink in the frozen migration snapshot.');
						continue;
					}
					const qualifiers: Record<string, string> = {};
					if (record.role) qualifiers.role = record.role;
					createOperations.push({
						kind: 'create_assertion',
						sourceFinding: finding.code,
						draft: {
							assertionType: 'affiliation',
							subject,
							predicate: 'member_of',
							object: record.org,
							timeStart: record.from,
							timeEnd: record.to,
							notes: record.notes,
							qualifiers: Object.keys(qualifiers).length > 0 ? qualifiers : undefined
						}
					});
				}
				addAll(removeFields, finding.fields);
				break;
			}

			case 'relationship_parallel_arrays': {
				const predicate = nonEmptyString(finding.details?.relationshipType);
				if (!predicate || !requirePredicate(predicate)) break;
				for (const record of records<LegacyRelationshipRecord>(finding)) {
					if (!isWikilink(record.target)) {
						status = 'review';
						reasons.push(`Relationship "${predicate}" has a non-wikilink target in the frozen snapshot.`);
						continue;
					}
					createOperations.push({
						kind: 'create_assertion',
						sourceFinding: finding.code,
						draft: {
							assertionType: 'relationship',
							subject,
							predicate,
							object: record.target,
							timeStart: record.from,
							timeEnd: record.to,
							notes: record.notes
						}
					});
				}
				addAll(removeFields, finding.fields);
				break;
			}

			case 'relationship_nested': {
				for (const record of records<LegacyRelationshipRecord>(finding)) {
					const predicate = record.type;
					if (!predicate || !requirePredicate(predicate)) continue;
					if (!isWikilink(record.target)) {
						status = 'review';
						reasons.push(`Relationship "${predicate}" has a non-wikilink target in the frozen snapshot.`);
						continue;
					}
					createOperations.push({
						kind: 'create_assertion',
						sourceFinding: finding.code,
						draft: {
							assertionType: 'relationship',
							subject,
							predicate,
							object: record.target,
							timeStart: record.from,
							timeEnd: record.to,
							notes: record.notes
						}
					});
				}
				addAll(removeFields, finding.fields);
				break;
			}

			case 'organization_parent': {
				if (!requirePredicate('part_of')) break;
				const target = finding.details?.target;
				if (!isWikilink(target)) {
					status = 'review';
					reasons.push('Organization parent target is not a wikilink in the frozen migration snapshot.');
					break;
				}
				createOperations.push({
					kind: 'create_assertion',
					sourceFinding: finding.code,
					draft: {
						assertionType: 'organization_relation',
						subject,
						predicate: 'part_of',
						object: target
					}
				});
				addAll(removeFields, finding.fields);
				break;
			}

			case 'legacy_event_date': {
				const start = finding.details?.time_start;
				const end = finding.details?.time_end;
				if (start !== undefined) setFields.time_start = start;
				if (end !== undefined) setFields.time_end = end;
				addAll(removeFields, finding.fields);
				break;
			}

			case 'legacy_event_relative_order': {
				for (const key of ['before', 'after'] as const) {
					const mapping = finding.details?.[key];
					if (!mapping || typeof mapping !== 'object') continue;
					const record = mapping as Record<string, unknown>;
					const targetField = nonEmptyString(record.targetField);
					if (targetField && record.value !== undefined) {
						setFields[targetField] = record.value;
					}
				}
				addAll(removeFields, finding.fields);
				break;
			}
		}
	}

	// If planning uncovered any semantic uncertainty, make the whole file
	// non-executable rather than applying only a subset of its conversions.
	if (status !== 'ready') {
		return {
			filePath: file.filePath,
			sourceFingerprint: file.sourceFingerprint,
			status,
			operations: [],
			reasons
		};
	}

	const schemaFinding = file.findings.find(
		finding => finding.code === 'legacy_schema_candidate'
	);
	if (schemaFinding) {
		setFields.cr_schema = 2;
		const canonicalCrType = schemaFinding.details?.canonicalCrType;
		if (typeof canonicalCrType === 'string' && canonicalCrType.trim()) {
			setFields.cr_type = canonicalCrType;
		}
		if (schemaFinding.details?.usedLegacyTypeField === true) {
			removeFields.add('type');
		}
	}

	const operations = [...createOperations];
	if (removeFields.size > 0 || Object.keys(setFields).length > 0) {
		operations.push({
			kind: 'rewrite_frontmatter',
			set: setFields,
			remove: [...removeFields]
		});
	}

	return {
		filePath: file.filePath,
		sourceFingerprint: file.sourceFingerprint,
		status,
		operations,
		reasons
	};
}
