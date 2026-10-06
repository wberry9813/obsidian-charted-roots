# Source Architecture Audit for v2

> Audit basis: upstream/fork `main` at `d17bc8ce8b78339bc62afde5624772769aeee2d4` plus the v2 design documents on `docs/schema-v2`.

## Executive conclusion

This fork does **not** require a ground-up rewrite.

The codebase already contains strong reusable subsystems for Family Graph, organization/entity handling, Profile View, sources/evidence/citations, events, maps, custom relationship definitions and migrations.

The main v2 work is concentrated in four structural changes:

1. replace legacy dynamic-relation storage with Assertions;
2. introduce a historical temporal normalization layer above/beside the current DateService;
3. generalize hard-coded type definitions into localized registries;
4. add one-way legacy migration and linting.

Overall classification: **medium-to-large refactor, not a rewrite**.

## Module matrix

| Area | v2 action | Reason |
|---|---|---|
| `src/core/family-graph.ts` | Keep + adapter/refactor | Mature graph/rendering logic; already integrates relationship definitions and DateService |
| `src/relationships/types/*` | Generalize | Existing ID/category/inverse/symmetric/family mapping model is valuable |
| `src/relationships/services/relationship-service.ts` | Refactor | Query/UI concepts reusable; frontmatter relation storage becomes legacy/migration input |
| relationship property writer | Retire for dynamic v2 relations | v2 writes Assertion notes instead of parallel relationship fields |
| `src/organizations/services/organization-service.ts` | Keep + extend | Organization remains first-class |
| `membership-service.ts` | Split: legacy reader/migration + v2 query adapter | Current service explicitly reads/writes parallel membership arrays |
| `src/dates/*` | Deep refactor via new layer | Existing service is useful for standard/fictional dates but does not model historical ambiguity/precision/certainty cleanly |
| `src/events/*` | Adapter/refactor | Event infrastructure useful; v2 adds Process/Period and shared temporal model |
| event timeline exporters | Keep renderer/export logic where possible | Should consume normalized `TemporalItem` rather than legacy Event-only shape |
| `src/sources/*` | Keep + extend | Strongest reusable subsystem; Source/Citation/Proof remain core |
| `src/profile-view/*` | Keep UI, change data aggregation | Profile already aggregates relations/memberships/evidence, ideal place to switch to AssertionService |
| `src/maps/*` | Keep + provider adapters later | Existing map UI is reusable; v2 adds WGS84 policy, China conversion and historical layers |
| `src/migration/*` | Keep pattern, add dedicated v1->v2 migrator | Current code shows migration infrastructure, but v2 migration is broader and one-way |
| `src/utils/note-type-detection.ts` | Additive extension | Central note-type detection is already designed for extensibility |
| `main.ts` | Add service registration, avoid rewrite | Existing plugin orchestration can host new registries/services |
| GEDCOM / Gramps / GEDCOM X | Preserve | Family import/export is valuable and should remain isolated from v2 semantic additions |
| collections/grouping | Refactor semantics | research sets should replace historical misuse of `collection/group_name` |

## 1. Note type detection — low risk additive change

`src/utils/note-type-detection.ts` centralizes `cr_type`, legacy `type` and tag detection. This is a good extension point.

v2 should add first-class detection for at least:

- `office`
- `process`
- `period`
- `assertion`
- `claim`

No second competing type detector should be introduced.

## 2. Family Graph — preserve aggressively

`src/core/family-graph.ts` is a large mature subsystem (roughly 2.7k lines at audit time). It already handles:

- person graph construction;
- spouse/parent relationships;
- custom relationship types mapped onto family graph roles;
- date-aware child sorting;
- collection/component analysis;
- compatibility with existing relationship storage.

It should **not** be rewritten in M0/M1.

v2 strategy:

- keep FamilyGraph's compact genealogy inputs;
- add an adapter/provider so eligible v2 Assertions can participate in Family Graph where `familyGraphMapping` allows it;
- eventually move legacy relationship parsing behind migration/compatibility boundaries;
- preserve GEDCOM-oriented simple fields.

This is one of the highest-value upstream assets.

## 3. Relationship subsystem — keep ontology/UI, replace storage

The existing relationship definition already models:

- stable ID;
- category;
- inverse relation;
- symmetry;
- line style;
- Family Graph mapping;
- built-in/custom distinction.

This maps naturally to a v2 `PredicateDefinition`.

What changes:

- fixed `RelationshipCategory` union becomes registry-backed string IDs;
- `name` / `description` become localized labels/descriptions;
- subject/object type constraints and `temporal` metadata are added;
- dynamic relation instances are read from AssertionService rather than Person parallel fields.

`RelationshipService` should evolve toward a query/projection adapter over semantic Assertions. Its legacy frontmatter parser remains useful for migration, but v2 writers must stop emitting the old fields.

## 4. Organization subsystem — entity model is good, memberships are not

`OrganizationService` and Organization notes are worth preserving.

The legacy membership subsystem explicitly supports flat parallel arrays:

- `membership_orgs`
- `membership_org_ids`
- `membership_roles`
- `membership_from_dates`
- `membership_to_dates`
- `membership_notes`

This storage becomes legacy-only after migration.

Recommended split:

- `LegacyMembershipReader` / migration code: deterministic parsing and mismatch detection;
- v2 `AssertionService`: authoritative affiliation/office records;
- organization/profile views: query Assertions to derive membership lists.

Organization type definitions should be generalized from hard-coded unions to registry-backed IDs, preserving existing UI metadata such as icon/category/default roles where useful.

## 5. Date subsystem — deepest foundational refactor

Current `DateService` is built around standard/fictional dates and returns a relatively simple parsed year. It is still valuable and should be wrapped/reused rather than deleted immediately.

However v2 requires a new `HistoricalDateService` because the current model cannot cleanly express:

- one date with multiple chronology representations;
- ambiguous era/regnal expressions;
- no-year-zero rules;
- independent precision and certainty;
- interval semantics for year-only values;
- `not_before` / `not_after` bounds;
- provider-based calendar/chronology resolution.

The existing service can become one provider/adapter for standard and fictional calendars while Tyme/SXWNL/chronology providers are added alongside it.

## 6. Events — adapt rather than discard

`src/events/types/event-types.ts` confirms two legacy issues v2 should deliberately break:

- `DatePrecision` mixes granularity (`year`, `month`) with epistemic state (`estimated`) and temporal shape (`range`);
- relative `before` / `after` fields use counter-intuitive semantics in comments and existing behavior.

The Event service, modal and timeline exporters remain valuable.

v2 should introduce a shared `TemporalEntity` read model and add `Process` and `Period`. Existing timeline/export code can then receive normalized `TemporalItem` projections.

## 7. Source / Evidence / Citation — preserve as a major asset

This subsystem already contains separate services for sources, citations, citation synchronization, evidence coverage, proof summaries and migrations.

It should be extended rather than replaced.

Main v2 change:

- Citation targets generalize from a narrow subject/fact model to Assertion/Claim/property targets;
- evidence coverage can later understand additional historical fact families;
- existing genealogical `sourced_*` support may remain for simple genealogy but should not be expanded as the v2 history model.

## 8. Profile View — ideal integration surface

`ProfileDataLoader` already aggregates:

- Family Graph person data;
- RelationshipService;
- MembershipService;
- EvidenceService;
- Organization data.

This is exactly where v2 can replace multiple legacy queries with a shared Assertion/Semantic query layer while preserving the existing Profile UI structure.

Architectural issue observed: the loader constructs several services ad hoc. As v2 adds registries/providers, prefer plugin-owned shared service instances or a light service container instead of multiplying new objects per load.

## 9. Maps — preserve UI, add semantic/time adapters later

The current map area already has Map View and geocoding support. No map rewrite is required for schema foundation work.

Later v2 work should add:

- WGS84 canonical coordinate policy;
- provider-specific GCJ-02 / BD-09 conversion;
- historical place aliases;
- time-bounded control/boundary layers;
- Timeline/Map synchronization.

These should consume Place/Assertion projections rather than change the core Place storage into provider-specific coordinates.

## 10. Migration infrastructure — reuse pattern, not scope

The repository already contains one-time migration services and migration notices. This is useful precedent for UI/workflow.

v2 migration is materially broader and should be isolated under a dedicated module, for example:

~~~text
src/migration/v1-to-v2/
  analyzer
  preview
  transforms
  conflict-report
  validator
~~~

Legacy relationship/membership parsers should move toward this boundary over time.

## 11. `main.ts` — keep orchestration, add shared v2 services

`main.ts` already creates or registers core services/views and exposes DateService / FamilyGraph creation.

Do not rewrite plugin bootstrap merely to introduce v2.

Add shared instances for:

- `OntologyRegistry`
- `PredicateRegistry`
- `HistoricalDateService`
- `AssertionService`
- later `SemanticIndex`

Then gradually switch Profile/Relationships/Organization views to those services.

## 12. Recommended first development branch scope

The first implementation branch should be deliberately narrow: **M0 v2 foundation**, not migration and not Timeline UI.

Deliverables:

1. extend note type detection for v2 entity types;
2. add v2 common/temporal/assertion TypeScript contracts;
3. add generic localized `TypeDefinition` / `PredicateDefinition` contracts;
4. add `OntologyRegistry` / `PredicateRegistry` with core + Chinese History Pack registration hooks;
5. add unit tests for registry behavior and schema invariants;
6. no removal of legacy writers yet;
7. no vault migration yet.

This creates safe new infrastructure while keeping upstream behavior intact until the migration path exists.

## 13. Risk classification

### Low risk / additive

- note type detection;
- new TypeScript contracts;
- registries;
- pack definitions;
- tests.

### Medium risk

- Profile aggregation;
- RelationshipService projection;
- Organization membership query switch;
- Event/TemporalEntity adapters.

### High risk / postpone until foundation tests pass

- destructive v1->v2 migration;
- removing legacy writers;
- deep DateService replacement;
- Family Graph storage-path changes;
- Timeline/Map synchronized historical state.

## Final recommendation

Proceed with a development branch based on `docs/schema-v2`, not `main`.

The first branch should implement only the v2 schema/registry foundation, leaving all legacy runtime behavior operational. Once the foundation compiles and tests pass, subsequent branches can layer historical time and Assertion storage without forcing a big-bang rewrite.
