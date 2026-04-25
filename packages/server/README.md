# `@arrowfall/server`

Serveur autoritaire Colyseus pour ArrowFall. Importe `@arrowfall/engine` et exécute la simulation à 60 Hz, broadcast l'état à 30 Hz vers les clients.

## Versions Colyseus — pourquoi 0.16 et pas 0.17

État au moment du choix (Phase 6) :

| Package | Latest npm |
|---|---|
| `colyseus` (server) | 0.17.10 |
| `colyseus.js` (client SDK) | **0.16.22** |

Le client `colyseus.js@0.17` n'est **pas publié**. Le wire protocol diffère entre 0.16 et 0.17, donc client 0.16 + server 0.17 = `connection failed` au `joinOrCreate`.

**Option B retenue** : downgrade serveur en `colyseus@0.16.5` + `@colyseus/schema@^3.0.0`, alignés sur ce que `colyseus.js@0.16.22` consomme.

Comme l'écosystème Colyseus publie aussi `@colyseus/core`, `@colyseus/auth`, `@colyseus/uwebsockets-transport` etc. en 0.17, on force tout l'arbre en 0.16 via `pnpm.overrides` (voir le `package.json` racine).

À tester périodiquement : `npm view colyseus.js version` — quand 0.17.x sortira, on pourra basculer (Phase 7+) en upgrade serveur + client + retirer les overrides.

## Lancer en local

```bash
pnpm --filter @arrowfall/server dev    # tsx watch, reboot sur édition
pnpm --filter @arrowfall/server start  # one-shot
```

Écoute par défaut sur `ws://localhost:2567`. La room `arena` sera disponible dès le premier `joinOrCreate` client.

## Tests

```bash
pnpm --filter @arrowfall/server test
```

## Architecture (Phase 6)

- `src/main.ts` — entrypoint Node, monte le serveur HTTP + WebSocketTransport, déclare la room `arena`.
- `src/rooms/arena-room.ts` — `ArenaRoom extends Room<MatchState>` : tient le `World` autoritatif en propriété privée, simule à 60 Hz, broadcast à 30 Hz, gère join/leave/inputs.
- `src/state/` — schémas Colyseus (`MatchState`, `ArcherState`, `ArrowState`) + `worldToMatchState(world, state)` mutateur idempotent.
- `src/index.ts` — re-exports pour les tests.

Le `World` engine vit côté serveur uniquement ; le state Colyseus est un **miroir** dérivé de ce world (pas la source de vérité). Les sous-objets (`Vec2`) sont aplatis en `x`/`y` séparés — `@colyseus/schema` ne sérialise proprement que les types décorés.

## Déploiement

Voir `Dockerfile` + `fly.toml`. Région primaire `cdg`, 256 MB, auto-stop. Redéploiement manuel :

```bash
flyctl deploy --config packages/server/fly.toml --dockerfile packages/server/Dockerfile --remote-only --ha=false
```
