# Migration and Implementation Boundaries

## 1. One-way migration

Migration is a schema upgrade, not synchronization.

~~~text
legacy vault
   ↓ analyze
   ↓ preview
   ↓ backup / Git commit
   ↓ migrate
   ↓ rebuild index
   ↓ lint
v2 vault
~~~

A migrated v2 vault is not required to remain writable by upstream Charted Roots.

Legacy readers belong in a dedicated migration module. Core v2 code should not accumulate permanent `if legacy ... else v2 ...` branches.

## 2. Migration rule

**Deterministic mapping -> migrate automatically.**

**Ambiguous mapping -> preserve data and require review.**

**Never guess.**

## 3. Migration workflow

### Analyze

Report note counts, legacy fields, safe conversions, ambiguous mappings, parallel-array mismatches, unresolved links, probable Event/Process/Period candidates and date formats requiring review.

### Preview

Show planned changes before mutation.

Example:

~~~text
魏文侯.md

REMOVE legacy membership arrays

CREATE
Assertions/魏文侯—魏氏—宗主—....md
Assertions/魏文侯—魏国—君主—....md
~~~

### Migrate and validate

Perform only approved deterministic conversions, rebuild semantic indexes, then run v2 lint.

## 4. Major field mappings

| Legacy | v2 |
|---|---|
| `date` | `time_start` |
| `date_end` | `time_end` |
| mixed `date_precision` semantics | separate precision + certainty |
| relationship parallel fields | Relationship Assertions |
| `membership_*` arrays | Affiliation / Office Assertions |
| static `occupation` | review -> Office/Status Assertion |
| static `title` | review -> Title/Designation Assertion |
| `parent_org` | `part_of` Assertion |
| organization member lists | reverse query from Assertions |
| `collection` | `research_sets` where semantically appropriate |
| research-topic misuse of `group_name` | review -> Research Set |
| pseudo-event | review -> Event / Process / Period |
| legacy `before` / `after` | unambiguous chronology relations |

## 5. Parallel arrays

Legacy membership and custom relationship arrays rely on index alignment. If lengths or indexes do not align, that record is blocked for manual review.

Example:

~~~text
organizations: 5
roles: 4
from_dates: 5

=> manual review required
~~~

The migrator must not infer which value is missing.

## 6. Date migration

Legacy precision metadata must not be mapped mechanically.

~~~yaml
date: BCE 453
date_precision: exact
~~~

The value itself only identifies a year, so v2 should infer year precision. Legacy metadata may inform certainty, but the parsed expression has priority.

Required regression cases include BCE ordering, 1 BCE -> 1 CE without display year zero, approximate/disputed certainty preservation and unresolved historical expressions remaining reviewable.

## 7. Event / Process / Period review

Sustained historical developments should not remain fake point Events.

Examples:

- 晋国六卿形成
- 周朝封建分权
- 春秋战国生产力突破

Migration may suggest Process/Period but must not silently reclassify semantics.

## 8. Backup and report

Before destructive migration require a Git commit, archive backup or explicit confirmation that a backup exists.

Migration output should report converted files, created Assertions, removed legacy fields, warnings and unresolved conflicts.

## 9. Schema marker

The vault should carry schema metadata conceptually like:

~~~json
{
  "schemaVersion": 2,
  "ontologyVersion": 1,
  "enabledPacks": ["core", "chinese-history"],
  "defaultLocale": "zh-CN",
  "migrationHistory": []
}
~~~

Exact path is implementation detail, but schema identity belongs to the vault rather than only plugin-local settings.

# Implementation boundaries

## 10. Keep and extend

### Family Graph / genealogy core

Keep biological parent relationships, spouse handling, family-component computation, Family Chart and GEDCOM foundation. Generalize the semantic layer so kinship can appear as virtual Assertions and participate in broader graph views.

### Source / Evidence / Citation / Proof

Keep the mature evidence foundation and extend it for Assertion/Claim targets and history-oriented source types.

### Organization notes

Keep Organization as a first-class entity but replace membership storage with Assertion-based affiliation.

### Maps

Keep Leaflet initially. Add Chinese coordinate conversion and historical/time-bounded layers later.

### Profile view

Keep Profile, but derive dynamic information from Assertions instead of static Person fields.

## 11. Refactor

### Relationships

Reuse useful concepts from the existing relationship definition: stable ID, description, category, inverse, symmetry and Family Graph mapping. Refactor these into a generic Predicate/Type Registry with localization and subject/object constraints.

### Organizations

Refactor hard-coded organization unions to string IDs validated by the registry. Localize labels/descriptions. Stop writing membership parallel arrays.

### Events and dates

Refactor Event dates into shared temporal fields and parsing. Add Process and Period.

### Settings/type definitions

Separate ordinary UI settings i18n from extensible ontology definitions with stable IDs and localized labels/descriptions/aliases.

## 12. Retire after migration

Legacy-only storage includes:

- `membership_orgs`
- `membership_org_ids`
- `membership_roles`
- `membership_from_dates`
- `membership_to_dates`
- `membership_notes`
- dynamic relationship parallel fields such as `mentor_from` / `mentor_to`
- static occupation/title as the authoritative historical model
- mixed-semantics `date_precision`
- counter-intuitive legacy `before` / `after`
- research-topic misuse of `group_name`

Migration code may read them; v2 writers should not produce them.

## 13. Preserve compact genealogy shortcuts

Do not Assertion-ize every simple family property merely for theoretical purity. `father`, `mother`, `spouse`, `born`, `died` remain useful compact storage for GEDCOM/Family Chart workflows. The semantic layer can project them into virtual Assertions.

## 14. New modules/capabilities

Expected additions:

- v2 schema types;
- Ontology/Type Registry;
- Predicate Registry;
- Assertion Service;
- Historical Date Service;
- Calendar/Chronology provider interfaces;
- Process entity;
- Period entity;
- Office entity;
- Claim entity;
- v1 -> v2 Migration;
- v2 Linter;
- semantic graph projection;
- normalized temporal projection for Timeline.

## 15. Suggested implementation order

### M0 — schema/contracts

TypeScript interfaces, vault schema marker, ontology/predicate registry and test fixtures.

### M1 — historical time foundation

BCE/CE normalization, separate precision/certainty, parser contract, Tyme provider prototype and BCE regression tests.

### M2 — Assertion foundation

Assertion note type, read/write service, Profile queries, virtual kinship assertions and relationship/affiliation/office assertions.

### M3 — migration

Legacy analyzer, preview, deterministic transforms, conflict report and linter.

### M4 — Chinese History Pack v1

Localized organization types, relationship predicates, designation/source types and chronology vocabulary/data integration.

### M5 — temporal views

Process/Period, normalized TemporalItem, rich Timeline and time-aware relationship graph.

### M6 — historical map

WGS84 canonical coordinate policy, GCJ-02/BD-09 adapters, historical aliases, time-bounded GeoJSON/control layers and timeline-map synchronization.

## 16. Linter baseline

Initial checks should include duplicate `cr_id`, unknown `cr_type`/predicate/type IDs, missing Assertion subject/predicate, invalid object/value cardinality, invalid subject/object entity type, start > end, unresolved/ambiguous historical dates, missing Citation source/target, residual legacy fields, broken wikilinks and severe birth/death/activity contradictions as warnings.

Historical contradictions are not always data errors; disputed evidence should usually be warnings rather than destructive fixes.

## 17. Architecture acceptance test

Before heavy Timeline/Map UI work, migrate the existing Spring-and-Autumn / Warring-States test vault and verify that v2 cleanly represents people, organizations, offices, changing relationships, concurrent affiliations, events, processes, periods, historical dates, sources/citations and attributed claims.
