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
