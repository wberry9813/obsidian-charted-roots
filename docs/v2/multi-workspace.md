# Multi-Workspace Foundation

> Status: **Foundation implemented on `feat/v2-workspaces`; automated acceptance covered; ready for user testing after final CI**
>
> This document defines how one Obsidian vault can host multiple independent
> Charted Roots datasets without mixing their entities, assertions or views.

## 1. Problem

The legacy plugin has one global set of folder settings such as:

- `peopleFolder`
- `placesFolder`
- `eventsFolder`
- `organizationsFolder`
- `sourcesFolder`
- `citationsFolder`
- `basesFolder`
- `universesFolder`

Their defaults happen to share a `Charted Roots/` prefix, but there is no
first-class dataset/root concept.

Several services also scan the whole vault directly with
`app.vault.getMarkdownFiles()`. As a result, manually placing historical,
fictional and genealogy data in separate folders does not create reliable
isolation.

v2 needs an explicit data-scope layer.

## 2. Core model

One Obsidian vault may contain multiple Charted Roots Workspaces.

~~~text
Obsidian Vault
│
├ Workspace: 中国历史
│  ├ People
│  ├ Offices
│  ├ Organizations
│  ├ Places
│  ├ Events
│  ├ Processes
│  ├ Periods
│  ├ Assertions
│  ├ Claims
│  ├ Sources
│  └ Citations
│
├ Workspace: 蜀山
│  ├ People
│  ├ Places
│  ├ Events
│  ├ Assertions
│  └ Sources
│
└ Other normal Obsidian notes
~~~

A Workspace is simultaneously:

1. a **storage boundary**;
2. an **index/query boundary**;
3. the default **creation location**;
4. a default **mode / ontology-pack context**.

It is not a separate Obsidian vault.

## 3. Workspace definition

Conceptual contract:

~~~ts
interface WorkspaceDefinition {
  id: string;
  name: string;

  rootFolder: string;

  mode:
    | "genealogy"
    | "historical"
    | "worldbuilding";

  enabledPacks: string[];

  folders?: {
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
  };
}
~~~

Folder overrides are **relative to the Workspace root**.

Example:

~~~json
{
  "id": "history-cn",
  "name": "中国历史",
  "rootFolder": "History/Chinese-History",
  "mode": "historical",
  "enabledPacks": ["core", "chinese-history"],
  "folders": {
    "people": "人物",
    "places": "地理",
    "sources": "史料"
  }
}
~~~

## 4. Workspace identity and file membership

v1 Workspace membership is path-based.

~~~text
History/Chinese-History/People/Cao-Cao.md
             ↓
Workspace root = History/Chinese-History
             ↓
Workspace = history-cn
~~~

Normal entity notes do **not** receive a `cr_workspace` property.

This avoids two competing sources of truth when users move files.

### Root rules

For the first implementation:

- one Workspace has exactly one root folder;
- two Workspace roots must not be equal;
- Workspace roots must not be nested inside one another;
- root ownership is therefore unambiguous;
- notes outside every Workspace remain ordinary Obsidian notes.

Nested/overlapping Workspaces may be reconsidered later only if a concrete use
case justifies the extra ambiguity.

## 5. IDs remain vault-global

`cr_id` remains unique across the entire Obsidian vault.

Workspace is a scope boundary, not a new ID namespace.

This preserves simple backlink/reference resolution and leaves a clean path for
future explicit cross-Workspace links.

## 6. Persistence boundaries

Workspace definitions must be portable with the vault, but the currently
selected Workspace is a local UI preference.

Persist them separately:

~~~text
.charted-roots/workspaces.json
  Workspace definitions, roots, modes, packs and folder overrides

.charted-roots/vault.json
  Schema v2 marker, ontology version and migration history

plugin data.json
  activeWorkspaceId
~~~

Workspace configuration deliberately does **not** live inside
`.charted-roots/vault.json`: Workspaces must be establishable before a legacy
vault completes Schema v2 migration, so creating a Workspace must never
accidentally claim that the vault is already Schema v2.

Changing Active Workspace must not dirty a Git-tracked Workspace catalog.

## 7. Active Workspace

The first version has one Active Workspace.

~~~text
Workspace: 中国历史 ▼
           蜀山
           小说 B
           ────────
           Manage Workspaces
~~~

Switching Active Workspace must invalidate/rebuild Workspace-scoped caches and
refresh relevant views.

An "All Workspaces" aggregate view is explicitly deferred.

## 8. Workspace Scope

Services must stop deciding their own vault scope.

Instead of:

~~~ts
app.vault.getMarkdownFiles()
~~~

v2 services should depend on one shared scope abstraction:

~~~ts
workspaceScope.getMarkdownFiles()
workspaceScope.contains(file)
workspaceScope.getWorkspaceForPath(path)
~~~

Initial candidates to convert:

- Person index / Family Graph discovery
- EventService
- OrganizationService
- SourceService
- Place/Map discovery
- AssertionService
- Citation/Evidence discovery
- UniverseService
- Migration Analyzer
- Timeline projections

The scope layer is the authoritative dataset boundary.

## 9. Folder path resolution

Creation paths should also stop reading global absolute folder settings
directly.

Conceptual API:

~~~ts
workspacePaths.people
workspacePaths.events
workspacePaths.assertions
workspacePaths.sources
~~~

A resolver combines:

~~~text
Workspace root
+
relative folder override or default
=
real vault path
~~~

Example:

~~~text
rootFolder: History/Chinese-History
people: 人物

=> History/Chinese-History/人物
~~~

## 10. Workspace versus Universe

They are intentionally separate concepts.

**Workspace** answers:

> Which Markdown files form this independent dataset?

**Universe** answers:

> Which in-world/reality context does an entity belong to?

A Worldbuilding Workspace may contain multiple Universes.

A historical Workspace may contain no Universe at all.

~~~text
Workspace: 蜀山研究
├ Universe: 人间
├ Universe: 仙界
└ Universe: 魔界
~~~

Universe must not be repurposed as a storage/index boundary.

## 11. Workspace versus Research Set

Research Set is an analytical grouping **inside** a Workspace.

~~~text
Workspace: 中国历史
├ Research Set: 三家分晋
├ Research Set: 魏国专题
└ Research Set: 河西专题
~~~

Research Sets may overlap. Workspace membership does not.

## 12. Mode and ontology packs

Workspace is the natural owner of default working mode and packs.

Examples:

~~~text
中国历史
  mode: historical
  packs:
    - core
    - chinese-history

蜀山
  mode: worldbuilding
  packs:
    - core
~~~

The first foundation implementation may store this metadata before every UI
actually reacts to mode/packs. The important part is to put the ownership in
the correct layer now.

## 13. Cross-Workspace references

Default UI behavior is isolated.

Entity pickers, relationship targets and creation flows should query the Active
Workspace by default.

If an existing wikilink resolves into another Workspace, the semantic layer
must be able to identify that fact.

First release policy:

- no accidental cross-Workspace suggestions;
- same-Workspace targets by default;
- explicit cross-Workspace creation is deferred or requires a warning;
- existing manual Obsidian wikilinks are never destroyed merely because they
  cross a Workspace boundary.

## 14. Existing Folder Filter

The current FolderFilterService is not a Workspace substitute.

It may survive as a **secondary filter inside a Workspace**, for example to
temporarily exclude archival or draft subfolders.

Workspace root remains the primary dataset boundary.

Legacy include/exclude folder settings should be migrated or isolated rather
than defining Workspace identity.

## 15. Legacy folder migration

The common legacy layout:

~~~text
Charted Roots/
├ People/
├ Places/
├ Events/
├ Organizations/
└ Sources/
~~~

can become:

~~~text
Workspace:
  id: default
  name: Default
  rootFolder: Charted Roots
~~~

without moving files.

Legacy global folder settings should be analyzed to determine whether they
share one safe common root.

### Deterministic case

~~~text
Charted Roots/People
Charted Roots/Places
Charted Roots/Events
~~~

=> automatically create one Default Workspace rooted at `Charted Roots`.

### Ambiguous case

~~~text
人物/
History/Events/
Research/Sources/
~~~

=> do not guess a root; require manual Workspace setup.

The migration principle remains:

> deterministic -> automate; ambiguous -> review; never guess.

## 16. Interaction with Schema v2 migration

Workspace Foundation must land before destructive Schema v2 migration is
exposed to users.

Preferred sequence:

~~~text
legacy settings/folders
        ↓
establish Workspace boundary
        ↓
analyze only that Workspace
        ↓
preview / plan
        ↓
execute Schema v2 migration
~~~

The existing migration transaction/rollback implementation remains useful; its
input scope changes from whole-vault to Workspace.

## 17. First implementation scope

W0-W4 are implemented on `feat/v2-workspaces`. The milestones below now describe the shipped Foundation boundary rather than future work.

### W0 — contracts and registry

- WorkspaceDefinition
- WorkspaceRegistry
- activeWorkspaceId
- validation: stable IDs, non-overlapping roots
- default folder map

### W1 — path and scope services

- WorkspacePathResolver
- WorkspaceScope
- path -> Workspace lookup
- contains(file)
- scoped Markdown discovery

### W2 — settings compatibility

- derive one Default Workspace from the standard legacy folder layout
- no file move
- preserve legacy settings during transition
- explicit review for ambiguous scattered legacy paths

### W3 — core service adoption

Convert the most important full-vault scanners first:

1. AssertionService
2. Migration Analyzer / Plan / Executor
3. EventService
4. OrganizationService
5. SourceService
6. UniverseService
7. Person/Family discovery integration

### W4 — UI

- Active Workspace selector
- Manage Workspaces
- create/edit/remove Workspace definition
- root/folder validation
- cache/view refresh on switch

## 18. Deferred work

Not part of Foundation:

- simultaneous multi-Workspace views;
- Workspace comparison;
- shared Source libraries;
- cross-Workspace relationship UX;
- Workspace packages/import/export;
- nested Workspaces;
- per-Workspace UI language;
- per-Workspace Git repositories.

## 19. Acceptance tests

All ten Foundation acceptance conditions are now represented by automated unit/integration tests and real-Obsidian E2E coverage on `feat/v2-workspaces`.

The acceptance contract remains:

1. two Workspaces in one real Obsidian vault do not mix Person/Event/Assertion
   discovery;
2. creation paths resolve under the active Workspace;
3. switching Workspace invalidates scoped caches;
4. a file outside all Workspace roots is ignored by scoped services;
5. overlapping/nested Workspace roots are rejected;
6. moving a file between roots changes Workspace ownership without frontmatter
   migration;
7. `cr_id` duplicate detection remains vault-global;
8. migration analyzer touches only the selected Workspace;
9. legacy `Charted Roots/*` layout becomes a Default Workspace without moving
   files;
10. ambiguous legacy folders are reported for review rather than guessed.
