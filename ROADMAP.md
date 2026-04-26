# ArrowFall — Roadmap

> Plan d'implémentation par phases. Chaque phase = un prompt Claude Code dédié, livré incrémentalement, testable de bout en bout.

## Phases

| Phase | Objectif | Livrable testable | Statut |
|---|---|---|---|
| **0** | Setup (ce prompt #1) | hello world déployé front + back | ✅ |
| **1** | Bootstrap engine — tilemap loader, types partagés, math 2D | tests Vitest verts sur `engine` | ✅ |
| **2** | Mouvement archer — gravité, marche, saut, dodge, wall-jump, wrap | suite de tests deterministes du `engine` | ✅ |
| **3** | Combat — flèches normales, tir, ramassage, stomp, catch, mort | tests + démo headless | ✅ |
| **4** | Rendu client local — PixiJS sprite, contrôle clavier, 1 archer | démo locale jouable solo | ✅ |
| **5** | Hot-seat 2-4 archers même clavier | démo locale 2-4 joueurs | ✅ |
| **6** | Colyseus state schema + sync naïve | 2 onglets, état partagé | ✅ |
| **7** | Client prediction + reconciliation + interpolation | latence ressentie < 100 ms | ✅ |
| **8** | Lobby, code de room 4 lettres, écran fin de round/match | match complet 2 joueurs distants | ✅ |
| **9a** | Coffres + flèche Bomb (loot + explosion) | match avec coffres et explosions | ✅ |
| **9b** | Flèches Drill + Laser + Shield (mécaniques restantes) | mécaniques complètes | ✅ |
| **10** | 3 maps designées + intégration assets pixel art CC0 | jeu visuel complet | ✅ |
| **11** | SFX + musique CC0 + polish + gamepad + fullscreen | MVP livré | ⏳ |

## Phase 10 — 3 maps designées + assets pixel art CC0 (terminé)

✅ Livrée dans la PR `feat/visual-assets` : *(URL backfill après merge)*

> Direction artistique alignée avec le mood board envoyé par Saad (TowerFall Sacred Forest / Twilight Spire / Cataclysm). Stratégie d'asset retenue : **100% procédural CC0** généré côté client au boot — aucun fichier PNG versionné, tout en TypeScript via HTML5 Canvas → `PIXI.Texture`. Bundle léger, CC0 par construction, tunable par variable. Voir `docs/visual-style.md` pour le contrat artistique complet.

- **Mood board contractuel** — `docs/moodboard/README.md` liste les niveaux TowerFall référencés (Sacred Forest, Twilight Spire, Cataclysm + Tower Forge, Celeste, Hyper Light Drifter, Dead Cells) **sans redistribuer** les screenshots copyright. Le dossier `inspirations/` local est gitignoré.
- **`docs/visual-style.md`** — contrat artistique : 3 palettes 32 couleurs (8 familles × 4 ramps shadow/mid/light/spec), 6 silhouettes archers signatures, timings d'animation, règles tile-painter (couches mid → bord organique → ombrage → détail variant → spec).
- **`@arrowfall/shared/tilemap`** — `ThemeId = "sacred-grove" | "twin-spires" | "old-temple"`, `ALL_THEMES`, `DEFAULT_THEME`. `MapData.theme` (required) et `MapJson.theme?` (optional, défaut `sacred-grove` pour back-compat des fixtures Phase 5 `arena-01.json`/`arena-02.json`). `parseMap` valide le theme contre `ALL_THEMES`. `serializeMap` n'émet `theme` que s'il diffère du défaut → arena-01/02 round-trip identique.
- **`packages/client/src/assets/`** — module générateur procédural (8 fichiers, ~1500 lignes) :
  - `palettes.ts` — `PALETTES` indexé par `ThemeId` (3 thèmes × 8 familles × 4 hex), `ARCHER_SKINS` (6 skins × 9 fields).
  - `canvas.ts` — utilitaires (`newCanvas`, `px`, `rect`, `outline`, `vGradient`, `mulberry32` PRNG, `tileSeed` FNV-1a hashing pour variantes déterministes).
  - `tile-painter.ts` — `buildTileSprites(theme)` génère 4 variantes SOLID (plain / fissure / rune / bevel) + JUMPTHRU + SPIKE. Pipeline 5 couches : mid fill → bord organique themed (mousse / neige / runes) → ombrage directionnel → détail variant → spec highlight. `variantKeyFor(theme, kind, tx, ty)` choisit la variante via `tileSeed` → variantes figées entre rebuilds.
  - `archer-painter.ts` — `buildArcherSprites(skin)` génère ~32 frames (idle 4 / walk 6 / jump / fall / dodge 4 / aim ×8 / shoot 3 / death 4). Silhouette commune body 6×5 + head 4×3, dressing par skin (capuche feuille / plumet / hood pointu / chapeau plat / masque / diadème). Helper `aimDirOf(ax, ay, facing)` → `AimDir` 8-way.
  - `arrow-painter.ts` — sprites flèches 12×4 px (déborde 2 px le collider 8×2 pour fletching/tip). Bombs 4 frames mèche, drills 4 frames helix, lasers 2 frames pulse + halo cyan. `flyingFrameFor(type, age)` route selon `arrow.age`.
  - `chest-painter.ts` — 6 frames (closed → opening lift × 4 → halo + sparkle). `chestFrameFor(status, openTimer, duration)` mappe le timer engine vers la frame.
  - `shield-painter.ts` — 4 frames overlay 24×24, ring blanc + 4 sigils cyan orbitaux qui tournent.
  - `background-painter.ts` — 2 layers parallax 480×270 par thème : back (ciel/voûte sombre + clouds/stars/sigils) + mid (arbres / montagnes neigeuses / colonnes + idole). Génération via `vGradient` + helpers de silhouette (`paintTriangle`, `paintTree`).
  - `index.ts` — `buildAllAssets()` agrège tout en `AssetRegistry` (Map de `Texture` indexées). Mesuré ~150 ms cold sur laptop mid-range.
- **3 maps thématiques** (`packages/client/src/maps/`) :
  - `sacred-grove.json` — symétrique, plateformes étagées, 4 spawns + 2 chests, ambiance forêt.
  - `twin-spires.json` — verticale, 2 tours latérales SOLID + balcons JUMPTHRU à 3 niveaux, 4 spawns + 3 chests.
  - `old-temple.json` — labyrinthique, beaucoup de petites JUMPTHRU en chicane, 4 spawns + 2 chests, spikes punitifs.
- **Renderers réécrits avec dual-path** — chaque renderer accepte `assets: AssetRegistry | null`. Si non-null → mode sprites Phase 10 (Sprite pool, frame picker, anim cosmétique via `renderFrame` interne au renderer indépendant du tick). Si null → fallback Phase 4/9b (Graphics rect/poly intact). Toggle via env Vite `VITE_NO_SPRITES=1` dans `main.ts`.
  - `TilemapRenderer` — bake une fois au constructor : Sprite par tile non-EMPTY avec variant déterministe.
  - `ArchersRenderer` — pool de Sprites keyé par `archer.id`, frame picker `pickFrame(archer, renderFrame)` (death/dodge/shoot/jump/fall/walk/idle), facing flip via `scale.x = -1`, shield overlay 4-frame spinning sigils, alpha pulse pour iframe.
  - `ArrowsRenderer` — Sprite pool indexé, anchor centre + rotation = `atan2(vy, vx)`, frame cyclée selon `arrow.age`.
  - `ChestsRenderer` — Sprite pool keyé par `chest.id`, frame indexée via `chestFrameFor`.
  - `BackgroundRenderer` (nouveau) — 2 `TilingSprite` pour back/mid layers, `tilePosition.x = -tick × 0.4 / 0.7` (drift cosmétique automatique).
- **Map cycler local** — touche **`M`** dans le mode hot-seat cycle entre les 3 maps thématiques (rebuild tilemap + background theme + reset round). Le cycler skip en mode 4P (reste sur arena-02) et n'affecte pas le mode networked (le serveur dicte la map).
- **`Game` + `main.ts`** — `Game` accepte un 4e param `assets: AssetRegistry | null` (passé aux 5 renderers). `main.ts` appelle `buildAllAssets()` sauf si `import.meta.env.VITE_NO_SPRITES === "1"`. Background `setTheme(map.theme)` + `update(world.tick)` à chaque render frame.
- **`assets/CREDITS.md`** — documente la stratégie procédurale CC0 et liste tous les assets générés (tilesheets 3 thèmes, 6 spritesheets archers, sprites flèches + coffres + shield, backgrounds 2 layers × 3 thèmes). Aucun asset tiers.
- **Tradeoffs** :
  - Networked mode utilise toujours `arena-01`/`arena-02` (pas de `MatchState.theme` côté server). Phase 11 wirera la sélection de map depuis le lobby.
  - Aim 8-direction sprite (`aim_${dir}`) généré mais pas branché sur l'animation runtime — l'engine `Archer` ne stocke pas la dernière direction de visée. Les renderers utilisent les frames idle/walk/jump/fall/shoot/dodge/death qui couvrent 95% du temps écran. Branchement aim live = Phase 11 si nécessaire.
  - Anim cycler basé sur `renderFrame` interne (cosmétique) → désynchronisé entre 2 onglets. Sans incidence (purement visuel, pas d'effet gameplay).
- **Tests** : engine 163 (inchangé), server 75 (inchangé), client 30 → **94** (+64 :
  - `palettes.test.ts` 33 cas (3 thèmes × 7 familles × 4 hex + 6 archers × 9 fields + diversité).
  - `painter-helpers.test.ts` 23 cas (`mulberry32` déterminisme, `tileSeed` stabilité, `variantKeyFor` ranges, `aimDirOf` 8 dirs, `flyingFrameFor` cycles, `chestFrameFor` clamping).
  - `themed-maps.test.ts` 8 cas (3 maps × {theme correct, ≥ 4 spawns, ≥ 2-3 chests, dimensions 30×17, id} + back-compat arena-01).
- **Build Vite** : 247 KB minifié, 78 KB gzippé pour le code app — sous le budget 2 MB de la spec. La génération procédurale ajoute ~50 KB de code mais 0 KB d'assets binaires.
- **Validation manuelle** (à exécuter au merge) :
  1. `pnpm --filter @arrowfall/client dev` → `http://localhost:5173`
  2. Mode local → on atterrit sur Sacred Grove (forêt verte ensoleillée, cube doré chest, archer p1 vert avec capuche feuille).
  3. Toucher `M` → bascule sur Twin Spires (crépuscule hivernal violet, neige drifting, 2 tours stones bleu).
  4. Toucher `M` → bascule sur Old Temple (ténèbres + colonnes + idole + or rune + torches orange).
  5. Spawner 2-4 archers via `PLAYER_COUNT` → vérifier silhouettes distinctes (verdant/crimson/azure/saffron).
  6. Animations : marcher (cycle jambes), sauter (knees up), tomber (legs apart), tirer (recoil 3 frames), dodge (motion streaks), prendre coup (death scatter 4 frames).
  7. Variante visuelle : `VITE_NO_SPRITES=1 pnpm --filter @arrowfall/client dev` → fallback rectangles Phase 4/9b (régression check zéro).

## Phase 9b — Flèches Drill + Laser + Shield (terminé)

✅ Livrée dans la PR `feat/arrows-shield-9b` : *(URL backfill après merge)*

- **`@arrowfall/shared/constants/arrows`** — nouveau module : `ArrowType` (canonical home, re-exporté par engine pour back-compat), `ArrowProfile` (`speed`, `gravity`, `impact`), table `ARROW_PROFILES` keyée par type. Centralise les vitesses/gravités spec §4.2 dans une seule source de vérité — `stepArrow`, `applyShoot` et `dropArrowsOnDeath` lisent désormais via `arrowProfile(type).speed` au lieu de switcher.
- **Drill arrow** (`ARROW_PROFILES.drill = { speed: 5, gravity: true, impact: "pierce" }`) — `Arrow.piercesUsed: number` (0 au spawn). `stepArrow` au premier hit SOLID : `piercesUsed=1`, position avancée par le delta complet (pas de re-sweep dans le même frame), continue à voler. Au 2e hit : impact "embed" (downgrade implicite quand `piercesUsed >= DRILL_MAX_PIERCES=1`). Test de référence : un mur isolé col 10 + un mur vertical col 14 → drill traverse le 1er, embed dans le 2e.
- **Laser arrow** (`speed: 7`, `gravity: false`, `impact: "bounce"`) — `Arrow.bouncesUsed: number`. `stepArrow` au hit SOLID : reflète la composante perpendiculaire (`vx → -vx` si `xResult.hit`, idem Y), `bouncesUsed++`. Coin (xy hit simultané) → flip les deux. Despawn (status="exploding" silent — pas d'event) après `LASER_MAX_BOUNCES=7` rebonds OU `age >= LASER_LIFETIME_FRAMES=30`. Pas de gravité = trajectoire purement linéaire entre rebonds.
- **`Archer.hasShield: boolean`** + `drillInventory` + `laserInventory` — 3 champs ajoutés au type Archer (compteurs séparés plutôt que `inventory: ArrowType[]` — on est à 4 compteurs + 1 bool, en-dessous du seuil de refactor noté Phase 9a). `applyShoot` priorité **laser > drill > bomb > normal** (les spéciaux se consomment en premier — UX "loot impactful"). `dropArrowsOnDeath` éjecte normals → bombs → drills → lasers dans le même fan déterministe avec speed propre via `ARROW_PROFILES`.
- **Shield consume hit dans `stepWorld`** — branchement dans les 3 sources de mort (étape 5 bomb explosion, étape 6 arrow direct, étape 7 stomp) : si la victime a `hasShield=true`, on flippe à `false` et on émet `WorldEvent.shield-broken { victimId, cause: "arrow"|"bomb"|"stomp", tick }` au lieu de `archer-killed`. Stomp : le stompeur rebondit même si la cible était shielded (l'impact mécanique reste). Friendly fire respecté (sa propre bomb consomme son shield).
- **`ChestContents` discriminated union** — `{ kind: "arrows", type: ArrowType, count } | { kind: "shield" }`. Wire flatten : `lootKind` ("arrows" | "shield"), `lootType` (ignoré si shield), `lootCount` (idem). `applyChestLootToInventory` : `kind="shield"` → `archer.hasShield=true` (no-op si déjà true), `kind="arrows"` → bump compteur typé.
- **`ChestSpawner` loot table 9b** (spec §6.2 complète) — bandes cumulatives sur `[0,1)` :
  - 50% : 2 normal arrows
  - 20% : 2 bomb arrows
  - 15% : 2 drill arrows
  - 10% : 2 laser arrows
  - 5% : 1 shield
  Exposée comme `CHEST_LOOT_BANDS` (testable via `Math.random` monkey-patché).
- **Wire schema** : `ArcherState` gagne `drillInventory`, `laserInventory` (uint8), `hasShield` (boolean). `ChestState` gagne `lootKind` (string). `worldToMatchState` mirror les nouveaux champs ; chests `kind="shield"` mettent `lootType="normal"` / `lootCount=0` (sentinelles, ignorés client-side).
- **Client** :
  - Schema mirror lockstep + `match-mirror.chestFromState` parse `lootKind` pour reconstruire la `ChestContents` discriminée.
  - `ArrowsRenderer` : palettes par type via lookup `FLYING_COLOR_BY_TYPE` (drill `0xff8c1a` orange, laser `0xfafff5` blanc) ; les lasers ont un halo low-alpha sous le poly principal pour l'effet "rayon".
  - `ArchersRenderer` : cercle blanc pulsé (`SHIELD_COLOR=0xc8f0ff`) sous le corps quand `hasShield=true` (alpha 0.4..0.85 sur 30 frames, indépendant de l'engine state).
  - `HudRenderer` : ligne d'inventaire typée — `N3/5 B2 D1 L0 [+] alive`. Slots vides silencieux ; `[+]` indique le shield.
- **Tradeoffs** :
  - Pas de FX d'explosion bomb (toujours déféré à Phase 11) ni de particules drill/laser sur impact.
  - Le PRNG ChestSpawner reste `Math.random` non-seedé (la cohérence cross-client est garantie par le broadcast serveur, pas par un seed partagé — c'est l'architecture autoritaire spec §8.1).
  - Inventaires drill/laser/shield des archers REMOTES non-interpolés (`archerFromSnapshot` met 0/false) — visible uniquement via la mirror state directement, comme `bombInventory` Phase 9a.
- **Tests** : engine 147 → **163** (+16 : `arrow/drill.test.ts` 4 cas, `arrow/laser.test.ts` 5 cas, `world/shield.test.ts` 7 cas). Server 72 → **75** (+3 net : retiré 2 tests 60/40 obsolètes, ajouté 5 nouveaux pour les 5 bandes du loot table 9b). Client 30 inchangé.
- **Validation manuelle** (à exécuter au merge) :
  1. Two tabs sur `http://localhost:5173/`, host + join + ready up.
  2. Attendre 4-8 s : un coffre apparaît. Avec 50%/20%/15%/10%/5% on devrait voir des contenus variés sur ~10 ouvertures.
  3. Coffre drill → tirer → flèche orange, traverse un bloc SOLID, embed dans le suivant.
  4. Coffre laser → tirer → flèche blanche avec halo, rebondit sur les murs, disparaît après quelques rebonds ou ~30 frames.
  5. Coffre shield → cercle blanc pulsé apparaît autour de l'archer ; encaisser un coup → cercle disparaît, archer survit.

## Phase 9a — Coffres + flèche Bomb (terminé)

✅ Livrée dans la PR `feat/chests-arrows` : *(URL backfill après merge)*

> Phase 9 a été splittée en deux sous-PRs vu le scope (~3000 lignes total). Phase 9a livre coffres + Bomb (la moitié spectaculaire : loot + explosion). Phase 9b finit avec Drill + Laser + Shield et le loot table complet spec §6.2.

- **`getRoundOutcome` shared via `@arrowfall/engine/round-state`** — déjà extrait Phase 8, inchangé ici.
- **Bomb arrow** (`@arrowfall/engine/arrow`) — `ArrowType` étendu en `"normal" | "bomb"`. Constants : `BOMB_ARROW_SPEED=4.5`, `BOMB_FUSE_FRAMES=60`, `BOMB_RADIUS_PX=24`. `ArrowStatus` gagne `"exploding"` (transient, vit ≤ 1 tick — jamais visible sur le wire). `stepArrow` flippe le status dès qu'`age >= BOMB_FUSE` ou collision wall ; sinon physique normale (semi-implicit Euler + sweep SOLID).
- **`Archer.bombInventory: number`** — compteur séparé du `inventory` (normal arrows). `applyShoot` consomme bomb en priorité (un joueur qui pickup une bomb veut probablement la balancer maintenant). `dropArrowsOnDeath` éjecte normals d'abord puis bombs dans le même fan déterministe à N angles. Refactor en `inventory: ArrowType[]` reporté à Phase 9b si Drill/Laser/Shield poussent à >= 5 fields séparés.
- **Explosion** dans `stepWorld` (étape 5, AVANT arrow↔archer) — pour chaque arrow `status="exploding"`, calcule un AABB carré de demi-côté `BOMB_RADIUS_PX` autour de `arrow.pos` ; tue tous les archers `alive` qui intersectent (modulo `spawnIframeTimer` + `dodgeIframeTimer` — règle iframe identique aux flèches normales) ; émet `bomb-exploded` + `archer-killed cause:"bomb"`. Multi-kills déterministes en ordre alphabétique d'archerId.
- **`@arrowfall/engine/chest`** — nouveau module pur : `Chest` (id, pos, status `"closed"|"opening"|"opened"`, openTimer, openerId, contents `{ type, count }`) + `stepChest` (decrement timer). Le module est pur — la cadence de spawn et le loot sortent du serveur.
- **`stepWorld` chest flow** (étape 9) — closed + alive-archer-overlap → `opening` (openTimer = 30, openerId = matched archer) ; opening + openTimer == 0 → deliver loot to opener inventory + emit `chest-opened` + remove. Si l'opener est mort entre trigger et delivery, le coffre est consommé sans loot (event quand même émis pour le SFX). Délivrance directe à l'inventory (pas d'éjection de flying arrows — plus simple, déterministe ; spec §6.2 l'autorise).
- **`World.chests: ReadonlyArray<Chest>`** — nouveau field. `createWorld` initialise vide ; `world.chests ?? []` dans stepWorld pour rester backward-compat avec les test-stubs Phase 3.
- **`CHEST_SPAWN` tile** (`C` char) — déjà présent dans `@arrowfall/shared` depuis Phase 1, inchangé. `parseMap` extrait déjà `MapData.chestSpawns: Vec2[]`. Maps `arena-01` (2 chest_spawns) et `arena-02` (3 chest_spawns) mises à jour pour l'utiliser.
- **Server `ChestSpawner`** (`packages/server/src/rooms/chest-spawner.ts`) — vit hors de l'engine (cadence + loot non-déterministes par room, `Math.random` direct). Schedule : `randomInterval()` ∈ [240, 480] frames (4-8 s @ 60 Hz) ; max `CHEST_MAX_SIMULTANEOUS = 2` chests simultanés ; ne respawn pas sur un tile occupé. Loot table 9a (simplifiée — 30%/15%/10%/5% drill/laser/shield de spec §6.2 fold dans les deux types disponibles) :
  - 60% : 2 normal arrows
  - 40% : 2 bomb arrows
- **`ArenaRoom` intégration** : `chestSpawner.reset(world.tick)` au start de chaque round (`startMatch` + `startNextRound`) ; `chestSpawner.maybeSpawn` appelé dans `simulate()` uniquement en phase `"playing"` (round-end ne spawn plus, les chests existants restent visibles pendant le freeze).
- **Wire schema** : `ArcherState.bombInventory: uint8`, `ArrowState.arrowType: string`, nouveau `ChestState` (id, pos, status, openTimer, openerId, lootType, lootCount), `MatchState.chests: ArraySchema<ChestState>`. `worldToMatchState` upserts/prunes la chest array. Mirror client en lockstep.
- **Render client** :
  - `ArrowsRenderer` étendu — bombs en rouge vif (`BOMB_FLYING_COLOR=0xff4040`) en vol, gris-rouge au sol. Status "exploding" rendu comme grounded (1 frame max avant que le serveur consomme).
  - `ChestsRenderer` (nouveau) — carré 14×14 doré avec contour foncé + ligne charnière. Lerp couleur closed → bright pendant l'opening (0..30 frames). Inséré entre arrows et archers dans le z-order.
- **Tradeoffs** :
  - Pas de FX d'explosion visuel pour Phase 9a (la bomb arrow disparaît cleanement, les kills s'enregistrent dans la HUD score). Phase 9b ou Phase 11 (polish) ajoutera un cercle expanding 18 frames.
  - `bombInventory` n'est pas interpolé pour les remotes (Phase 7 `archerFromSnapshot` met 0) — c'est un compteur HUD privé visible uniquement par son owner via la mirror state, pas par interpolation.
  - Loot délivré direct à l'inventaire au lieu d'être éjecté en flying arrows : simpler + déterministe + évite une 2e collision pass. Spec §6.2 dit "contenu éjecté" — fonctionnellement équivalent du point de vue gameplay.
- **Tests** : engine 130 → **147** (+17 : `arrow/bomb.test.ts` 4 cas, `chest/chest.test.ts` 8 cas, `world/bomb-explosion.test.ts` 5 cas). Server 64 → **72** (+8 : `chest-spawner.test.ts` — schedule, caps, free-position, loot table). Client 29 → **30** (+1 : `MatchState.chests` defaults).
- **Validation manuelle** (à exécuter au merge) :
  1. Two tabs sur `http://localhost:5173/`, host + join + ready up.
  2. Attendre 4-8 s : un coffre (carré doré) apparaît sur un `C` tile de la map.
  3. Marcher dessus → animation 30 frames → loot délivré (HUD inventory bump).
  4. Si loot = bomb (40% du temps) → tirer → flèche rouge → explose au mur ou après 60 frames → kill l'archer adverse dans le rayon.

## Phase 8 — Lobby + code de room + fin de round/match (terminé)

✅ Livrée dans la PR `feat/lobby-rooms` : *(URL backfill après merge)*

- **Codes de room 4 lettres** (`packages/server/src/rooms/room-codes.ts`) — alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ` (24 lettres, sans `I`/`O` qui se confondent avec `1`/`0` sur une capture mobile). Registry process-locale (`Set<string>`) qui réserve à `onCreate` et libère à `onDispose`. `pickAvailableRoomCode(maxAttempts=10)` choisit un code libre ; `reserveRoomCode(code)` accepte un code fourni par le host (collision = throw clair). 24⁴ = 331 776 combinaisons → collision quasi-impossible aux échelles MVP. Côté client le même contrat est dupliqué (`packages/client/src/net/room-codes.ts`) — pas d'import croisé client↔serveur, juste un wire-contract partagé.
- **Matchmaker** : `gameServer.define("arena", ArenaRoom).filterBy(["code"])`. Le host appelle `client.create("arena", { code })`, les invités `client.join("arena", { code })` — Colyseus route sur les options de création. `setMetadata`/`setPrivate` retirés de `onCreate` car non-initialisés hors du matchmaker (les tests construisent la room via `new ArenaRoom()`).
- **State machine `MatchState`** étendue (`packages/server/src/state/match-state.ts`) : `phase ∈ {"lobby", "playing", "round-end", "match-end"}`, `phaseTimer` (frames), `roomCode`, `roundNumber`, `targetWins` (clamp [1,9], default 3), `wins: MapSchema<uint8>`, `ready: MapSchema<bool>`, `roundWinnerSessionId`, `matchWinnerSessionId`. Le client mirror le schéma en lockstep dans `packages/client/src/net/schema.ts` (sinon corruption silencieuse — voir cause Phase 6 sur `useDefineForClassFields`).
- **Flow `ArenaRoom`** :
  - `lobby` → simulate ne tick pas le world. `onMessage("ready")` toggle `state.ready[sessionId]` ; quand tous prêts ET `archers.size ≥ 2` → `startMatch()` (rebuild world, `phase="playing"`, `roundNumber=1`).
  - `playing` → simulate normal. À chaque tick on évalue `getRoundOutcome(world)` (extrait du client vers `@arrowfall/engine/round-state` pour partage authoritatif) ; sur `win`/`draw` → `endRound()` qui incrémente `wins[winner]` puis `phase="round-end"`, `phaseTimer=180` (3 s).
  - `round-end` → continue à simuler (les frags d'animation de mort jouent sous le texte). Quand `phaseTimer==0` : si max(wins) ≥ targetWins → `endMatch()` (`phase="match-end"`, `phaseTimer=360` = 6 s) ; sinon → `startNextRound()` (rebuild, `roundNumber++`).
  - `match-end` → décrémente le timer. À 0 → `resetToLobby()` (reset wins/ready/roundNumber, `phase="lobby"`). Le `lastInputTick` reste monotone à travers le reset (clientTick = horloge locale, voir Phase 7).
- **Mid-round join/leave** :
  - Join en `playing`/`round-end` → ajouté à `archerIdBySession` + `state.wins[sessionId]=0` + `state.ready[sessionId]=false`, mais PAS dans le world en cours. Apparait au prochain `rebuildWorld()` (start du round suivant). Évite le bug Phase 6 où chaque join resetait tout le monde.
  - Leave en `playing`/`round-end` → `forfeitArcher(slot)` flippe `archer.alive=false` en place (rebuild un Map immutable car `World.archers` est `ReadonlyMap`). Le tick suivant voit ≤ 1 alive → endRound. Le score `state.wins[sessionId]` est conservé pour l'écran post-match.
- **Inputs gated par phase** : `handleInput` ignore tout sauf `playing`/`round-end`. Côté client, `tickNetworked` skip `prediction.stepLocal` et `room.send("input")` hors-jeu, et drop l'`accumulator` pour éviter une rafale de ticks à la reprise.
- **Menu HTML** (`packages/client/src/ui/menu-overlay.ts` + `style.css`) — un seul `#menu-overlay` div par-dessus le canvas, avec écrans : start (Local / Host / Join), join-form (input 4 lettres), connecting, lobby (code + roster + Ready button), match-end (winner + scores + countdown). `escapeHtml()` defensive sur les champs serveur. Le menu re-render à chaque `onStateChange` (cheap, < 200 nodes). Aucun framework UI — juste du DOM natif, le user est débutant et la surface est minuscule.
- **`Game` refactor** (`packages/client/src/game/index.ts`) — le constructeur accepte une `Room<MatchState>` injectée (`main.ts` orchestre la connexion via le menu). `connectAsync()` supprimé, remplacé par `attachRoom(room)`. Nouveau `onPhaseChange(listener)` que le menu utilise pour swap les panels. HUD networked affiche `<CODE> · <phase> · p1 1 / p2 0 (to 3)` au lieu du badge "online — N players" Phase 6.
- **Round overlay Pixi** : `RoundMessageRenderer` réutilisé (déjà partagé via `@arrowfall/engine/round-state.RoundOutcome`). En networked, `composeRoundOverlay()` traduit `state.phase=="round-end"` + `roundWinnerSessionId` → `RoundOutcome` autoritaire (plus dépendant d'un `getRoundOutcome` local qui pourrait diverger).
- **URL params** dev-shortcut (`?local=1`, `?host=1`, `?join=ABCD`, `?net=1` legacy) — sinon menu par défaut. Documenté dans `packages/client/README.md`.
- **Tests** : engine 125 → **130** (+5 — `getRoundOutcome` déplacé de client vers `@arrowfall/engine/round-state`). Server 34 → **64** (+30 : `room-codes.test.ts` 11 cas, `arena-flow.test.ts` 19 cas — code allocation, lobby readiness, round resolution, match end, mid-round join/leave forfeit). Client 26 → **29** (+3 : `room-codes.test.ts` 5 cas, `schema.test.ts` 4 cas, dont `MatchState` defaults). `RoundMessage` test removed (déplacé dans engine).
- **Helpers tests** (`forceStartMatchForTest`, `expireFreezeForTest`, `killArcherForTest`) exposés sur `ArenaRoom` — évitent de tickr 180+ frames pour franchir un freeze, et de plumber un arrow hit déterministe pour terminer un round.
- **Validation manuelle** (à exécuter au merge) :
  1. Tab A : <https://arrowfall-ten.vercel.app> → menu → Host a room → note le code (ex. `XQRP`).
  2. Tab B : même URL → Join with code → `XQRP` → atterrit dans le même lobby.
  3. Les deux cliquent Ready → match démarre, jouer un round, vérifier que le score s'incrémente.
  4. Round 2-3 → quand un joueur atteint 3 wins, écran match-end, retour lobby auto après 6 s.
  5. Mid-round leave (fermer Tab A) → Tab B doit voir le round se terminer immédiatement (forfait) avec lui en gagnant.

## Phase 7 — Client prediction + reconciliation + interpolation (terminé)

✅ Livrée dans la PR `feat/prediction-reconciliation` : <https://github.com/SaadBkz/arrowfall/pull/8>

- **Wire ack** : `MatchState.lastInputTick: MapSchema<uint32>` keyé par sessionId — chaque client envoie `{...input, clientTick}` à 60 Hz, le serveur range le plus haut tick reçu via `validateClientTick` (uint32 + Number.isInteger + range check ; `validateInput` reste pure côté shape engine). `worldToMatchState` mirror la map et la prune sur leave. Le compteur clientTick est monotone et survit aux resets (c'est un horloge locale, pas du round state).
- **PredictionEngine** ([`packages/client/src/net/prediction.ts`](packages/client/src/net/prediction.ts)) — détient `predictedWorld`, FIFO `pendingInputs` borné à 120, `localSlotId` résolu au premier `state.archers.get(sessionId)`. `stepLocal(input)` : push pending, `stepWorld(predictedWorld, {[mySlot]: input})`, ship sur le wire, décrémente le frame counter de la correction lerp. `reconcile(state, sessionId)` : drop pending acked, rebuild via `matchStateToWorld`, replay des restants ; si `|previousLocal.pos - newLocal.pos| > 4 px`, arme un offset de **correction lerp 4 frames** (linéaire, additif au rendu).
- **RemoteInterpolator** ([`packages/client/src/net/interpolation.ts`](packages/client/src/net/interpolation.ts)) — buffer de 5 snapshots par sessionId non-local, capture profonde des champs (les schema instances mutent en place sous nous). Render target = `latestServerTick - 2` (clamp à 0 au cold start). `interpolateBuffer` = lerp linéaire entre la paire bracketante, fallback vers oldest/newest hors-borne, snap des champs discrets (facing/state) sur la frame la plus récente. Cold start = < 2 snapshots → `Game` retombe sur la position prédite (jamais d'extrapolation).
- **Game.tickNetworked réécrit** : `runFixedStep` à 60 Hz drive `prediction.stepLocal(input)` au lieu de mirrorer le state ; `room.send("input", {...input, clientTick})` ; `composeRenderWorld()` superpose les archers interpolés + l'offset de correction sur l'archer local. Les flèches restent celles du predictedWorld (interpolation = Phase 9 si nécessaire).
- **Tradeoffs documentés** (`packages/client/README.md`) : pas de rollback netcode (trop pour un MVP solo), prédiction purement locale sur l'archer du joueur, hit reg toujours autoritaire serveur. Lerp 4 frames = 67 ms (sous le seuil de perception), seuil 4 px = demi-tile (ignore le bruit de drift sur les engine fields non-mirrorés timers/prevBottom).
- **Tests** : engine 125/125 inchangé + **client 26/26** (+19 nouveaux : `prediction.test.ts` 7 cas — monotonicité clientTick, drop pending acked, équivalence prédiction/server par déterminisme moteur, replay unacked, correction armée vs sub-seuil, décroissance — et `interpolation.test.ts` 12 cas — null/singleton/bracket-pair lerp, hors-borne, exclusion local, target tick, clamp 0, cold-start, éviction ring, pruning sur leave) + **server 34/34** (+11 nouveaux pour `validateClientTick`, mirror `lastInputTick`, monotonicité ack et drop sur leave dans `ArenaRoom`).
- Validation manuelle 2-onglets `?net=1` (à exécuter au merge) : sans throttling indistinguable du hot-seat ; sous Slow 3G le mouvement local reste réactif (cible spec §14.3 < 100 ms), les autres bougent en interpolé sans tremblement.

## Phase 6 — Colyseus state schema + sync naïve (terminé)

✅ Livrée dans la PR `feat/colyseus-sync` : *(URL backfill après merge)*

- **Mismatch Colyseus résolu (Option B)** : downgrade serveur en `colyseus@0.16.5` + `@colyseus/schema@^3.0.0`, aligné avec `colyseus.js@0.16.22`. `pnpm.overrides` racine pin tout l'écosystème (`@colyseus/core`, `auth`, `redis-driver`, `redis-presence`, `uwebsockets-transport`, `ws-transport`, `schema`) en 0.16.x — sinon les sub-packages remontaient du 0.17 en transitif. `colyseus.js@0.17` non publié sur npm au moment du choix.
- **State schema** (`packages/server/src/state/`) : `MatchState` (`tick: uint32`, `mapId: string`, `archers: MapSchema<ArcherState>` keyé par sessionId, `arrows: ArraySchema<ArrowState>`). Vec2 fields aplatis (`posX/posY` séparés) pour patcher proprement. `worldToMatchState(world, state, archerIdBySessionId)` mutateur idempotent — réutilise les instances pour minimiser la diff wire.
- **`ArenaRoom`** (`packages/server/src/rooms/`) : `maxClients=6`, `setSimulationInterval(simulate, 1000/60)` (60 Hz logique), `setPatchRate(1000/30)` (30 Hz broadcast). Mid-round join/leave : rebuild complet du World (les positions des autres joueurs se reset — Phase 8 fera mieux). `onMessage("input")` strict-validé, dernier wins ; `onMessage("reset")` gated `NODE_ENV !== "production"`. Le World autoritatif vit dans une propriété privée — l'état Colyseus est un *miroir* dérivé, pas la vérité.
- **Client networking** (`packages/client/src/net/`) : `client.ts` wrapper `colyseus.js` avec auto URL (`VITE_COLYSEUS_URL` > `wss://arrowfall-server.fly.dev` en prod > `ws://localhost:2567` en dev). `schema.ts` redéclare le schéma serveur en lockstep (drift = corruption). `match-mirror.ts` traduit `MatchState` vers le `World` engine pour réutiliser les renderers Phase 4/5 inchangés.
- **Toggle `?net=1`** dans `main.ts` : flippe `Game` en mode networked. Sans flag, hot-seat Phase 5 inchangé. En networked : seul P1 wired (clavier ergonomique), `stepWorld` jamais appelé localement, le World est rebuild à chaque frame depuis `room.state`. HUD badge « online — N players » / « connecting… » / « error: … ».
- **Bug critique trouvé en validation** : sous `useDefineForClassFields: true` (TS default ES2022+), les définitions `field!: T;` émettent un `Object.defineProperty` qui shadow les accessors installés par `Schema.initialize` — `~childType` n'arrive jamais sur les MapSchema/ArraySchema, `encodeAll` throw au premier patch. Fix : utiliser `declare field: T;` qui n'émet rien (constructor-body assignments fire les setters comme attendu par `@colyseus/schema`).
- **Validation cross-tab end-to-end** : 2 clients colyseus.js connectés au serveur local, voient les archers de l'autre, le mouvement de p1 (30 frames de walk-right de x=32 à x=139) est répliqué dans la vue de p2.
- **Tests** : engine 125/125 + client 7/7 (aucune régression) + **server 23/23 nouveaux** (vitest config dans `packages/server`, `validate-input.test.ts` 9 cas, `to-state.test.ts` 6 cas, `arena-room.test.ts` 8 cas — onJoin/onLeave/handleInput/simulate/state mirror/tick monotonicity).
- **Dockerfile** étendu pour copier `packages/{shared,engine}` (le serveur en a besoin maintenant) et utiliser `pnpm install --frozen-lockfile --filter @arrowfall/server...` (trois points = inclure les workspace deps).

## Phase 5 — Hot-seat 2-4 archers (terminé)

✅ Livrée dans la PR `feat/hot-seat` : <https://github.com/SaadBkz/arrowfall/pull/6>

- `@arrowfall/client/game/input.ts` réécrit en mapper N joueurs : une `KeyboardInput` unique maintient un `Map<playerId, KeyState>` et expose `snapshot(playerId)` / `consumeEdges(playerId)` ; `PLAYER_BINDINGS` data-driven (4 slots p1..p4 prêts) ; `consumeReset()` reste un edge global. Les `preventDefault` codes sont dérivés des bindings actifs (au-delà des 6 toujours bloqués : flèches/Espace/Backspace).
- **Conflit `KeyR`** (P1 reset vs P2 shoot) résolu en migrant le reset global vers `Backspace` — accessible à tous, sans collision avec les rangées P2 (FRT) ni P1 (J/K). Documenté README + ce ROADMAP.
- `game/round-state.ts` pur (`getRoundOutcome(world)` → `ongoing | win | draw`). Freeze policy : on flippe dès que ≤ 1 archer `alive=true`, sans attendre `DEATH_DURATION_FRAMES` — le winner est décidé à la frame de l'impact, la fragmentation est cosmétique. Vitest (5 cas).
- `game/render/round-message.ts` : Text PixiJS centré (logical 240×135), tinté à la couleur du slot du gagnant. Visible jusqu'au reset.
- `game/index.ts` : constante `PLAYER_COUNT = 2` (autorisée 1..4), bascule automatique de map (`arena-01` ≤ 2P, `arena-02` ≥ 3P), `Map<id, ArcherInput>` peuplée via `playerIds`, `consumeEdges(id)` pour chaque joueur après `stepWorld`.
- `maps/arena-02.json` : 30×17, 4 spawns en quinconce (un par quadrant), JUMPTHRU centrale 12 tiles + 2 jumpthrus latéraux + spike décoratif row 15.
- HUD multi-archers : 1 ligne par joueur, nom tinté à la couleur du corps via `archerColorFor`, footer (arrows count / fps / `[Backspace] reset`). Plus aucun débordement à 4P (7 lignes × 10 px = 70 px ≪ 270 px).
- Vitest configuré dans `@arrowfall/client` (script `test`) — `round-state.test.ts` (5 cas) + `maps.test.ts` (parse + 4 spawns en quinconce). 7 verts, ~480 ms. Engine reste 125/125, aucune régression.
- README racine + `packages/client/README.md` + ROADMAP à jour avec tableau des contrôles P1/P2 et caveat ghosting clavier > 2 joueurs (gamepads en Phase 11).

## Phase 4 — Rendu client local (terminé)

✅ Livrée dans la PR `feat/client-render` : <https://github.com/SaadBkz/arrowfall/pull/5>

- `@arrowfall/client` repensé : entry `main.ts` boote PixiJS v8 (antialias off, canvas crisp), une `class Game` orchestre l'app, et la simulation passe exclusivement par `stepWorld` de `@arrowfall/engine` — zéro logique de jeu côté client.
- Boucle de jeu **fixed-timestep accumulator** (`game/loop.ts`) : 60 Hz logique, framerate render variable (jusqu'à 144 Hz). Plafond de 5 ticks par frame contre le spiral of death après alt-tab/freeze.
- Mapper clavier (`game/input.ts`) avec distinction *edges* (jump/shoot/dodge — true 1 frame, acquittés par `consumeEdges()` après chaque step) vs *levels* (left/right/up/down/jumpHeld — true tant que tenu). Bindings basés sur `event.code` (layout-independent) avec priorité aux flèches pour AZERTY. Reset complet à `window.blur` (anti touche bloquée). `aimDirection` calculé via `inputDirection()` partagé.
- Rendu Graphics PixiJS uniquement (pas d'assets — Phase 10) en coordonnées logiques 480×270, scaled à l'entier le plus grand qui tient dans la fenêtre, lettrage centré : `tilemap.ts` (one-shot bake static), `archer.ts` (corps 8×11 + tête 8×3 lighter + pixel facing), `arrow.ts` (rect 8×2 rotated par `atan2(vy, vx)` pour les flying), `hud.ts` (Text top-left avec inventaire/alive/fps + `[R] reset`).
- Map jouable `arena-01.json` copiée du fixture engine, hot-reloadable via touche **R** (recrée le World à zéro).
- Engine 125/125 verts, aucune régression. Build Vite ≤ 250 KB gzippé total. Vercel auto-déploie au merge sur main.

## Phase 3 — Combat (terminé)

✅ Livrée dans la PR `feat/combat-arrows` : <https://github.com/SaadBkz/arrowfall/pull/4>

- `@arrowfall/shared` : `ArcherInput` étendu (`shoot` edge + `aimDirection: Direction8 | null`), helper `aimVector(input, facing)`, constantes Phase 3 (`SHOOT_COOLDOWN_FRAMES=8`, `ARROW_SPEED=5`, `MAX_INVENTORY=5`, `SPAWN_ARROW_COUNT=3`, `SPAWN_IFRAME_FRAMES=60`, `DEATH_DURATION_FRAMES=30`, `ARROW_GROUNDED_PICKUP_DELAY=10`, `HEAD_HITBOX_H=3`).
- `@arrowfall/engine/arrow` : `Arrow` (hitbox 8×2, statuts `flying`/`grounded`/`embedded`), `stepArrow` semi-implicit Euler clampé à `MAX_FALL_SPEED`, sweep SOLID-only (JUMPTHRU/SPIKE passables), wrap au seam, distinction floor-landing (`grounded`) vs wall-impact (`embedded`). `dropArrowsOnDeath` éjecte N flèches selon un schéma déterministe à N angles également espacés dans `(-π, 0)` — pas de PRNG.
- `@arrowfall/engine/archer` : `Archer` étendu (`inventory`, `shootCooldownTimer`, `alive`, `deathTimer`, `spawnIframeTimer`), `applyShoot` séparé (retourne `{ archer, newArrow }`), `stepArcher` court-circuite `!alive` et décrémente les nouveaux timers.
- `@arrowfall/engine/world` : `World = { map, archers, arrows, tick, events }` avec `stepWorld(world, inputs)` qui orchestre l'ordre canonique (shoot → step archers → step arrows → arrow/archer → stomp → pickup → drop on death → despawn corpses → tick++). Tri par id partout, hitbox tête = top 3 px, `WorldEvent` union (`arrow-fired`/`arrow-caught`/`archer-killed`/`arrow-picked-up`).
- 125 tests Vitest (< 1.5 s) dont le pivot **600 frames bit-identiques sur deux runs parallèles** (tolérance 0 sur pos/vel/inventaires/timers/events).
- Démo headless `pnpm demo:combat` (`scripts/demo-combat.ts`).

Note : SPIKE ↔ archer est laissé non-bloquant (comportement Phase 2). La cause `'spike'` existe dans `WorldEvent` pour que la Phase 4 le câble sans bump de schéma.

## Phase 2 — Mouvement archer (terminé)

✅ Livrée dans la PR `feat/archer-movement` : <https://github.com/SaadBkz/arrowfall/pull/3>

- `@arrowfall/shared` : `ArcherInput` (edges `jump`/`dodge`, levels `left`/`right`/`up`/`down`/`jumpHeld`) + `inputDirection()` qui mappe les 4 dpad vers `Direction8`.
- `@arrowfall/engine/physics/collide` : sweep axis-separated (`sweepX`/`sweepY`/`moveAndCollide`) + probes `isOnGround`/`isTouchingWall`, sémantique JUMPTHRU avec `prevBottom`, hitbox 8×11, wrap-aware via `tileAt`.
- `@arrowfall/engine/archer` : state machine `idle`↔`dodging`, modules pures `applyWalk`/`applyJump`/`applyDodge`/`applyFastFall` + orchestrateur `stepArcher`. Coyote (`JUMP_GRACE_FRAMES`), jump buffer (`JUMP_BUFFER_FRAMES`), wall-jump avec kick latéral. Iframe du dodge exposé en sortie pour la Phase 3.
- 91 tests Vitest (< 1 s) dont le pivot déterministe **600 frames bit-identiques sur deux runs parallèles** (tolérance 0).

## Phase 1 — Engine bootstrap (terminé)

✅ Livrée dans la PR `feat/engine-bootstrap` : <https://github.com/SaadBkz/arrowfall/pull/2>

- ESLint flat config + Prettier au niveau racine, scripts `pnpm lint` / `pnpm format`.
- `tsconfig.base.json` durci : `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- `@arrowfall/shared` : `Vec2`, `AABB`, helpers scalaires, `Direction8`, types tilemap (`MapData`, `MapJson`, mapping ASCII bijectif), constantes physiques (spec §2) et monde.
- `@arrowfall/engine` : tilemap loader (`parseMap` / `serializeMap`, validateur main-écrit), util grille wrap-aware (`tileAt`, `worldToTile`, `tileToWorld`, `wrapPosition`), `stepGravity` pur. Aucune dépendance externe hors `@arrowfall/shared`.
- 41 tests Vitest verts dont le test pivot **déterministe** de la gravité (deux runs parallèles bit-identiques sur 200 frames, table de valeurs calculée à la main jusqu'à la vélocité terminale).

## Phase 0 — Setup (terminé)

✅ Tout ce qui est fait dans la PR `feat/setup` :

- Repo GitHub initialisé : <https://github.com/SaadBkz/arrowfall>
- Monorepo pnpm avec 4 packages : `shared`, `engine`, `client`, `server`
- TypeScript strict (base + per-package configs)
- Hello world client PixiJS v8 + Vite 8 → **déployé Vercel** : <https://arrowfall-ten.vercel.app>
- Hello world serveur Colyseus 0.17 + tsx → **déployé Fly.io** (region `cdg`, 256 MB) : <https://arrowfall-server.fly.dev>
- Tests Vitest sanity sur `engine` (2/2 verts)
- Lint/format à brancher en Phase 1 (pas critique pour l'instant)

## Dette technique connue (à adresser plus tard)

### ✅ Mismatch de version Colyseus client/serveur — résolu en Phase 6

- **Décision** : downgrade serveur sur `colyseus@0.16.5` + `@colyseus/schema@^3.0.0`, aligné avec `colyseus.js@0.16.22` (client). `colyseus.js@0.17` n'étant pas publié sur npm, on choisit de baisser le serveur plutôt que d'attendre.
- **Mise en œuvre** : `pnpm.overrides` racine pin tout l'écosystème Colyseus (`@colyseus/core`, `auth`, `redis-driver`, `redis-presence`, `uwebsockets-transport`, `ws-transport`, `schema`) en 0.16.x — sinon les sous-packages d'autres dépendances Colyseus ramenaient du 0.17 en transitif.
- **À surveiller** : quand `colyseus.js@0.17` sortira, on pourra upgrade les deux côtés et retirer les overrides (post-MVP).

### 🟡 Pas encore de CI

- ESLint + Prettier ✅ branchés en Phase 1.
- Pas de GitHub Actions CI pour l'instant — à mettre quand on aura plus de tests.

## Comment piloter la suite

À la fin de cette session de setup, ouvre une nouvelle conversation Claude Code et demande :

> « Donne-moi le prompt #2 — Engine bootstrap (tilemap, math 2D, types partagés, premier test deterministe) ».

Une fois ce prompt exécuté et la PR mergée, enchaîne avec #3, etc. Garde un seul prompt actif à la fois pour bien valider chaque livrable.
