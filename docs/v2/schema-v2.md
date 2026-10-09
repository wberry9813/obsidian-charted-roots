# Schema v2

## 1. Goals

Schema v2 removes the main structural limits of the legacy model: dynamic relationships are no longer parallel arrays on Person notes; offices/titles/affiliations are no longer flattened into one static field; historical time is not reduced to one Western date string; evidence attaches to specific facts; interpretations remain distinct from facts; and domain vocabularies are extensible/localized without schema changes.

## 2. First-class note types

| `cr_type` | Meaning |
|---|---|
| `person` | Person |
| `organization` | Organization, polity, clan, institution, faction |
| `place` | Geographic / historical place |
| `control_layer` | Time-bounded geographic GeoJSON/control layer |
| `office` | Office or position that can be held |
| `event` | Historically treated occurrence |
| `process` | Sustained development or change |
| `period` | Bounded periodization |
| `assertion` | Time-bounded / sourced fact or relation |
| `source` | Source work/document/object |
| `citation` | Specific locator/evidential relation |
| `claim` | Interpretation, argument, hypothesis or evaluation |
| `universe` | Reality/fictional-world scope |
| `research_project` | Research organization layer |

## 3. Common fields

~~~yaml
cr_schema: 2
cr_type: person
cr_id: <stable-id>

name: 曹操
aliases:
  - 曹孟德

universe: "[[现实历史]]"

research_sets:
  - "[[三国专题]]"

external_ids:
  - wikidata:Q8450
~~~

Rules:

- `cr_schema: 2` identifies the note-level schema.
- `cr_id` remains the stable internal ID.
- Wikilinks remain the human-editable link mechanism.
- `external_ids` uses flat strings rather than nested YAML objects.
- Canonical time/index/provider cache data is not written into normal frontmatter by default.

## 4. Person

~~~yaml
cr_schema: 2
cr_type: person
cr_id: ...

name: 曹操
aliases:
  - 曹孟德

sex: male
born:
died:

father:
mother:
spouses:

universe: "[[现实历史]]"
external_ids:
  - wikidata:Q8450
~~~

Person stores stable identity, not life history. `occupation`, current title, memberships, offices and political relationships are not authoritative Person fields in v2.

Simple genealogy shortcuts such as `father`, `mother`, `spouses`, `born`, `died` remain compact because they work well with GEDCOM and Family Graph. The semantic layer may expose them as virtual Assertions.

## 5. Organization

~~~yaml
cr_schema: 2
cr_type: organization
cr_id: ...

name: 琅琊王氏
org_type: clan

founded:
dissolved:
universe: "[[现实历史]]"
external_ids:
~~~

Organization notes do not maintain authoritative member arrays. Membership is queried from Affiliation Assertions. Time-varying hierarchy uses relation Assertions such as `part_of` rather than a timeless `parent_org`.

## 6. Place

~~~yaml
cr_schema: 2
cr_type: place
cr_id: ...

name: 晋阳
aliases:
  - 晋阳古城

place_type: city
latitude:
longitude:
coordinate_system: WGS84
external_ids:
~~~

Canonical stored coordinates are WGS84. GCJ-02/BD-09 are provider/rendering concerns. Political control or administrative membership is historical Assertion data, not a timeless `country` property.

## 7. Historical control layer

~~~yaml
cr_schema: 2
cr_type: control_layer
cr_id: han-boundary

name: Han boundary
geojson_file: han-boundary.geojson
coordinate_crs: wgs84
source_coordinate_crs: gcj02

time_start: "BCE 202"
time_end: "220 CE"
universe: "[[现实历史]]"
source: "[[Historical Atlas]]"
confidence: high
uncertainty: certain
~~~

The Markdown note is the indexed manifest; geometry remains in the referenced
`.geojson` file. `geojson_file` is relative to the manifest directory by
default; a leading `/` selects a vault-root path.

Persisted geometry is canonical WGS84. `source_coordinate_crs` records import
provenance only. A legacy/non-canonical `coordinate_crs` may be normalized in
memory for compatibility, but the linter reports it until the persisted file is
rewritten as WGS84.

## 8. Office

~~~yaml
cr_schema: 2
cr_type: office
cr_id: ...

name: 丞相
office_type: central_government
universe: "[[现实历史]]"
external_ids:
~~~

Office is first-class because users may need institutional history, rank, jurisdiction, responsibilities and holders over time. Same display name does not imply the same historical Office entity.

## 9. Shared temporal fields

Event, Process, Period and Assertion share:

~~~yaml
time_start:
time_end:
time_not_before:
time_not_after:
time_start_precision:
time_end_precision:
time_start_certainty:
time_end_certainty:
~~~

Event may still have duration. Process represents sustained change. Period represents periodization and may have disputed boundaries.

## 10. Assertion

~~~yaml
cr_schema: 2
cr_type: assertion
cr_id: ...

assertion_type: relationship
subject: "[[李世民]]"
predicate: political_rival
object: "[[李建成]]"

time_start:
time_end:
time_not_before:
time_not_after:
time_start_precision:
time_end_precision:
time_start_certainty:
time_end_certainty:

confidence:
research_status:
notes:
~~~

An Assertion requires `subject`, `predicate`, and exactly one of `object` or `value`.

Literal example:

~~~yaml
subject: "[[曹操]]"
predicate: has_designation
value: 武皇帝
designation_type: posthumous_name
~~~

## 11. Citation

~~~yaml
cr_schema: 2
cr_type: citation
cr_id: ...

source: "[[史记]]"
target: "[[某条 Assertion]]"
target_property:
locator:
quote:
relation: supports
quality:
notes:
~~~

A Citation may target an Assertion/Claim note or a compact property on an entity through `target_property`.

## 12. Claim

~~~yaml
cr_schema: 2
cr_type: claim
cr_id: ...
claim_type: causal
statement: ...
asserted_by: "[[渤海小吏]]"
about:
  - "[[魏国]]"
evidence:
  - "[[某 Assertion]]"
research_status:
confidence:
~~~

User-authored claims may use `asserted_by: self`.

## 13. Universe, Period and Research Set differ

- Universe = which reality/fictional world the material belongs to.
- Period = temporal periodization.
- Research Set = how the user organizes research.

Do not overload them onto one field.

## 14. Storage versus semantic model

Markdown is deliberately simpler than the in-memory semantic graph. The semantic layer may normalize Person kinship fields, Assertion notes, provider results and time expressions into a common graph/temporal model without forcing every note to mirror a theoretical knowledge graph exactly.
