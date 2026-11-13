# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Placeholder test party: the DM's "Add test party" button seats five test characters (druid with wild shape, paladin with smite and aura, warlock with pact magic, wizard, cleric). Seeding twice does not duplicate them.
- Druid, Paladin and Warlock classes in the D&D 5e rules.
- Shared entrance animations in `public/anim.js`: `unfold` (paper turn), `reveal`, `fade`, and `Anim.stagger` for ordered entrances. All collapse to a short fade under reduce motion.

### Changed
- DM sidebar tabs are grouped (Play, Scene, Prep and record) and follow the live mode: a tab shows only when it has content in the current mode.

### Removed
- Table message log on the DM screen, the phones and the TV (the game is played in person).
