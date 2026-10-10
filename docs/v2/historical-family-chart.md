# Historical Family Chart

> Status: **F0–F4 implemented on `feat/v2-historical-family-chart`; F5 card-state enrichment next**
>
> This document defines a historical-research mode for the existing Interactive
> Family Chart. The mode reuses the person-card surface and layout machinery,
> but adds temporal historical relationships from v2 Assertions.

## 1. Why a historical Family Chart is different

The existing Family Chart answers a genealogy question:

> How are these people connected through parent, child, spouse, adopted,
> step and other family relationships?

Historical research needs a broader but still bounded question:

> Around a selected point in time, how are these people related politically,
> socially, institutionally and militarily?

A historical chart therefore cannot be implemented by merely adding more
genealogy edge types.

Examples:

- brothers later become political rivals;
- a ruler and adviser may be allies for one interval and enemies later;
- a person can serve one regime, defect, then serve another;
- office holding and organization membership change over time;
- the same two people may have several concurrent relationships.

The view must represent those changes without turning Family Chart into a
general heterogeneous knowledge graph.

## 2. Hard semantic boundary: Person-only graph

Historical Family Chart keeps the existing architectural boundary:

- **nodes are Person notes only**;
- Events, Places, Sources, Citations, Organizations, Offices, Claims,
  Processes and Periods never become Family Chart nodes;
- non-person entities may enrich cards, edge tooltips, filters or side panels;
- heterogeneous exploration remains the responsibility of Entity Profile,
  Timeline, Map, Source, Organization and Obsidian Graph/Canvas surfaces.

This keeps the chart readable and preserves compatibility with the existing
`family-chart` renderer.

### Why Organizations and Offices are not nodes

A historical card may show:

- active organizations;
- active offices/titles;
- current allegiance;
- location/context.

But those entities stay card metadata. If they became graph nodes, the view
would stop being a person relationship chart and become an unrestricted entity
graph.

## 3. Relationship layers

The historical mode is composed from two layers.

~~~text
Historical Family Chart
│
├─ Structural family layer
│    parent / child / spouse / adopted / step / foster
│    -> owns layout
│
└─ Historical relationship overlay
     ally / rival / enemy / mentor / patron / vassal / commander /
     colleague / political association / custom predicates
     -> does NOT own genealogy layout
~~~

The family layer remains useful for dynastic and clan history.

The historical overlay adds non-family semantics without destabilizing the
layout engine.

## 4. v2 source of truth

Historical overlay edges come from **materialized v2 Assertion notes**.

Required shape:

~~~yaml
cr_schema: 2
cr_type: assertion
assertion_type: relationship
subject: "[[Person A]]"
predicate: ally
object: "[[Person B]]"
time_start: "196 CE"
time_end: "199 CE"
~~~

Rules:

1. `assertion_type` must be `relationship`;
2. subject and object must both resolve to Person notes;
3. genealogy predicates already mapped into the structural family graph are
   not duplicated as historical overlay edges;
4. undated materialized relationship Assertions can appear in **All time**
   mode, but are not silently treated as active at a specific date;
5. non-person endpoints are rejected by the projector, not merely hidden by
   the renderer.

Compact legacy/person-frontmatter kinship remains handled by
`FamilyGraphService`.

## 5. Temporal model

Historical mode consumes the shared `TemporalFocusService`.

### No focus — All time

Show all valid materialized historical relationship Assertions.

An edge can carry its authored interval in a tooltip / detail surface.

### Julian-Day point focus

Show relationships whose Assertion interval is active at that instant.

Uncertain constraint-only relationships are returned separately as
`possible` and must render distinctly.

### Julian-Day range focus

Show relationships whose active interval overlaps the selected range.

### Chronology-local focus

Real historical graphs must **not** interpret a fictional
`chronology_year` value as JDN.

F1 returns an unsupported-axis diagnostic and leaves the projection unfiltered.
Later fictional/worldbuilding integration may provide a chronology-aware
projector.

## 6. Historical edge contract

~~~ts
interface HistoricalFamilyChartEdge {
  id: string;

  subject: HistoricalFamilyChartPersonRef;
  object: HistoricalFamilyChartPersonRef;

  predicate: string;
  label: string;

  directed: boolean;
  symmetric: boolean;

  temporalState: "all_time" | "active" | "possible";

  timeStart?: string;
  timeEnd?: string;
  confidence?: string;
  researchStatus?: string;

  sourceFilePath: string;
}
~~~

The renderer must not infer direction from line geometry. Directionality comes
from the ontology predicate.

## 7. Visual language

Initial semantics:

- structural family edges keep existing Family Chart styles;
- active historical relationship -> normal opacity;
- possible/uncertain relationship -> reduced opacity + dashed style;
- direction-aware predicate -> arrow marker in later F2/F3 UI work;
- symmetric predicate -> no directional arrow;
- multiple relations between the same pair -> existing overlay offset strategy;
- selected temporal focus should be visible in the toolbar.

Colors should ultimately come from relationship/predicate configuration rather
than hard-coded political semantics.

## 8. Historical mode UI

The existing Family Chart view gains a mode switch:

~~~text
[ Family ] [ Historical ]
~~~

### Family mode

Current behavior remains unchanged.

### Historical mode

- historical overlay enabled by default;
- shared TemporalFocus is displayed and followed;
- historical edge filters replace genealogy-specific custom-overlay defaults;
- family structure remains available as context;
- edit actions that mutate genealogy are not automatically reused for
  historical Assertions.

The mode is view state, so two panes may show Family and Historical modes at
the same time.

## 9. Person-card historical context

Later F5 enriches cards at the current temporal focus with:

- active organization memberships;
- active offices/titles;
- allegiance/state;
- confidence/uncertainty markers;
- possibly place/context.

These are **card badges / detail rows**, never extra graph nodes.

Example at 208 CE:

~~~text
┌─────────────────────┐
│ 曹操                │
│ 汉丞相              │
│ 曹操集团 / 汉廷     │
└─────────────────────┘
~~~

## 10. Person expansion policy

F1/F2 initially overlay historical relationships only when both endpoints are
already visible in the current family tree.

This preserves the stable existing renderer.

F4 adds **historical expansion**:

- start from selected root Person;
- traverse historical person↔person Assertions by depth;
- optionally include family neighbors;
- produce a person-only visible set;
- do not create fake parent/spouse relationships merely to force layout.

F4 may require a historical-network layout mode rather than relying entirely on
family-chart's genealogy layout. That decision is explicitly deferred until
F1–F3 are usable.

## 11. Integration with other v2 views

Shared temporal focus is the coordination boundary.

~~~text
Temporal Timeline
      │
      ▼
TemporalFocusService
  │       │       │
  ▼       ▼       ▼
Map   Relationships  Historical Family Chart
~~~

Expected behavior:

- click/brush Timeline -> historical relation edges update;
- Map time slider -> historical relation edges update;
- Historical Family Chart later may publish a focus when the user selects a
  dated relationship;
- Workspace switch -> projection recomputes against the new Workspace.

## 12. Implementation phases

### F0 — architecture and boundary

- [x] branch historical chart work independently;
- [x] preserve Person-only graph boundary;
- [x] define structural vs historical overlay layers;
- [x] define temporal behavior;
- [x] define organization/office non-node policy.

### F1 — historical relationship projector

- [x] project materialized `relationship` Assertions;
- [x] require Person→Person endpoints;
- [x] preserve predicate label/direction/symmetry;
- [x] skip structural family predicates;
- [x] support All-time projection;
- [x] support JDN point/range active + possible state;
- [x] reject reinterpretation of chronology-local focus;
- [x] unit tests.

### F2 — Family Chart Historical mode

- [x] view-state `mode: family | historical`;
- [x] toolbar mode control;
- [x] historical overlay reuses the mature Family Chart curve renderer;
- [x] possible-state adapter uses distinct dotted styling;
- [ ] predicate filter menu;
- [x] pane state persistence;
- [x] historical mode keeps genealogy editing read-only;
- [x] family mode behavior remains the default.

### F3 — shared TemporalFocus

- [x] subscribe Historical mode to `TemporalFocusService`;
- [x] render current focus in toolbar;
- [x] refresh edges on point/range/clear changes without rebuilding genealogy layout;
- [x] refresh on Workspace switch through `TemporalFocusService.refresh()`;
- [x] ignore own-source focus loops;
- [x] Real Obsidian smoke with Timeline -> chart round trip.

### F4 — historical person expansion

- [x] root-person historical-neighbor traversal model;
- [x] bounded depth policy (default 1, hard max 4);
- [x] family-context inclusion policy without turning family context into traversal seeds;
- [x] integrate expanded people into the view;
- [x] layout decision: hybrid genealogy + historical expansion lanes (deterministic, no fake kinship edges);
- [x] integrate lane rendering into Family Chart;
- [x] large-network performance guard (default 40 people, hard max 100).
- [x] Historical toolbar exposes Depth 1/2/3/4 controls.
- [x] historical-only people render in independent right-side SVG lanes rather than fake genealogy nodes.
- [x] historical relationship overlay connects structural genealogy cards and expanded lane cards.
- [x] shared TemporalFocus recomputes lane membership so historical-only cards appear/disappear with time.
- [x] clicking an expanded historical card opens its Person note.
- [x] expansion depth persists as pane state.

### F5 — historical person-card state

- [ ] active affiliations;
- [ ] active office holdings/titles;
- [ ] organization labels;
- [ ] confidence / possible state;
- [ ] card detail/popup links back to source Assertions.

### F6 — polish and research-scale use

- [ ] directional arrowheads;
- [ ] edge labels / hover labels;
- [ ] multi-edge routing;
- [ ] relation category presets;
- [ ] dense-network decluttering;
- [ ] export historical overlays;
- [ ] manual acceptance on Three Kingdoms showcase.

## 13. Three Kingdoms acceptance scenario

The historical showcase should eventually support a useful snapshot such as
**208 CE**.

A root such as 曹操 should make it possible to inspect:

- family context where recorded;
- political / military person relationships;
- active offices and affiliations on cards;
- relation changes when the shared temporal focus moves;
- synchronized Timeline and Map context.

The acceptance test is not "a line exists". It is whether changing historical
time changes the visible interpretation without mutating source notes.

### Automated real-Obsidian acceptance

The E2E suite now creates temporary Person notes for **荀彧** and **郭嘉** with
no parent/spouse/child genealogy fields, then creates only historical
relationship Assertions:

- 曹操 → 荀彧, active 196–199 CE;
- 荀彧 → 郭嘉, active 196–199 CE.

The real Obsidian test proves that:

1. neither 荀彧 nor 郭嘉 exists in the structural family-chart cards;
2. Historical Depth 1 adds 荀彧 as a right-side lane card;
3. Historical Depth 2 adds 郭嘉 as a second-hop lane card;
4. the 曹操 → 荀彧 historical relationship line crosses from a genealogy card
   to the historical expansion lane;
5. clicking 荀彧 opens the temporary 荀彧 Person note;
6. moving shared TemporalFocus to 201 CE removes both historical-only cards and
   their inactive relationship edges;
7. the following Workspace/UI smoke still passes, proving temporary lane
   fixtures are fully cleaned up and do not leak test state.

## 14. Non-goals

This work does not:

- replace Obsidian Graph;
- turn every v2 entity into a Family Chart node;
- infer historical relationships from prose;
- treat an undated relationship as eternally active at a focused date;
- rewrite genealogy frontmatter when editing historical relations;
- manufacture exact dates from uncertain temporal constraints;
- solve force-directed network layout in F1.
