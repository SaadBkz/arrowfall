# ArrowFall

Clone fonctionnel de **TowerFall** — jeu d'action 2D pixel art, multijoueur en ligne, **2 à 6 joueurs**, jouable dans un navigateur PC.

> 📐 Spec complète : [`arrowfall-spec.md`](./arrowfall-spec.md)
> 🗺️ Plan par phases : [`ROADMAP.md`](./ROADMAP.md)

## Déploiements

- **Front (client PixiJS + Vite)** : <https://arrowfall-ten.vercel.app>
- **Back (Colyseus on Fly.io, region `cdg`)** : <https://arrowfall-server.fly.dev>

> ✅ Phase 8 (avril 2026) : lobby + codes de room 4 lettres + écran fin de round/match. Un menu d'accueil HTML accueille les joueurs : Hot-seat / Host / Join. Voir [Phase 8](#phase-8--lobby--codes-de-room--fin-de-roundmatch) plus bas.

## Stack

| Couche | Tech |
|---|---|
| Langage | TypeScript strict |
| Gestionnaire de paquets | pnpm 10 (workspaces) |
| Runtime serveur | Node 20+ |
| Build client | Vite 8 |
| Rendu 2D | PixiJS v8 |
| Game server | Colyseus 0.16 (server + `colyseus.js` aligné) |
| Tests | Vitest |
| Hébergement front | Vercel (Hobby) |
| Hébergement back | Fly.io (shared-cpu-1x, 256 MB, region `cdg`) |

## Architecture (monorepo)

```
arrowfall/
├── packages/
│   ├── shared/    # types, constantes, helpers (pure)
│   ├── engine/    # simulation pure, headless, testable Vitest
│   ├── client/    # PixiJS + Vite (browser)
│   └── server/    # Colyseus (Node)
├── assets/        # sprites, tilemaps, sons (à venir)
├── ROADMAP.md
└── arrowfall-spec.md
```

## Lancer en local

Pré-requis : Node ≥ 20, pnpm ≥ 9, Git.

```bash
# Install des deps de tous les packages
pnpm install

# Client (PixiJS + Vite) sur http://localhost:5173
pnpm --filter @arrowfall/client dev

# Serveur (Colyseus) sur http://localhost:2567
pnpm --filter @arrowfall/server dev

# Lancer tous les tests Vitest
pnpm test

# Typecheck tous les packages
pnpm typecheck

# Lint + format (Phase 1)
pnpm lint
pnpm format        # rewrite, ou:
pnpm format:check  # check seul
```

## Phase 1 — Engine

Le package `engine` est la simulation **pure** (pas de DOM, pas de réseau, pas de Node-only). Il importe uniquement `@arrowfall/shared` pour les constantes et helpers.

```bash
# Lance la suite Vitest de l'engine
pnpm --filter @arrowfall/engine test
```

La suite couvre la math 2D (`Vec2`, `AABB`, `Direction8`), le loader tilemap (parse/serialize round-trip + erreurs avec ligne/colonne), les utilitaires de grille wrap-aware (480×270), et un test déterministe pivot de la gravité (deux runs parallèles bit-identiques sur 200 frames).

## Phase 2 — Mouvement archer

L'archer est une state machine pure (`idle` ↔ `dodging`) implémentée dans [`packages/engine/src/archer/`](./packages/engine/src/archer/). L'API publique est `stepArcher(archer, input, map)` qui orchestre walk → jump → gravité → fast-fall → moveAndCollide → wrap dans cet ordre exact, avec hitbox 8×11 et collision tilemap axis-separated (sweepX puis sweepY) gérant la sémantique « JUMPTHRU = solide uniquement quand on descend depuis au-dessus ». Coyote, jump buffer et wall-jump sont en place ; le timer d'iframe du dodge est exposé pour la Phase 3 (catch d'arrow). Suite de tests à jour avec un pivot déterministe 600 frames bit-identique sur deux runs parallèles.

```bash
pnpm --filter @arrowfall/engine test
```

## Phase 3 — Combat

La couche combat ajoute la flèche normale, le tir avec inventaire, la mort à un coup, le catch pendant un dodge, le stomp sur la tête, le pickup au sol et le drop d'arrows à la mort. Tout est orchestré par un nouveau `stepWorld(world, inputs)` (dans [`packages/engine/src/world/`](./packages/engine/src/world/)) qui agrège archers + flèches + map en un état pur, avec un ordre d'itération canonique (tri alphabétique par id partout) — exigence dure pour le déterminisme client/serveur. Aucun PRNG : le drop d'arrows utilise un schéma à N angles fixes dans le demi-cercle haut. La suite Vitest couvre chaque mécanique séparément + un scénario pivot 600 frames bit-identique sur deux runs parallèles (positions, vélocités, inventaires, timers, et la liste d'events).

```bash
# Suite engine (125 tests, ~1.3 s)
pnpm --filter @arrowfall/engine test

# Démo headless 2 archers, 600 frames, trace lisible
pnpm demo:combat
```

## Phase 4 — Rendu client local

Le hello-world Phase 0 a été remplacé par un client PixiJS solo jouable. Tout passe par l'engine (`stepWorld` à 60 Hz) — le client ne fait que rendu + capture clavier + boucle de jeu. Pas de réseau dans cette phase. Voir [`packages/client/README.md`](./packages/client/README.md) pour l'architecture du dossier.

```bash
pnpm --filter @arrowfall/client dev    # http://localhost:5173
pnpm --filter @arrowfall/client build  # bundle Vite
```

## Phase 5 — Hot-seat 2-4 archers

Le client supporte maintenant 2 à 4 joueurs sur le même clavier. La constante `PLAYER_COUNT` en tête de [`packages/client/src/game/index.ts`](./packages/client/src/game/index.ts) bascule entre `arena-01` (2P par défaut) et `arena-02` (4 spawns en quinconce). Détection de fin de round + message « PX wins! » / « Draw! » centré, reset par `Backspace`. Aucune modif moteur (multi-archers déjà câblé Phase 3). Vitest minimal côté client : `getRoundOutcome` + validation des fixtures de map.

### Contrôles clavier (hot-seat)

Les bindings utilisent `event.code` (layout-independent — `KeyA` = position physique « A » sur QWERTY = « Q » sur AZERTY, donc `KeyW`/`KeyA`/`KeyS`/`KeyD` correspond visuellement à ZQSD sur AZERTY).

| Action | P1 (rouge) | P2 (bleu) |
|---|---|---|
| Gauche / Droite | `←` / `→` | `A` / `D` (= Q / D AZERTY) |
| Haut | `↑` | `W` (= Z AZERTY) |
| Bas / fast-fall | `↓` | `S` |
| Saut | `Espace` | `F` |
| Tirer | `J` | `R` |
| Dodge | `K` | `T` |

| Reset (global) | `Backspace` |
|---|---|

P3 (vert) et P4 (jaune) sont câblés (Numpad et `[ ] ; ' / \ .`) mais **non validés ergonomiquement** : au-delà de 2 joueurs, les claviers physiques ont du **N-key rollover** limité (anti-ghost matrices) — plusieurs touches simultanées peuvent être ignorées. Les manettes en Phase 11 résoudront ce problème proprement. Tirer sans direction = horizontal vers le facing de l'archer ; combiner directions + tir = visée 8 directions (rappel spec §4.1). La fenêtre d'iframe du dodge sert aussi à catch les flèches (rappel spec §2.4). Les flèches qui sortent par la droite réapparaissent à gauche (wrap continu, spec §5.2).

## Phase 8 — Lobby + codes de room + fin de round/match

Le boot du client affiche désormais un **menu HTML** par défaut : trois entrées, **Hot-seat** (local 1-4P), **Host a room** (génère un code 4 lettres), **Join with code** (rejoindre par code). Une fois 2 joueurs prêts dans le lobby, le match démarre — le premier à 3 wins remporte la partie. Les rounds enchaînent automatiquement avec un freeze de 3 s après chaque kill (le winner est tinté à sa couleur), et un écran de victoire de 6 s à la fin du match avant retour au lobby.

| Écran | Contenu |
|---|---|
| Start | 3 boutons (Local / Host / Join) |
| Join form | input 4 lettres, validation client (alphabet sans I/O) |
| Lobby | code de room en gros, roster avec ready toggle, bouton « Ready up » |
| Round-end | overlay Pixi « PX wins! » tinté à la couleur du gagnant (3 s) |
| Match-end | overlay HTML « X wins! », scores finaux, countdown retour lobby (6 s) |

Mid-round, un nouveau joueur reste en queue et apparaît au prochain round (pas de reset des positions) ; un quitteur est instantanément forfait (`alive=false` en place) — si ça réduit le compte à 1 alive, le round se ferme et son score est conservé.

```bash
# 1. Lance le serveur Colyseus (port 2567)
pnpm --filter @arrowfall/server dev

# 2. Lance le client Vite (port 5173)
pnpm --filter @arrowfall/client dev

# 3. Tab A : http://localhost:5173/  → Host → note le code (ex. XQRP)
# 4. Tab B : http://localhost:5173/  → Join → tape XQRP
# 5. Les 2 cliquent Ready → le match démarre.
```

Shortcuts URL pour skip le menu (dev) :

```
?local=1     → hot-seat direct
?host=1      → host direct (code généré)
?join=ABCD   → rejoindre direct
?net=1       → alias legacy de ?host=1 (Phase 6 quick-play)
```

Détails : [`packages/server/README.md`](./packages/server/README.md) (machine d'états + room codes), [`packages/client/README.md`](./packages/client/README.md) (menu HTML + flow).

## Phase 6 — Colyseus sync naïve

Le serveur Colyseus est désormais autoritaire : il tient le `World` engine, simule à 60 Hz et broadcast l'état à 30 Hz vers les clients. Un toggle URL `?net=1` active le mode networked sur le client ; sans le toggle, le hot-seat Phase 5 reste inchangé.

| | Local (par défaut) | Networked (`?net=1`) |
|---|---|---|
| Simulation | client (`stepWorld` 60 Hz) | serveur (`stepWorld` 60 Hz) |
| Inputs | clavier local pour 2-4 archers | clavier P1 → `room.send("input", …)` |
| Reset | `Backspace` (recrée le `World` local) | `Backspace` → `room.send("reset")` (dev-only) |
| Joueurs | 2-4 sur le même clavier | 1 par onglet, 2-6 onglets cross-machine |
| Affichage | « local — N players » | « online — N players » / « connecting… » / « error: … » |

```bash
# 1. Lance le serveur Colyseus (port 2567)
pnpm --filter @arrowfall/server dev

# 2. Lance le client Vite (port 5173)
pnpm --filter @arrowfall/client dev

# 3. Ouvre 2 onglets sur http://localhost:5173/?net=1
#    Chaque onglet contrôle son propre archer ; tu vois les autres dans le même état.
```

URL serveur configurable via `VITE_COLYSEUS_URL` (override) ; sinon prod = `wss://arrowfall-server.fly.dev`, dev = `ws://localhost:2567`.

Détails : [`packages/server/README.md`](./packages/server/README.md) (architecture room + schema) et [`packages/client/README.md`](./packages/client/README.md) (mode networked).

La résolution du mismatch Colyseus client/serveur (Option B : downgrade serveur en 0.16) est documentée dans [`packages/server/README.md`](./packages/server/README.md) et la section _Dette technique_ de [`ROADMAP.md`](./ROADMAP.md).

## Déployer

### Front sur Vercel

```bash
# Premier setup (déjà fait pour ce repo)
vercel link --yes --project arrowfall --scope saadbkzs-projects

# Déploiement preview
vercel deploy --yes

# Déploiement production
vercel deploy --yes --prod
```

Le build est piloté par [`vercel.json`](./vercel.json) à la racine (lit `pnpm --filter @arrowfall/client build` et publie `packages/client/dist`).

### Back sur Fly.io

```bash
# Premier setup (déjà fait pour ce repo)
flyctl apps create arrowfall-server --org personal

# Déploiement
flyctl deploy --config packages/server/fly.toml \
              --dockerfile packages/server/Dockerfile \
              --remote-only \
              --ha=false
```

Le Dockerfile est multi-stage Node 20 alpine, lance le serveur via `pnpm start` (qui exécute `tsx src/main.ts`).

## Contribuer

1. Branch depuis `main` : `feat/<nom-feature>`
2. Commit, push, ouvrir une PR vers `main`
3. Squash-merge

Pour la suite du développement, suivre [`ROADMAP.md`](./ROADMAP.md) phase par phase.

## Licence

MIT (à confirmer — à ajouter avant la sortie du MVP).

ArrowFall est une **réimplémentation fonctionnelle** de TowerFall (Matt Thorson / Maddy Makes Games) — mêmes mécaniques, **noms et assets différents**.
