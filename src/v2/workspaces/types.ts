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
	| 'universes';

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

export interface WorkspaceConfiguration {
	version: 1;
	activeWorkspaceId: string;
	workspaces: WorkspaceDefinition[];
}

export interface WorkspaceValidationIssue {
	code:
		| 'invalid_id'
		| 'duplicate_id'
		| 'empty_name'
		| 'empty_root'
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
