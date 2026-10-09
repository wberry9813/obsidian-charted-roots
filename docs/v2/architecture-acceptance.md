# Architecture Acceptance — Historical Research Graph

> Status: **Complete**
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

- [x] Timeline renders migrated Event plus representative Process / Period and
  temporal Assertions in the isolated acceptance Workspace;
- [x] Relationships reflects changing relationship Assertions at different
  temporal focus points (ally at 675 BCE, rival at 665 BCE);
- [x] Profile exposes concurrent affiliation and office-holding state without
  flattening those facts back onto the Person note;
- [x] Map and Timeline share historical JDN focus in both directions:
  an explicit BCE Map slider action publishes a shared range consumed by
  Timeline, and a Timeline point focus is consumed by Map temporal layers,
  while migrated Person / Event / Assertion source files remain byte-for-byte
  unchanged by navigation.

### A3 — representative research corpus

- [x] expand the minimal fixture into a small two-polity historical-research
  corpus spanning Person, Organization, Office, Event, Process, Period,
  temporal Assertions, Source, Citation and Claim;
- [x] record schema / UX gaps in the acceptance gap register rather than
  adding one-off compatibility fields.

The expanded real-Obsidian corpus contains 20 static records before migration,
plus the four Assertions created from the Ready legacy subset. It verifies a
second polity/institution/office chain, time-bounded organization hierarchy,
additional event material and a Source -> Citation -> Assertion /
Claim -> evidence research chain.

## Gap register

### AA-GAP-001 — Map lifespan parser does not consume v2 BCE expressions

**Status:** open, non-blocking for architecture acceptance.

The v2 historical time layer accepts explicit expressions such as
`BCE 700`, but the legacy Map lifespan path delegates Person `born` /
`died` to `DateService.parseDate()`. A three-digit era expression such as
`BCE 700` is not converted into the Map slider's canonical numeric year, so
it does not contribute to the slider range.

The same path accepts legacy numeric values such as `-700`; with the explicit
`legacyNegativeYearSemantics: bce_display` policy, the Map -> JDN bridge can
then interpret that value safely as 700 BCE.

**Desired direction:** allow Map lifespan navigation to consume the same
historical expressions as the v2 time layer without weakening the rule that
ambiguous bare non-positive years require an explicit interpretation policy.

**Acceptance decision:** keep the migration fixture in its real legacy numeric
shape and track this integration gap explicitly. Do not add a test-only or
schema-only compatibility field.

GitHub Issues is disabled for this repository, so acceptance gaps are tracked
here with stable `AA-GAP-xxx` identifiers.

## Non-goal

The acceptance corpus is for architecture verification, not for asserting that
every test label or illustrative relationship is a scholarly historical claim.
Evidence quality and historical correctness belong to the research data layer;
the acceptance test checks whether the software can represent and preserve the
required semantics.
