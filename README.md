# ArrowFall

Clone fonctionnel de **TowerFall** — jeu d'action 2D pixel art, multijoueur en ligne, **2 à 6 joueurs**, jouable dans un navigateur PC.

> 📐 Spec complète : [`arrowfall-spec.md`](./arrowfall-spec.md)
> 🗺️ Plan par phases : [`ROADMAP.md`](./ROADMAP.md)

## Déploiements

- **Front (client PixiJS + Vite)** : <https://arrowfall-ten.vercel.app>
- **Back (Colyseus on Fly.io, region `cdg`)** : <https://arrowfall-server.fly.dev>

> ⚠️ La connexion WebSocket entre les deux est temporairement bloquée par un mismatch de version Colyseus 0.17 (server) / 0.16 (client). Voir la section _Dette technique_ dans [`ROADMAP.md`](./ROADMAP.md). Sera réglé en Phase 7.

## Stack

| Couche | Tech |
|---|---|
| Langage | TypeScript strict |
| Gestionnaire de paquets | pnpm 10 (workspaces) |
| Runtime serveur | Node 20+ |
| Build client | Vite 8 |
| Rendu 2D | PixiJS v8 |
| Game server | Colyseus 0.17 |
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
pnpm --filter @arrowfall/client build  # bundle Vite, ≤ 250 KB gzippé
```

### Contrôles clavier (priorité flèches — AZERTY-friendly)

| Action | Touche primaire | Alternative |
|---|---|---|
| Aller à gauche | `←` | `A` / `Q` |
| Aller à droite | `→` | `D` |
| Viser haut | `↑` | `W` / `Z` |
| Viser bas / fast-fall | `↓` | `S` |
| Saut | `Espace` | — |
| Tirer | `J` | — |
| Esquive (dodge) | `K` | — |
| Reset du round | `R` | — |

Tirer sans direction = horizontal vers le facing de l'archer ; combiner directions + `J` = visée 8 directions. La fenêtre d'iframe du dodge sert aussi à catch les flèches (rappel spec §2.4). Les flèches qui sortent par la droite réapparaissent à gauche (wrap continu, spec §5.2).

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
