# Combat aesthetic

Design notes for how fights look and feel on the TV, the DM laptop and the phones (Mike, Nov 16).
**Docs only. Nothing here is built yet.** Every item is a possible feature with its open choices.

## Mike's decisions (Nov 17)

1. **Gestures are for show for now.** The dice decide every outcome. All gesture and effect code must
   be built so it can be switched on or off (option A below).
2. **Body parts change the rules, and players have them too** (feature 1).
3. **Team casting**: when two player spellcasters are near each other, one can send the other a team
   move request; a combined spell uses both their turns (feature 5).
4. **No one but the DM sees damage numbers.** Players and the TV see health states (Healthy, Injured
   and so on), never numbers (see "Health states, not numbers" below).

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

**Decided (Mike, Nov 17): parts change the rules, and players have them too.**

How it could work (a sketch, all numbers editable house rules, not 5e):
- Each part has its own health and a **broken** effect when it reaches 0, for example: arm, drops what
  it holds and cannot use two-handed weapons; leg, half speed; head, a save or be stunned; torso at 0
  means the creature is down. Effects are editable per part set.
- Healing goes to the most hurt part first unless the healer picks one.
- Players and the TV see each part as a health state (Healthy, Bruised, Wounded, Broken), never a
  number. The DM sees the numbers.
- Body-part sets per creature kind (a wolf has no arms; a dragon has wings and a tail), edited in the
  Creature Designer (backlog PR W). Characters get a humanoid set by default.

Open choices:
- Who picks the part hit: a roll (a hit location die), the attacker's called shot, or the DM? Since
  gestures are for show, the gesture does not pick it.
- How a part's health is set: a share of the total (head 15%, torso 40%, each arm and leg 11%) or
  fixed numbers.
- Which broken effects ship as defaults, and whether a broken part needs a rest or magic to mend.

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
- Timeouts: how long a player has before it falls back to a plain roll.

### 3. Cosmetic or rules (TBA)

**Decided (Mike, Nov 17): A, for show.** The other two stay here for later.

- **A. Cosmetic.** The dice decide everything; the gesture is only the trigger and the feel.
- **B. The gesture is the roll.** The swipe or press throws the dice. Then a short pause, and a white
  slash or stab effect plays the outcome: a clean hit, or a slash that glances off for a miss (a bad
  roll).
- **C. Skill bonus.** A good gesture adds a small, DM-set bonus (for example +1). Risky for fairness at
  a friends table and harder for accessibility.

**Switching it on and off.** One table setting, **Combat gestures** (On / Off), set by the DM, and a
per-phone override so a player can always use plain buttons. With it off, phones show today's buttons.
The effects layer (feature 8) has its own **Combat effects** setting. Both follow Reduce motion. Each
gesture is a small module behind one switch, so a single gesture (for example song casting) can be
turned off without the others.

### 4. Spellcasting styles

Each caster picks a casting style when they make their character (fits the card questions in backlog
PR Y). Possible styles:

- **Rhythm.** Press buttons in sequence as they scroll in, like a dance game.
- **Song.** Sing moving tones into the phone (for example D, then C, then F); the phone listens for the
  pitch with the microphone.
- **Alchemy (wizards).** Pull ingredients out of the bag and drag them into a mixing vessel on the
  phone, in the right order.
- **Runes.** Draw a rune shape on the phone (like a brush stroke spell).
- **Channel.** Hold a finger on a focus while it charges; letting go early ends the spell.

Open choices:
- A good performance changes only the feel (for show, Mike's decision 1).
- Song needs the microphone, which needs HTTPS on phones (the tool already has a TLS option,
  `src/tls.js`) and permission. A quiet table, or a fallback to humming or buttons.
- Spell length or level could set the length of the sequence.

### 5. Team casting

**Decided (Mike, Nov 17): a team move between two player spellcasters who are near each other.**

How it could work:
- On a caster's turn, if another player spellcaster is within range on the battle map (an editable
  distance, for example 10 ft), the phone offers **Team move** with that player.
- The second player gets a request on their phone (like the existing join and roll call pop-ups) and
  accepts or declines. Both cast, using both their turns; the second player's next turn is spent.
- The combined spell gets a multiplier to its effect. The DM confirms or changes it with one tap.
- On the TV: a full-screen team move cut-in, styled like the Persona 3 team attacks (both characters'
  portraits slash across the screen in their accent colours, then the effect). Placeholder art first.

Open choices:
- **Naming (Mike, Nov 17):** the players name their team move themselves, out loud. No code for
  naming or remembering moves.
- What the multiplier touches (damage, area, duration, or the DM picks) and its size; an editable house
  rule.
- Whether both must cast the same spell, or any two spells combine.
- Whether more than two can join, and whether creatures can team cast.

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

- **Hit, crit, miss, heal, down cues.** A slash or stab mark on the target (party card, foe card, flat
  map token, 3D token), a bigger burst and a short screen shake on a crit, a grey "Miss" puff, a green
  glow for healing, a "Down" stamp with a dark pulse. **No numbers** on the TV or phones; the DM page
  may show them. A health state word (for example "Injured") can float instead when the state changes.
- **Turn-change cue.** A sweep in the combatant's accent colour (players use their colour, creatures
  their accent), and a "Your turn" swoosh with a buzz on that player's phone.
- **Phones see their own moments**: you hit, you missed, you were hit, your turn.
- **How**: the server sends one small cue per event (`hit`, `crit`, `miss`, `heal`, `down`, `turn`)
  from `src/game.js` (`attack`, `applyDamage`, `stepTurn`); one shared client file plays it on the TV,
  the DM page and phones. The 3D map keeps its own floating numbers; the cue adds the screen-level
  effect.

### Health states, not numbers

**Decided (Mike, Nov 17): only the DM sees damage and health numbers.** Players and the TV see health
states such as Healthy, Injured, Badly hurt and Down.

Today's tool still shows numbers in a few places. Changing them is part of building this, and each is
listed so nothing is removed by surprise:
- the TV party cards show `hp/maxHp` (`public/stage.js`);
- the phone hero card shows a number unless the phone picks **HP display: Description**
  (`public/settings.js`), so Description would become the only choice for players;
- the 3D map floats `-N` over a hit token on every screen (`lib/iso-battle` `scene.attackFx`);
- the public combat log says "HIT for N" and the player attack text includes damage (`src/game.js`).
  These lines would keep the number for the DM only (the log already supports `vis: 'dm'`).

Open choice: the state names and where the lines fall (for example Healthy above 75%, Injured, Badly
hurt below 25%, Down at 0), as an editable list.

### 9. More ideas (Mike, Nov 17)

Agreed on Nov 17. **Every one is a toggle**, off by default until it has been tried at the table.

- **Echo the gesture on the TV** (toggle). The player's swipe trail, bow draw or rune draws over the
  target on the big screen, so a phone moment becomes a table moment.
- **Defence gestures** (toggle). When a creature attacks a player, that phone gets a short brace or
  parry gesture. For show, like the strikes.
- **Called shots** (toggle). Tap a body part on the silhouette to aim at it (like Fallout's VATS).
  Broken parts show cracks on the silhouette. Ties into body-part rules (feature 1); whether aiming
  costs anything is a rules choice for later.
- **Signature moves: no code.** Players describe their own moves and name them; the tool does not
  track them (Mike).
- **Weapon feel as data.** Each weapon kind is an editable profile: gesture, haptic pattern, sound,
  TV trail and **speed**. The pressable node moves at the weapon's speed, so a dagger's node is quick
  and darts about while a mace's node is slow and heavy, and the player feels the difference in the
  movement. Homebrew weapons pick a profile or get their own.
- **Keep turns fast.** A gesture window of about 5 seconds with a soft countdown; when it runs out the
  attack rolls as normal. The phone plays the gesture locally and sends only "done" to the server, so
  network lag never shows.
- **Watching phones** (toggle). Other phones show a small line such as "Kara is drawing her bow" with a
  live meter while it happens.
- **One-tap option.** Every gesture has a one-tap version (accessibility, or a player who just wants
  to roll). A per-phone setting can make one tap the default.

## Suggested order

1. Health states instead of numbers on the TV and phones, and impact cues on every screen (feature 8)
   behind the Combat effects setting.
2. Strike gestures on silhouettes, for show, behind the Combat gestures setting, with weapon feel
   profiles (speed), the 5 second window and the one-tap option from the start.
3. TV echo, watching phones and defence gestures (each a toggle).
4. Items by drag (throwables and potions).
5. Spellcasting styles, rhythm first (no microphone), then alchemy, runes, channel, then song.
6. Team casting with the cut-in.
7. Body-part health with rules, for creatures and players, then called shots.
8. Armour on and off.

## Still open

- Body parts: who picks the part hit, how part health is set, and the default broken effects.
- Team casting: what the multiplier touches and its size, and whether any two spells combine.
- Health state names and thresholds.
- Weapon speed values per weapon kind (how fast a dagger's node moves compared with a mace's).
