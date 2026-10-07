# Charted Roots v2 — Historical / World Graph Architecture

> Status: **Design baseline**
>
> This directory records architecture and schema decisions confirmed for the fork. It is the implementation baseline for v2. Undecided items are explicitly marked instead of being silently promoted to requirements.

## Product direction

This fork is **not** a China-only history plugin and is **not** merely a genealogy plugin with extra historical fields.

The long-term model is a general **historical / worldbuilding semantic graph** built on Obsidian, supporting real historical research, non-Chinese history, fiction/game lore and original worlds. Chinese history is the first domain to receive deep built-in support.

## Core model

The system separates four layers:

1. **Entities** — Person, Organization, Place, Office.
2. **Temporal entities** — Event, Process, Period.
3. **Assertions** — facts/relations that may be time-bounded, sourced and disputed.
4. **Interpretations** — Claims, explanations and hypotheses built on facts.

~~~text
Entity
  Person / Organization / Place / Office

Temporal Entity
  Event / Process / Period

Fact Layer
  Assertion -> Citation -> Source

Interpretation Layer
  Claim -> Assertions / Citations
~~~

## Confirmed principles

### Markdown-first

Vault Markdown is the durable source of truth. Plugin indexes/caches are disposable and rebuildable.

### Reuse before reimplementation

Engineering order is **Reuse -> Adapt -> Implement**: use mature libraries, adapters, open APIs and open datasets before writing new algorithms.

### Schema v2 is a one-way upgrade

The fork does **not** require a v2 vault to remain writable by upstream Charted Roots.

~~~text
Charted Roots legacy schema
        ↓ one-way migration
Charted Roots v2 schema
~~~

After migration, legacy parsing belongs in the migration module rather than permanent compatibility branches throughout core code.

### Core generic, Chinese history first

Core ontology, Assertion, temporal and provider architecture remain general. Chinese History Pack is the first rich built-in domain pack.

### Stable machine IDs, localized UI

Domain types use stable English machine IDs. Example:

~~~yaml
org_type: political_faction
~~~

UI metadata may provide `en`, `zh-CN` and user aliases. Changing UI language must not rewrite vault data.

Ordinary plugin settings use normal i18n. Only extensible domain definitions need stable IDs plus localized labels/descriptions/aliases.

## Documents

- [Schema v2](schema-v2.md)
- [Temporal Assertions](temporal-assertions.md)
- [Historical Time](historical-time.md)
- [Temporal Views Foundation](temporal-views.md)
- [Chinese History Pack](chinese-history-pack.md)
- [Evidence, Providers and Reuse](evidence-providers.md)
- [Migration and Implementation Boundaries](migration-and-implementation.md)
- [Multi-Workspace Foundation](multi-workspace.md)

## Confirmed non-goals

v2 does not require:

- reverse migration to upstream Charted Roots;
- bilingual historical article content;
- rebuilding calendar algorithms already available in suitable open-source libraries;
- automatically copying external databases into the vault;
- turning every trivial property into an Assertion note;
- hard-coding every domain term into TypeScript unions.

## Deliberately open items

The following remain implementation/research decisions rather than schema commitments:

- final project/product name;
- exact timeline renderer;
- exact historical map data provider;
- exact storage path for user ontology overrides;
- whether very high-volume Assertions later gain an optimized storage mode;
- redistribution/licensing choices for optional chronology datasets.
