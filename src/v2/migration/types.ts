export type MigrationFindingSeverity = 'info' | 'review' | 'blocker';

export type MigrationFindingCode =
	| 'membership_parallel_arrays'
	| 'membership_nested'
	| 'membership_simple'
	| 'membership_conflict'
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
	| 'legacy_schema_candidate';

export interface MigrationFinding {
	code: MigrationFindingCode;
	severity: MigrationFindingSeverity;
	filePath: string;
	message: string;
	fields: string[];
	autoMigrate: boolean;
	count?: number;
	details?: Record<string, unknown>;
}

export interface FileMigrationAnalysis {
	filePath: string;
	crType?: string;
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
	relationshipTypeIds?: string[];
}
