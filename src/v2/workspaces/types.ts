export type WorkspaceMode =
	| 'genealogy'
	| 'historical'
	| 'worldbuilding';

export type WorkspaceFolderKey =
	| 'people'
	| 'places'
	| 'organizations'
	| 'offices'
	| 'events'
	| 'processes'
	| 'periods'
	| 'assertions'
	| 'claims'
	| 'sources'
	| 'citations'
	| 'research'
	| 'maps'
	| 'universes'
	| 'schemas'
	| 'canvases'
	| 'staging'
	| 'notes'
	| 'bases'
	| 'timelines'
	| 'reports';

export interface WorkspaceFolderOverrides {
	people?: string;
	places?: string;
	organizations?: string;
	offices?: string;
	events?: string;
	processes?: string;
	periods?: string;
	assertions?: string;
	claims?: string;
	sources?: string;
	citations?: string;
	research?: string;
	maps?: string;
	universes?: string;
	schemas?: string;
	canvases?: string;
	staging?: string;
	notes?: string;
	bases?: string;
	timelines?: string;
	reports?: string;
}

export interface WorkspaceDefinition {
	/** Stable machine id. */
	id: string;
	/** User-visible name. */
	name: string;
	/** Vault-relative root folder. */
	rootFolder: string;
	mode: WorkspaceMode;
	enabledPacks: string[];
	/** Optional vault-relative paths beneath rootFolder. */
	folders?: WorkspaceFolderOverrides;
}

export interface WorkspaceCatalog {
	version: 1;
	workspaces: WorkspaceDefinition[];
}

/**
 * Runtime configuration combines the persisted catalog with one local active
 * selection. activeWorkspaceId itself is not persisted in the catalog.
 */
export interface WorkspaceConfiguration extends WorkspaceCatalog {
	activeWorkspaceId: string;
}

export interface WorkspaceValidationIssue {
	code:
		| 'invalid_id'
		| 'duplicate_id'
		| 'empty_name'
		| 'empty_registry'
		| 'empty_root'
		| 'invalid_root'
		| 'duplicate_root'
		| 'overlapping_root'
		| 'invalid_folder_override'
		| 'missing_active_workspace';
	message: string;
	workspaceId?: string;
	conflictingWorkspaceId?: string;
	field?: string;
}

export interface WorkspaceValidationResult {
	valid: boolean;
	issues: WorkspaceValidationIssue[];
}
