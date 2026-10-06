export type MigrationFindingSeverity = 'info' | 'review' | 'blocker';

export type MigrationFindingCode =
	| 'membership_parallel_arrays'
	| 'membership_nested'
	| 'membership_simple'
	| 'membership_conflict'
	| 'membership_invalid_target'
	| 'relationship_parallel_arrays'
	| 'relationship_nested'
	| 'parallel_array_misaligned'
	| 'invalid_relationship_target'
	| 'legacy_event_date'
	| 'legacy_event_relative_order'
	| 'legacy_date_precision'
	| 'dynamic_identity_review'
	| 'collection_review'
	| 'group_name_review'
	| 'organization_parent'
	| 'organization_members_mirror'
	| 'legacy_schema_candidate';

export interface MigrationFinding {
	code: MigrationFindingCode;
	severity: MigrationFindingSeverity;
	filePath: string;
	message: string;
	fields: string[];
	autoMigrate: boolean;
	count?: number;
	/**
	 * Frozen analyzer output. Future planners/executors should consume these
	 * details rather than re-inferring parallel-array indexes.
	 */
	details?: Record<string, unknown>;
}

export interface FileMigrationAnalysis {
	filePath: string;
	crType?: string;
	/** Stable fingerprint of the frontmatter snapshot used for this analysis. */
	sourceFingerprint: string;
	findings: MigrationFinding[];
	hasBlockers: boolean;
	hasLegacyData: boolean;
}

export interface MigrationAnalysisReport {
	filesScanned: number;
	filesWithLegacyData: number;
	safeConversions: number;
	reviewItems: number;
	blockers: number;
	files: FileMigrationAnalysis[];
}

export interface LegacyAnalyzerOptions {
	relationshipTypeIds?: readonly string[];
	/**
	 * Optional live provider used by the plugin integration so newly-added
	 * custom relationship types are included without recreating the analyzer.
	 */
	relationshipTypeIdProvider?: () => readonly string[];
}

export type MigrationPreviewStatus = 'ready' | 'review' | 'blocked';

export type MigrationPreviewActionKind =
	| 'create_assertions'
	| 'rewrite_frontmatter'
	| 'review'
	| 'blocker'
	| 'cleanup'
	| 'info';

export interface MigrationPreviewAction {
	kind: MigrationPreviewActionKind;
	code: MigrationFindingCode;
	description: string;
	fields: string[];
	count?: number;
	details?: Record<string, unknown>;
}

export interface FileMigrationPreview {
	filePath: string;
	sourceFingerprint: string;
	status: MigrationPreviewStatus;
	actions: MigrationPreviewAction[];
}

export interface MigrationPreview {
	files: FileMigrationPreview[];
	readyFiles: number;
	reviewFiles: number;
	blockedFiles: number;
	canRunWithoutReview: boolean;
}


export interface MigrationAssertionDraft {
	assertionType: string;
	subject: string;
	predicate: string;
	object?: string;
	value?: string | number | boolean;
	timeStart?: string;
	timeEnd?: string;
	notes?: string;
	qualifiers?: Record<string, string>;
}

export interface CreateAssertionPlanOperation {
	kind: 'create_assertion';
	sourceFinding: MigrationFindingCode;
	draft: MigrationAssertionDraft;
}

export interface RewriteFrontmatterPlanOperation {
	kind: 'rewrite_frontmatter';
	set: Record<string, unknown>;
	remove: string[];
}

export type MigrationPlanOperation =
	| CreateAssertionPlanOperation
	| RewriteFrontmatterPlanOperation;

export interface FileMigrationPlan {
	filePath: string;
	sourceFingerprint: string;
	status: MigrationPreviewStatus;
	operations: MigrationPlanOperation[];
	reasons: string[];
}

export interface MigrationPlan {
	files: FileMigrationPlan[];
	executableFiles: number;
	reviewFiles: number;
	blockedFiles: number;
	operationCount: number;
}


export type MigrationPlanValidationIssueCode =
	| 'missing_file'
	| 'missing_frontmatter'
	| 'invalid_frontmatter'
	| 'stale_source';

export interface MigrationPlanValidationIssue {
	code: MigrationPlanValidationIssueCode;
	filePath: string;
	message: string;
	expectedFingerprint: string;
	actualFingerprint?: string;
}

export interface MigrationPlanValidationResult {
	valid: boolean;
	checkedFiles: number;
	issues: MigrationPlanValidationIssue[];
}
