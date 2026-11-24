# Duplication report

Written by `npm run dupes` (`tools/dupes.js`); do not edit by hand. It lists code that looks copied, as a
to-do list for small merges. A match is a suggestion: two functions can look alike and still need to stay apart.

- Near-duplicate functions: **8** pairs (at least 40 tokens, 70% alike)
- Repeated CSS rules: **32** groups (at least 3 declarations, all the same)
- Repeated `@keyframes`: **7** groups

## Functions

| Alike | First | Second | Merge into |
| --- | --- | --- | --- |
| 100% | `public/dungeon.js:10` `levels` | `src/dungeon.js:54` `levels` | keep both (one runs on the server, one in the browser) |
| 100% | `public/dungeon.js:13` `depth` | `src/dungeon.js:57` `depth` | keep both (one runs on the server, one in the browser) |
| 100% | `public/js/dm/designer.js:132` `msg` | `public/js/dm/keywords.js:165` `say` | a shared module in `public/js/` |
| 96% | `public/dungeon.js:197` `tvGate` | `public/town.js:132` `tvGate` | a shared script in `public/` |
| 81% | `public/worldmap.js:36` `route` | `src/worldmap.js:150` `route` | keep both (one runs on the server, one in the browser) |
| 74% | `public/js/dm/town.js:191` `move` | `public/js/dm/worldmap.js:310` `move` | a shared module in `public/js/` |
| 74% | `public/worldmap.js:10` `posAt` | `src/worldmap.js:90` `posAt` | keep both (one runs on the server, one in the browser) |
| 70% | `public/atmo.js:43` `upload` | `public/soundboard.js:28` `upload` | a shared script in `public/` |

## CSS rules

| Declarations | Where | Merge into |
| --- | --- | --- |
| 4 | `public/chronicle.css:47` `.pill small`<br>`public/chronicle.css:87` `.hbar small` | one rule with every selector |
| 3 | `public/chronicle.css:61` `.fe .nat`<br>`public/style.css:598` `.vote-tv em` | one rule with every selector |
| 3 | `public/chronicle.css:74` `.hero`<br>`public/style.css:400` `.profile`<br>`public/style.css:419` `.char-dlg form`<br>`public/theme.css:569` `.convo-live`<br>`public/town.css:56` `.tnp` | one rule with every selector |
| 3 | `public/chronicle.css:77` `.hero-art .av-hero img, .hero-art .av-hero video`<br>`public/combatfx.css:86` `.cfx-actor-pic img`<br>`public/designer.css:51` `.cd-art img`<br>`public/items.css:36` `.it-art img`<br>`public/lobby.css:10` `.lb-card img` | one rule with every selector |
| 3 | `public/chronicle.css:79` `.hero-head`<br>`public/style.css:495` `.slot-row` | one rule with every selector |
| 3 | `public/chronicle.css:84` `.hero-bars`<br>`public/designer.css:52` `.cd-names`<br>`public/style.css:402` `.prof-photo`<br>`public/style.css:408` `.chars`<br>`public/style.css:1159` `.lore-list` | one rule with every selector |
| 3 | `public/chronicle.css:136` `body.dm.chron.tools-dragging`<br>`public/chronicle.css:150` `body.dm.chron.hero-dragging` | one rule with every selector |
| 4 | `public/chronicle.css:137` `body.dm.chron.tools-dragging .dm-right`<br>`public/chronicle.css:151` `body.dm.chron.hero-dragging .dm-hero` | one rule with every selector |
| 3 | `public/chronicle.css:164` `.hero-pick`<br>`public/designer.css:4` `.cd-recent`<br>`public/style.css:366` `.camp-feats, .camp-ideas`<br>`public/style.css:466` `.settings-dlg .seg`<br>`public/style.css:485` `.chips`<br>`public/style.css:1307` `.strike-chips`<br>`public/worldmap.css:21` `.wm-votes` | one rule with every selector |
| 3 | `public/chronicle.css:207` `.chron .me-tools`<br>`public/storygraph.css:33` `.sg-links-list li`<br>`public/theme.css:444` `.iso-cov label`<br>`public/theme.css:656` `.gem-row`<br>`public/worldmap.css:62` `.wm-roadlist .item` | one rule with every selector |
| 3 | `public/designer.css:19` `.cd-side h3`<br>`public/style.css:420` `.char-dlg h3` | one rule with every selector |
| 3 | `public/designer.css:64` `.cd-rows`<br>`public/items.css:71` `.id-props`<br>`public/style.css:252` `.list`<br>`public/style.css:298` `.tracks` | one rule with every selector |
| 3 | `public/designer.css:67` `.cd-row`<br>`public/style.css:590` `.clock-row` | one rule with every selector |
| 4 | `public/dungeon.css:120` `.dg-gate-art img`<br>`public/story.css:16` `.sb-bd img, .sb-bd video`<br>`public/theme.css:596` `.convo-npc .convo-face img` | one rule with every selector |
| 3 | `public/style.css:37` `.bd, .fx`<br>`public/town.css:83` `.tn-path` | one rule with every selector |
| 3 | `public/style.css:61` `.bd-lib`<br>`public/style.css:241` `.modes`<br>`public/style.css:282` `.grid3`<br>`public/style.css:488` `.ab-grid`<br>`public/style.css:1038` `.shop-pgrid` | one rule with every selector |
| 3 | `public/style.css:68` `.fx-btns`<br>`public/style.css:249` `.emotions` | one rule with every selector |
| 4 | `public/style.css:216` `.dm-bar`<br>`public/theme.css:570` `.convo-bar` | one rule with every selector |
| 3 | `public/style.css:271` `.phone .classes`<br>`public/style.css:281` `.grid2`<br>`public/style.css:345` `.roster`<br>`public/style.css:369` `.camp-gain` | one rule with every selector |
| 4 | `public/style.css:300` `.track span`<br>`public/style.css:304` `.sb-layer span` | one rule with every selector |
| 4 | `public/style.css:367` `.camp-ideas .chip`<br>`public/style.css:1308` `.strike-chips .chip` | one rule with every selector |
| 3 | `public/style.css:588` `.dm-conds`<br>`public/style.css:737` `.tab-group` | one rule with every selector |
| 3 | `public/style.css:601` `.card.vote .list`<br>`public/style.css:966` `.feat-grid` | one rule with every selector |
| 3 | `public/style.css:649` `.hall-cat ol, .shelf`<br>`public/style.css:754` `.rules` | one rule with every selector |
| 4 | `public/style.css:711` `.cast-list`<br>`public/style.css:1220` `.ss-chips` | one rule with every selector |
| 3 | `public/style.css:815` `.wx canvas`<br>`public/theme.css:564` `.convo-npc .convo-face svg` | one rule with every selector |
| 3 | `public/style.css:984` `.inv-gone`<br>`public/style.css:987` `.it-gone` | one rule with every selector |
| 3 | `public/theme.css:117` `.btn.on`<br>`public/theme.css:328` `body.chron .btn.on` | one rule with every selector |
| 3 | `public/theme.css:629` `.convo-pop`<br>`public/theme.css:795` `.hd-pop` | one rule with every selector |
| 5 | `public/theme.css:734` `.dm-bar .undo-bar`<br>`public/theme.css:761` `.dm-bar .keep-bar` | one rule with every selector |
| 5 | `public/theme.css:765` `.iso-tvcam`<br>`public/theme.css:768` `.iso-daylight` | one rule with every selector |
| 3 | `public/town.css:4` `.tn-pic > img`<br>`public/worldmap.css:4` `.wm-pic > img` | one rule with every selector |

## Keyframes

| Where | Merge into |
| --- | --- |
| `public/combatfx.css:73` `cfx-fade`<br>`public/dungeon.css:135` `dg-gate-out`<br>`public/style.css:553` `mood-out`<br>`public/style.css:1133` `fadeout` | `cfx-fade` |
| `public/combatfx.css:74` `cfx-fadeout`<br>`public/style.css:724` `condflash` | `cfx-fadeout` |
| `public/designer.css:15` `cd-fade`<br>`public/dungeon.css:134` `dg-gate-in`<br>`public/style.css:40` `fadein`<br>`public/style.css:552` `mood-in`<br>`public/style.css:1192` `page-in`<br>`public/style.css:1334` `lobby-fade`<br>`public/town.css:88` `tn-step-in`<br>`public/worldmap.css:75` `wm-fade` | `cd-fade` |
| `public/designer.css:70` `cd-row-in`<br>`public/dungeon.css:188` `dgw-in` | `cd-row-in` |
| `public/style.css:145` `pulse`<br>`public/tableplay.css:5` `kb-wait` | `pulse` |
| `public/style.css:877` `ic-in`<br>`public/style.css:1076` `end-fade`<br>`public/style.css:1105` `ppFade`<br>`public/theme.css:543` `fade-in` | `ic-in` |
| `public/style.css:1174` `lore-open`<br>`public/theme.css:542` `fold-open` | `lore-open` |
