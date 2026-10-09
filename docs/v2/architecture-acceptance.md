# Architecture Acceptance — Historical Research Graph

> Status: **In progress**
>
> This document turns the architecture acceptance requirement in
> `migration-and-implementation.md` into executable checks.

## Goal

Prove that a historical-research vault shaped like Spring-and-Autumn /
Warring-States material can move through the v1 -> v2 boundary without
flattening the semantics that motivated v2.

The repository did not contain an existing Spring-and-Autumn / Warring-States
fixture when this acceptance phase started. The test corpus is therefore being
added explicitly rather than treating the generic migration fixture as if it
were that vault.

## Acceptance layers

### A0 — semantic migration plan

- [x] temporal organization affiliations become `member_of` Assertions;
- [x] changing person relationships can preserve distinct time ranges;
- [x] deterministic legacy Event dates map to v2 temporal fields;
- [x] semantically ambiguous identity fields remain Review items rather than
  being guessed;
- [x] one representative v2 graph can contain Person, Organization, Office,
  Event, Process, Period, Assertion, Source, Citation and Claim together.

### A1 — real Obsidian migration execution

- [x] add a dedicated historical legacy-vault fixture;
- [x] execute the Ready subset through the plugin migration API in real
  Obsidian;
- [x] verify exact backups and migration manifest;
- [x] verify Review source notes remain untouched;
- [x] verify migrated Assertions are visible through Workspace-scoped services.

A1 is covered by the real Obsidian foundation smoke using a temporary
`acceptance-history` Workspace. The test restores the prior Workspace catalog
and active Workspace after execution so the acceptance corpus does not leak
into the ordinary History/Shushan scenarios.

### A2 — cross-view semantic acceptance

- [ ] Timeline renders migrated Event / Process / Period and temporal Assertions;
- [ ] Relationships reflects changing relationship Assertions at different
  temporal focus points;
- [ ] Profile exposes concurrent affiliation / office state without flattening;
- [ ] Map and Timeline share historical focus without changing stored source
  semantics.

### A3 — representative research corpus

- [ ] expand the minimal fixture with a larger Spring-and-Autumn /
  Warring-States corpus after the migration contract is stable;
- [ ] record any schema or UX gaps revealed by that corpus as explicit issues
  rather than adding one-off compatibility fields.

## Non-goal

The acceptance corpus is for architecture verification, not for asserting that
every test label or illustrative relationship is a scholarly historical claim.
Evidence quality and historical correctness belong to the research data layer;
the acceptance test checks whether the software can represent and preserve the
required semantics.
