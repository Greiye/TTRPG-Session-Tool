# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- DM takeover: the DM can play any party character from a second DM tab ("Play" on the party list). The character's phone shows a large "DM is controlling your character" message, can still read its sheet and write notes, but cannot act or roll. "Release" hands it back, and closing the DM tab does too.
- Placeholder test party: "Add test party" seats one test character per D&D 5e class (all twelve). Seeding twice does not duplicate them.
- Barbarian, Druid, Monk, Paladin, Sorcerer and Warlock classes in the D&D 5e rules.
- Shared entrance animations in `public/anim.js`: `unfold` (paper turn), `reveal`, `fade`, and `Anim.stagger` for ordered entrances. All collapse to a short fade under reduce motion.

### Changed
- DM sidebar tabs are grouped (Play, Scene, Prep and record) and follow the live mode: a tab shows only when it has content in the current mode.

### Removed
- Table message log on the DM screen, the phones and the TV (the game is played in person).
