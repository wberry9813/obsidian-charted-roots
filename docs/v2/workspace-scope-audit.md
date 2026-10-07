# Workspace Scope Audit

> Branch baseline: `feat/v2-workspaces`
>
> Purpose: distinguish Workspace-scoped data from intentionally vault-global
> state and identify remaining surfaces before Multi-Workspace Foundation is
> considered complete.

## 1. Scope rule

A Workspace is the primary dataset boundary.

Entity discovery, graph construction, structured facts, migrations, default
creation paths and generated research outputs should use the Active Workspace
unless the user explicitly chooses another scope.

FolderFilter remains a secondary filter *inside* the Workspace.

## 2. Intentionally vault-global

These must not be silently converted to Workspace-local state:

- `cr_id` uniqueness and duplicate-id validation;
- plugin installation/settings that are genuinely UI/application preferences;
- the Workspace catalog itself;
- built-in ontology/type definitions;
- user-defined global relationship/type definitions until per-Workspace
  ontology overrides are explicitly designed;
- manual Obsidian wikilinks: cross-Workspace links may be warned about later,
  but existing links are not destroyed;
- Recent Files persistence may remain global, while Workspace UI projections
  filter entries to the active scope.

## 3. Workspace catalog/local state split

Shared with the vault/Git:

~~~text
.charted-roots/workspaces.json
~~~

Contains Workspace definitions:

- stable id;
- display name;
- root folder;
- mode;
- enabled packs;
- relative folder overrides.

Local plugin state:

~~~text
data.json
activeWorkspaceId
~~~

Changing the active Workspace should not dirty Git-visible vault metadata.

## 4. Scoped core services

Implemented on `feat/v2-workspaces`:

- WorkspaceRegistry / WorkspaceService / WorkspaceScope;
- AssertionService;
- SemanticAssertionService;
- Schema v2 migration analyzer / plan / executor;
- EventService;
- SourceService;
- OrganizationService;
- UniverseService;
- PersonIndexService;
- FamilyGraphService;
- PlaceGraphService;
- MembershipService;
- RelationshipService;
- EvidenceService;
- ProofSummaryService;
- Citation note/sync services;
- SchemaService / validation;
- Statistics/VaultStats projections;
- Calendar data/view;
- Staging/Web Clipper;
- Report generation context;
- Map data;
- Data Quality and destructive cleanup/migration surfaces.

Caches must either be invalidated on active Workspace change or include the
Workspace id in their cache scope key.

## 5. Scoped creation/output paths

Implemented or in active branch work:

- People;
- Places;
- Events;
- Organizations;
- Universes;
- Assertions;
- Sources/Citations;
- Schemas;
- Staging/Notes;
- Maps;
- Reports/Timelines;
- Canvas/Excalidraw tree output;
- Book definitions;
- GEDCOM/Gramps entity import;
- GEDCOM/GEDCOM X/Gramps export defaults.

Default output paths resolve from `WorkspaceService.getFolder(...)`.

Explicit user-selected custom export paths are allowed and treated as an
intentional override.

## 6. User-facing surfaces already scoped

- Workspace Manager and active Workspace controls;
- Control Center/Dashboard summaries and recents projection;
- Profile structured data;
- Collections through scoped graph services;
- Timeline/research timeline;
- Calendar;
- Maps/Places;
- Family Chart graph;
- Unified Tree Wizard;
- Reports and Book Builder;
- Import/Export default entity folders.

## 7. Import/export policy

Default import/export is Workspace-local.

Import defaults:

~~~text
people      -> Active Workspace / People
places      -> Active Workspace / Places
events      -> Active Workspace / Events
sources     -> Active Workspace / Sources
notes       -> Active Workspace / Notes
~~~

Export "Preference folders" resolves from the Active Workspace.

"Custom folders" remains an explicit advanced override. Export preview and
actual export must use the same selected folder set rather than borrowing
global service caches.

## 8. Media policy — intentionally unresolved

Media is not yet assigned a final Workspace ownership rule.

Existing plugin behavior supports globally configured media folders and media
may reasonably be shared by several datasets.

Until a separate asset-policy decision is made:

- do not infer Workspace membership from media path;
- do not move existing media during Workspace migration;
- entity notes remain Workspace-scoped even when they reference shared media;
- import UIs may keep explicit media destination selection.

Possible future policies:

1. vault-global shared media library;
2. per-Workspace Media folder;
3. hybrid: Workspace default + explicitly shared libraries.

This decision should not block entity/data isolation.

## 9. Remaining audit areas

Before Foundation is frozen, verify these categories rather than blindly
replacing every whole-vault scan:

- import/export edge cases and format-specific exporters;
- picker modals that instantiate their own graph/index services;
- tree/canvas helpers outside the main wizard;
- book/report selectors that read Markdown directly;
- merge/duplicate/cleanup entry points not already routed through Data Quality;
- media tooling once asset policy is chosen;
- any background watcher whose cache survives Workspace switches.

A whole-vault scan is acceptable only when its semantic purpose is explicitly
vault-global (for example `cr_id` uniqueness).

## 10. Acceptance gate

Multi-Workspace Foundation is ready for user testing when:

- fast type-check/unit tests pass;
- real Obsidian E2E passes;
- two Workspaces can coexist without entity/assertion/event/source leakage;
- creation paths follow the active Workspace;
- Workspace switching invalidates/rekeys relevant caches;
- Schema v2 migration only touches the selected Workspace;
- default import/export does not leak another Workspace;
- generated Tree/Canvas/Report/Book outputs default under the active Workspace;
- vault-global identity checks still detect duplicate `cr_id` across
  Workspaces;
- legacy Default Workspace bootstrap remains non-destructive.
