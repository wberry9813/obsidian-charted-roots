# Temporal Assertions

## 1. Historical relations are time-aware

A later relationship does not erase an earlier structural relationship.

李世民 and 李建成 can simultaneously be brothers, political rivals and later openly hostile.

~~~text
Kinship              ─────────────────────
Political rivalry          ─────────────
Hostility                       ────────
~~~

The model therefore stores independent relations with their own temporal validity rather than mutating one enum value over time.

## 2. Core edge

~~~text
Subject --Predicate--> Object

+ time
+ qualifiers/context
+ evidence
+ research status
~~~

Typical dynamic domains include interpersonal relationship, affiliation, office holding, title holding, social/political status, designation/name usage, residence, place control and organization hierarchy.

## 3. Initial Assertion categories

- `relationship`
- `affiliation`
- `office_holding`
- `title_holding`
- `designation`
- `status`
- `residence`
- `control`
- `organization_relation`
- `generic`

The set is intentionally small.

## 4. Relationship examples

~~~yaml
cr_type: assertion
assertion_type: relationship
subject: "[[李世民]]"
predicate: political_rival
object: "[[李建成]]"
time_start:
time_end:
~~~

A separate hostile relation may overlap:

~~~yaml
cr_type: assertion
assertion_type: relationship
subject: "[[李世民]]"
predicate: hostile_to
object: "[[李建成]]"
time_start:
time_end:
~~~

## 5. Office, title and designation are distinct

曹操 illustrates the distinction.

### Office

~~~yaml
cr_type: assertion
assertion_type: office_holding
subject: "[[曹操]]"
predicate: holds_office
object: "[[丞相]]"
organization: "[[汉朝廷]]"
time_start: 建安十三年
time_end:
~~~

Optional qualifiers may include organization, jurisdiction, place, rank, appointment method and acting/substantive status.

### Title

~~~yaml
cr_type: assertion
assertion_type: title_holding
subject: "[[曹操]]"
predicate: holds_title
object: "[[魏公]]"
time_start:
time_end:
~~~

### Designation

~~~yaml
cr_type: assertion
assertion_type: designation
subject: "[[曹操]]"
predicate: has_designation
value: 武皇帝
designation_type: posthumous_name
~~~

A posthumous designation is not a life-time office.

## 6. Multiple simultaneous identities

A Person may have several valid Assertions at the same time:

~~~text
Person
 ├ holds_office -> Office A
 ├ holds_title -> Title B
 ├ member_of -> Organization C
 ├ political_rival -> Person D
 └ resides_at -> Place E
~~~

There is no single authoritative `role` or `occupation` field.

## 7. Affiliation versus office holding

These remain separate:

~~~text
Person --member_of/serves--> Organization
Person --holds_office-------> Office
~~~

An Office Assertion may additionally reference the organization where the office exists.

## 8. Organization hierarchy

Historical institutions can move between parent bodies, so hierarchy can be time-bounded:

~~~yaml
cr_type: assertion
assertion_type: organization_relation
subject: "[[机构A]]"
predicate: part_of
object: "[[机构B]]"
time_start:
time_end:
~~~

## 9. Place control

~~~yaml
cr_type: assertion
assertion_type: control
subject: "[[秦国]]"
predicate: controls
object: "[[河西]]"
control_type: political
time_start:
time_end:
~~~

Map rendering can query valid Assertions at a selected date.

## 10. Virtual Assertions

Not every semantic edge needs a physical Assertion note. Compact genealogy fields such as `father: [[李渊]]` may become virtual edges in memory.

Assertion origins may include:

- `frontmatter`
- `assertion_note`
- `derived`
- `provider`

Views consume the normalized semantic interface instead of caring where an edge came from.

## 11. User experience

Users should normally add an office/relation through Profile UI rather than hand-writing YAML. The plugin materializes the corresponding Assertion note behind the UI. The model is strict while normal use stays simple.
