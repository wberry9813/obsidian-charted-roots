# Chinese History Pack v1

## 1. Purpose

The core schema remains general, but Chinese history is the first domain to receive a deep built-in ontology, chronology experience and source vocabulary.

This is a pack, not a set of hard-coded assumptions inside the core model.

## 2. Localization model

A domain definition uses a stable machine ID plus localized UI metadata.

~~~json
{
  "id": "political_faction",
  "labels": {
    "en": "Political faction",
    "zh-CN": "政治派系"
  },
  "descriptions": {
    "en": "A formal or informal political grouping.",
    "zh-CN": "围绕共同政治立场、利益或权力关系形成的政治集团。"
  },
  "aliases": {
    "zh-CN": ["朋党", "派系"]
  }
}
~~~

Vault data remains `org_type: political_faction`. Changing UI language or a user alias must not rewrite notes.

## 3. Ordinary settings versus domain definitions

Normal plugin settings use conventional i18n only. Extensible domain definitions use stable ID + localized label/description + optional aliases. Historical article content itself is not required to be bilingual.

## 4. Organization types — initial set

- `dynasty` — 王朝
- `polity` — 政权 / 国家
- `court` — 朝廷
- `clan` — 宗族
- `lineage` — 世系
- `house` — 世家 / 家族
- `branch` — 房支
- `government_office` — 官署 / 机构
- `military_unit` — 军队 / 军事单位
- `political_faction` — 政治派系
- `party` — 党派
- `school` — 学派
- `religious_organization` — 宗教组织
- `secret_society` — 秘密结社

Specific institutions are entities, not type IDs.

## 5. Relationship predicates — initial direction

Alongside inherited kinship relations:

- `political_rival` — 政治竞争
- `hostile_to` — 敌对
- `ally_of` — 同盟
- `patron_of` / inverse — 庇护
- `recommends` / inverse — 举荐
- `mentor_of` / inverse — 师承
- `lord_of` / inverse — 主从
- `supports_faction` — 支持某派系
- `serves` — 服务于某组织/政权

The vocabulary should remain small and evidence-driven in v1.

## 6. Office categories

Specific offices such as 刺史、丞相、尚书令 are Office entities, not ontology types.

The pack may provide broad categories such as central government, local government, military, court/household, honorary and temporary/acting.

The historical identity of an office may depend on dynasty, institution and period. Same display name does not guarantee the same Office entity.

## 7. Designation types

Initial values:

- `given_name` — 名
- `courtesy_name` — 字
- `art_name` — 号
- `childhood_name` — 乳名
- `posthumous_name` — 谥号
- `temple_name` — 庙号
- `honorific` — 尊号
- `noble_title` — 爵号 / 爵位
- `enfeoffment_title` — 封号

These describe identity Assertions/metadata; they do not all require standalone notes.

## 8. Event / Process / Period vocabularies

Event examples: battle, war, coup, accession, abdication, investiture, appointment, dismissal, reform, rebellion, alliance, diplomatic mission, administrative act.

Process examples: political change, institutional change, socioeconomic change, territorial expansion/contraction, technological diffusion, cultural/intellectual development.

Period examples: historiographical period, dynasty, reign, era-name period, war period, research-defined period.

A Period may have disputed boundaries.

## 9. Source types — initial set

Suggested history-oriented source types:

- official history;
- chronicle;
- biographical history;
- local gazetteer;
- epitaph;
- genealogy;
- archival document;
- archaeological report;
- academic article;
- academic book;
- popular history;
- web article.

These extend the existing Source/Evidence system rather than replacing it.

## 10. Kinship and clan are different

A genealogical connected component is not the same as a historical clan/lineage organization.

Use both:

~~~text
Known kinship graph
+
Organization(type = clan/lineage/house)
~~~

A person may be associated with a lineage even when exact genealogy is incomplete, disputed or merely claimed.

## 11. Chinese names and offices

v1 should avoid prematurely hard-coding every historical naming/office convention into Person frontmatter. The system first needs to support multiple designations over time, offices over time, titles over time, simultaneous identities and source-backed uncertainty.

## 12. CBDB as a modeling reference

The China Biographical Database is an important modeling reference for separating kinship, social association, office postings, status, institutions, places and events.

The fork may study those ideas but should not blindly copy CBDB's schema or redistribute data without confirming licensing/usage terms.
