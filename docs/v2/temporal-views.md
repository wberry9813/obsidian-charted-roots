# Temporal Views Foundation

> Status: **M5 implementation baseline**
>
> This document supersedes the Event-only assumptions in the older
> `docs/planning/interactive-timeline-view.md` wherever the two conflict.

## 1. Goal

Temporal views are not an Event list with a zoomable axis.

The v2 temporal layer must present one normalized read model over:

- Event;
- Process;
- Period;
- time-bounded Assertion.

Future Timeline, Map and time-aware graph surfaces consume that model rather
than parsing frontmatter independently.

~~~text
Markdown
  Event / Process / Period / Assertion
              ↓
HistoricalDateService
              ↓
TemporalProjectionService
              ↓
TemporalItem[]
       ↓        ↓        ↓
   Timeline    Map    Relation graph
~~~

## 2. TemporalItem is the renderer boundary

`TemporalItem` preserves:

- source file/id;
- temporal kind;
- type/predicate metadata;
- original authored expressions;
- start/end/not-before/not-after boundaries;
- declared precision/certainty;
- parser-resolved precision/certainty;
- resolved / partial / ambiguous / unresolved / undated status;
- legacy Event versus native v2 provenance.

Renderers must not read `date`, `time_start` or other storage fields
directly once they adopt this layer.

## 3. No false precision

A renderer must never turn a year into an arbitrary day merely because a UI
library requires a JavaScript `Date`.

Example:

~~~yaml
time_start: BCE 453
~~~

means the year interval represented by BCE 453. It does **not** mean January 1
of that year.

The historical-date parser's inferred precision is authoritative for
positional precision. Explicit `time_*_precision` metadata is preserved for
validation, but contradictory metadata cannot manufacture a finer coordinate.

An exact day and a year-only expression in the same year may therefore compare
as overlapping/equal rather than receiving an invented intra-year ordering.

## 4. Ambiguity is data

Temporal parsing can be:

- `resolved`;
- `ambiguous`;
- `unresolved`.

Temporal projection preserves those states. A UI may place unresolved or
ambiguous material in a review lane/list, but must not silently pick a
candidate or invent a coordinate.

Undated Event/Process/Period notes remain valid temporal entities and may be
shown in an undated section. Undated Assertions stay semantic graph edges and
are not timeline items until they gain a temporal constraint.

## 5. Migration compatibility boundary

During the one-way Schema v2 transition, Event is special:

- native v2 fields: `time_start`, `time_end`, `time_not_before`,
  `time_not_after`;
- legacy fallback: `date`, `date_end`.

If both exist, v2 fields win for the corresponding boundary.

Legacy `date_precision` is deliberately not trusted as v2 precision because
it mixes precision, certainty and range semantics. The projection parses the
actual expression instead.

This compatibility belongs in `TemporalProjectionService`, not in each
Timeline/Map renderer.

## 6. Workspace boundary

`TemporalProjectionService` accepts a dynamic file provider.

The plugin injects the Active Workspace scope, so one service instance follows
Workspace switches without owning a separate stale cache.

Whole-vault projection is only the standalone fallback when no Workspace
runtime is available.

## 7. Initial M5 implementation phases

### T0 — normalized projection

- [x] `TemporalItem` contract;
- [x] Event / Process / Period / time-bounded Assertion projection;
- [x] legacy Event date fallback;
- [x] HistoricalDateService parsing;
- [x] Workspace-scoped file provider;
- [x] resolved/ambiguous/unresolved/undated preservation;
- [x] non-lossy chronological comparison;
- [ ] precision-declaration conflict diagnostics.

### T1 — temporal validation and queries

- precision conflict diagnostics;
- invalid/inverted start/end interval checks;
- query helpers: items active at time, overlapping range, before/after range;
- subject/object/entity filters for Assertion-derived temporal state;
- stable grouping keys for person/place/organization/universe.

### T2 — renderer adapter

Evaluate the interactive timeline renderer against v2 requirements before
adding a dependency.

The adapter must support interval-native coordinates and a separate
ambiguous/unresolved/undated surface. It must not require conversion of
year-only historical data into fake Gregorian dates.

The old proposal to use `vis-timeline` remains a candidate, not a commitment.

### T3 — interactive Timeline view

- dockable full-size view;
- Event / Process / Period / Assertion visual distinction;
- points and intervals;
- zoom/pan;
- filtering;
- search;
- selection/open-note behavior;
- optional swimlanes;
- unresolved/ambiguous review surface;
- Active Workspace switching.

### T4 — temporal graph/map integration

- relationship state at a selected date;
- organization/office/affiliation state over time;
- timeline ↔ map synchronization;
- Period/Process contextual overlays.

## 8. Reuse from the legacy timeline system

Reuse where semantics still fit:

- existing event colors/icons where Event items are rendered;
- timeline export naming;
- relevant filter/search UI patterns;
- existing report/canvas output utilities when they can consume TemporalItem.

Do not reuse assumptions that:

- every temporal item is an Event;
- every sortable value can be reduced to a JavaScript `Date`;
- year/month precision can be represented by the first day;
- legacy `before` / `after` semantics are authoritative.

## 9. Acceptance gate before renderer work

Before committing to an interactive timeline library, automated tests must
prove:

1. Event, Process, Period and timed Assertion share one projection contract;
2. legacy Event and v2 Event dates coexist without duplicate boundaries;
3. Workspace switching changes the projected dataset;
4. BCE/CE order is correct;
5. year-only versus exact-day overlap does not invent order;
6. contradictory precision metadata cannot increase positional precision;
7. ambiguous/unresolved expressions remain non-coordinate states;
8. interval and bound queries behave correctly.

Only then should M5 bind this data layer to a rendering engine.
