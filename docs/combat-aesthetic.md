# Combat aesthetic

Design notes for how fights look and feel on the TV, the DM laptop and the phones (Mike, Nov 16).
**Docs only. Nothing here is built yet.** Every item is a possible feature with its open choices.

## The idea

Combat should feel physical. A player does not just tap "Attack": they swipe, hold, draw, sing or mix
on their phone, and the phone answers with haptics and sound. The TV then plays the result as a short,
cinematic moment.

## Rules every feature follows

- **The DM rules.** Gestures never decide an outcome on their own. Every automated result keeps a
  one-tap DM override, like the rest of the tool.
- **System-agnostic.** Mike is building his own system (Daggerheart, 5e and homebrew). Weapon kinds,
  body parts, spell styles and multipliers are editable data, not 5e rules baked into code.
- **Never block a turn.** Every gesture has a plain button fallback (accessibility, a cracked screen,
  a friend who just wants to roll). A missed or skipped gesture falls back to a normal roll.
- **Respect the Motion setting.** Reduce motion turns shakes, sweeps and long animations into short
  fades (`public/settings.js`, `public/anim.js`). A new **Combat effects** setting (On / Off) switches
  the whole layer off per device, and on the TV through the DM's table settings.
- **Extend, don't duplicate.** Hits already float numbers on the 3D map (`lib/iso-battle`
  `scene.attackFx`), phones already flash and buzz on HP changes (`public/js/play/fx.js`), and rolls
  already pop with a natural 20 burst (`public/rollpop.js`, `public/dice3d.js`). New effects plug into
  these.
- **Placeholder art and sound first**, all marked PLACEHOLDER, swapped for real assets later.
- **Haptics are best effort.** `navigator.vibrate` works on Android Chrome but not on iPhone Safari, so
  every haptic cue also has a sound and a visual.

## Possible features

### 1. Body-part health

Every creature has health per body part (head, torso, arms, legs, or a creature's own list such as
wings or tail). The parts add up to its total health, so the existing HP number, pips and bars keep
working.

Open choices:
- Do parts matter to the rules (a broken arm drops a weapon, broken legs halve speed), or is it a
  picture of where the damage landed?
- Who picks the part hit: the player's gesture, a roll, or the DM?
- Players too, or creatures only?
- Body-part sets per creature kind, edited in the Creature Designer (backlog PR W).
- Does the TV show part damage, or only the DM (enemy HP is pips on the TV today)?

### 2. Enemy silhouettes and strike gestures

On a player's turn the phone shows the target's silhouette. To strike, the player swipes or holds on it.
Each weapon kind has its own gesture and its own haptic pattern:

| Weapon kind | Gesture | Feel (placeholder) |
| --- | --- | --- |
| Blades (sword, axe) | Swipe across the silhouette | One long buzz along the swipe |
| Bows, crossbows | Press and hold to draw, release to loose | Rising ticks while drawing, a snap on release |
| Fists, unarmed, claws | Swipe through a chain of nodes (combo) | A short tap per node |
| Blunt (club, hammer) | Hold, then flick down | A heavy thud |
| Thrown (dagger, javelin) | See throwables below | |

Open choices:
- Weapon kind comes from the item or attack (an editable tag), not from a class.
- Silhouette art: a generated outline from the creature's sprite or portrait, or uploaded per creature.
- Where the gesture lands could pick the body part (feature 1).
- Timeouts: how long a player has before it falls back to a plain roll.

### 3. Cosmetic or rules (TBA)

Mike has not decided whether gestures affect the roll. Three ways it could work:

- **A. Cosmetic.** The dice decide everything; the gesture is only the trigger and the feel.
- **B. The gesture is the roll.** The swipe or press throws the dice. Then a short pause, and a white
  slash or stab effect plays the outcome: a clean hit, or a slash that glances off for a miss (a bad
  roll).
- **C. Skill bonus.** A good gesture adds a small, DM-set bonus (for example +1). Risky for fairness at
  a friends table and harder for accessibility.

Suggested start: B with the roll unchanged, so the gesture is the moment of rolling and stays fair.

### 4. Spellcasting styles

Each caster picks a casting style when they make their character (fits the card questions in backlog
PR Y). Possible styles:

- **Rhythm.** Press buttons in sequence as they scroll in, like a dance game.
- **Song.** Sing moving tones into the phone (for example D, then C, then F); the phone listens for the
  pitch with the microphone.
- **Alchemy (wizards).** Pull ingredients out of the bag and drag them into a mixing vessel on the
  phone, in the right order.
- More later: drawn runes, a gesture shape, a held focus.

Open choices:
- Does a good performance change the effect (feature 3 again) or only the feel?
- Song needs the microphone, which needs HTTPS on phones (the tool already has a TLS option,
  `src/tls.js`) and permission. A quiet table, or a fallback to humming or buttons.
- Spell length or level could set the length of the sequence.

### 5. Casting together

Spellcasters who cast together get a multiplier to the effect, and each uses their combat turn.

Open choices:
- How it is timed: casters hold their turn and release together, or the first caster opens a window
  the others join before the next turn.
- What the multiplier touches (damage, area, duration) and its size; an editable house rule.
- On the TV: the casters' accent colours braid into one effect.

### 6. Items by drag

Items are used by dragging them, not by a menu tap.

- **Throwables.** Tap the item, drag back (a slingshot pull), then swipe toward the enemy. The farther
  the enemy on the battle map, the longer the pull back has to be.
- **Potions.** Drag the bottle up slowly while the character drinks it. Drinking too fast could spill
  (open choice: cosmetic, or lose some of the effect).

Open choice: does the throw's aim matter, or does it only need to be long enough?

### 7. Putting armour on and taking it off

Donning and doffing armour happens on the phone: press the buckles to undo them and slide pieces off
the body (and the reverse to put them on). Immersion only.

Open choices:
- Out of combat only, or also mid-fight with the time cost the rules give.
- Needs a body view of the character (the layered sprites could show armour layers).

### 8. Impact cues on every screen

The look side that the gestures play into, and the natural first build:

- **Hit, crit, miss, heal, down cues.** Floating numbers anchored to the target (party card, foe card,
  flat map token), a bigger burst and a short screen shake on a crit, a grey "Miss" puff, a green rise
  for healing, a "Down" stamp with a dark pulse.
- **Turn-change cue.** A sweep in the combatant's accent colour (players use their colour, creatures
  their accent), and a "Your turn" swoosh with a buzz on that player's phone.
- **Phones see their own moments**: you hit, you missed, you were hit, your turn.
- **How**: the server sends one small cue per event (`hit`, `crit`, `miss`, `heal`, `down`, `turn`)
  from `src/game.js` (`attack`, `applyDamage`, `stepTurn`); one shared client file plays it on the TV,
  the DM page and phones. The 3D map keeps its own floating numbers; the cue adds the screen-level
  effect.

Open choice: show damage numbers for creatures on the TV (the dealt amount is already in the public log,
the remaining HP is not).

## Suggested order

1. Impact cues on every screen (feature 8) behind the Combat effects setting.
2. Strike gestures on silhouettes with option B (the gesture is the roll), with a button fallback.
3. Items by drag (throwables and potions).
4. Spellcasting styles, rhythm first (no microphone), then alchemy, then song.
5. Casting together.
6. Body-part health, once Mike decides whether parts matter to the rules.
7. Armour on and off.

## Questions for Mike

- Gestures: cosmetic (A), the roll itself (B) or a small bonus (C)?
- Body parts: rules or picture? Players too?
- Casting together: how is it timed, and what does the multiplier touch?
- Damage numbers for creatures on the TV: show or hide?
