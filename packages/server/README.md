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
pnpm --filter @arrowfall/server test    # 64 cas vitest, ~0.6 s
```

Couverture :
- `rooms/room-codes.test.ts` (11 cas) — alphabet, length, normalize, reserve/release, pickAvailableRoomCode + saturation.
- `rooms/arena-room.test.ts` (11 cas) — join/leave, input validation, mirror sessionId↔archerId, lastInputTick monotonicity (Phase 6/7).
- `rooms/arena-flow.test.ts` (19 cas, Phase 8) — code allocation, lobby readiness, round resolution, match end, mid-round join queue + leaver forfeit.
- `rooms/validate-input.test.ts` (9 cas) — strict shape validation + clientTick range checks.
- `state/to-state.test.ts` (6 cas) — `worldToMatchState` upsert + prune semantics.

Helpers test exposés sur `ArenaRoom` (`forceStartMatchForTest`, `expireFreezeForTest`, `killArcherForTest`) — évitent de tickr 180+ frames pour franchir un freeze ou de simuler un arrow hit déterministe pour terminer un round.

## Architecture (Phase 6 → Phase 8)

- `src/main.ts` — entrypoint Node, monte le serveur HTTP + WebSocketTransport, déclare la room `arena` avec `filterBy(["code"])` (Phase 8) pour router les `join({ code })`.
- `src/rooms/arena-room.ts` — `ArenaRoom extends Room<MatchState>` : tient le `World` autoritatif en propriété privée, simule à 60 Hz, broadcast à 30 Hz, gère join/leave/inputs **et la machine d'états lobby/playing/round-end/match-end**.
- `src/rooms/room-codes.ts` — Phase 8. Génération + registry des codes 4 lettres (alphabet 24 lettres sans I/O), reserved/released en `onCreate`/`onDispose`.
- `src/rooms/validate-input.ts` — `validateInput` (engine shape) + `validateClientTick` (Phase 7 ack channel).
- `src/state/` — schémas Colyseus (`MatchState`, `ArcherState`, `ArrowState`) + `worldToMatchState(world, state, sessions, lastTicks)` mutateur idempotent. Phase 8 : `MatchState` a `phase / phaseTimer / roomCode / roundNumber / targetWins / wins / ready / roundWinnerSessionId / matchWinnerSessionId`.
- `src/index.ts` — re-exports pour les tests.

Le `World` engine vit côté serveur uniquement ; le state Colyseus est un **miroir** dérivé de ce world (pas la source de vérité). Les sous-objets (`Vec2`) sont aplatis en `x`/`y` séparés — `@colyseus/schema` ne sérialise proprement que les types décorés.

### Phase 8 — flow d'une room

```
client.create("arena", { code })  ──► onCreate(options) — reserveRoomCode, state.phase="lobby"
client.join("arena",   { code })  ──► matchmaker filterBy(code) → onJoin
                                        │
                                        ▼
                                   handleReady → ready toggle, maybeStartMatch()
                                        │ (when all ready ∧ size≥2)
                                        ▼
                                   startMatch() → state.phase="playing", rebuildWorld
                                        │
                                        ▼ (every tick)
                                   simulate() — stepWorld + getRoundOutcome
                                        │
                                        ├── win/draw → endRound() → state.phase="round-end" (180 frames freeze)
                                        │      │
                                        │      ▼ (timer expires)
                                        │   if max(wins) ≥ targetWins → endMatch() → state.phase="match-end" (360 frames freeze)
                                        │   else → startNextRound() → roundNumber++, rebuildWorld
                                        │
                                        ▼ (timer expires after match-end)
                                   resetToLobby() — wins/ready reset, state.phase="lobby"
                                        │
                                        ▼
                                   onDispose → releaseRoomCode
```

Mid-round join est **queue** (sessionId tracké, pas dans le World courant) jusqu'au prochain `rebuildWorld` (start du round suivant). Mid-round leave est un **forfait** (`alive=false` en place) — l'archer reste dans le World pour ne pas casser les positions des autres ; le tick suivant verra ≤ 1 alive et fermera le round naturellement. Score préservé sur leave (utile pour l'écran post-match).

Inputs sont `silently neutralized` hors `playing`/`round-end` (lobby & match-end ignorent `handleInput`). Côté client, le mode networked drop son `accumulator` et bypass `prediction.stepLocal` aux mêmes phases pour ne pas dériver pendant la pause.

## Déploiement

Voir `Dockerfile` + `fly.toml`. Région primaire `cdg`, 256 MB, auto-stop. Redéploiement manuel :

```bash
flyctl deploy --config packages/server/fly.toml --dockerfile packages/server/Dockerfile --remote-only --ha=false
```
