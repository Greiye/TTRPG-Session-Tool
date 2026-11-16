# Creature wiki pages

The Creature Designer (Planning › 🐉 Creatures) keeps one Markdown page per design in the lore repo, by default `content/creatures/<name>.md` in [Greiye/Artheria.ES.3D.Lore.Game](https://github.com/Greiye/Artheria.ES.3D.Lore.Game). The pages are meant to be edited by hand on GitHub too; **⤓ Pull** reads them back.

## Example

```markdown
---
title: "Grey Goblin"
contributor: "mike"
credit_as: "Mike"
created: 2026-11-16
type: creature
kind: people
epithet: "Soldier strain of the Biomancer"
tags: [goblin, red-book]
designer_id: ds_3fa94c21d0
---
# Grey Goblin
*Soldier strain of the Biomancer*

> Three-foot pests that steal and breed.

## Details
- **Lifespan:** About 25 years
- **Size:** Small

## Stats
- **Agility:** +2
- **Strength:** -1

## Vitals
- **HP:** 7
- **Evasion:** 13

## Skills
- **Stealth:** +4

## Abilities
- **Scrap Blade** `1d6+2`: +4 to hit, a rusty knife.
- **Nimble** (1 Stress): Slip away when an ally is near.

## Inventory
- 2 × Rusty knife: Pitted
- Stolen spoon

## Lore
They multiply quickly and reach adulthood in five years.
```

## Rules

- The front block uses only `key: value` and `key: [a, b]`, like the rest of the lore repo. `kind` is `people`, `beast`, `monster` or `person`; a person may have `race:`. `designer_id` links the page to the design on the laptop.
- The heading, the *epithet* line and the `>` summary come first. Then any of the sections **Details, Stats, Vitals, Skills, Abilities, Inventory, DM notes, Lore**, each a bullet list (Lore is free Markdown).
- List lines are `- **Name:** value`. An ability is `- **Name** (cost) \`roll\`: text`, with cost and roll optional. An item is `- 3 × Name: note`.
- Stats, vitals and skills are free names and values: Daggerheart, 5e and homebrew all fit.
- Any other heading (`## Habits`) and any text the tool does not know is kept in the lore, so a pull never loses words.
- **DM notes** are only written when the DM ticks *with DM notes*; they are marked `<!-- private -->`. The lore repo may be public, so leave it unticked for secrets.
- `README.md` and files starting with `_` in the folder are not designs.
- The lore game's own build (`npm run lore`) only reads `content/lore/` and `content/artifacts/`, so creature pages never break its deploy.
