# ArrowFall — Spécification de jeu (clone fonctionnel de TowerFall)

> **Document de référence unique** pour la conception et l'implémentation d'ArrowFall.
> Toute logique de jeu doit s'y conformer. Si une situation n'est pas couverte ici, demander avant d'inventer.
> **Inspiration assumée** : TowerFall (Matt Thorson / Maddy Makes Games). ArrowFall est un clone **fonctionnel** : mêmes mécaniques, **noms et assets différents**.

---

## 0. Identité du projet

- **Nom du jeu** : ArrowFall
- **Type** : action 2D pixel art, single-screen, multijoueur compétitif
- **Plateforme** : navigateur PC (Chrome/Firefox/Edge desktop), résolution adaptative, clavier + manette
- **Mode** : Versus uniquement (PvP) — pas de Quest/Trials dans le MVP
- **Joueurs par room** : 2 à 6 simultanés
- **Framerate cible client** : 60 fps
- **Tick rate serveur** : 30 Hz
- **Résolution interne (logique de jeu)** : 480 × 270 px (mise à l'échelle responsive côté rendu)
- **Tile** : 16 × 16 px
- **Univers visuel** : forêts sombres, temples anciens, ambiance crépusculaire — palette inspirée de TowerFall mais assets distincts

---

## 1. Vue d'ensemble du gameplay

Chaque manche (round) oppose 2 à 6 archers dans une arène single-screen. **Un seul coup tue**. Le dernier archer en vie remporte la manche. Le premier joueur à atteindre le **score cible** (défaut : 10) gagne le match.

Entre deux manches, l'arène est régénérée et tous les joueurs réapparaissent sur des spawn points fixes avec leur équipement de base.

**Trois actions définissent le combat** :
1. **Tirer une flèche** (stock limité — il faut ramasser ses flèches au sol).
2. **Sauter sur la tête** d'un adversaire (stomp = kill instantané).
3. **Esquiver** au bon moment, ce qui permet aussi de **rattraper une flèche en plein vol** (catch).

---

## 2. Constantes physiques globales

> Valeurs initiales — à tuner empiriquement. Toutes les unités sont en pixels logiques (résolution interne 480×270) et en frames à 60 fps. **Le serveur tourne à 30 Hz** : adapter en multipliant les vitesses par 2 pour une frame serveur si nécessaire, OU mieux : exécuter la simulation en **pas fixe à 60 Hz côté serveur** et ne diffuser qu'une frame sur deux.

### 2.1 Gravité et chute
| Constante | Valeur | Note |
|---|---|---|
| `GRAVITY` | 0.30 px/frame² | accélération verticale standard |
| `MAX_FALL_SPEED` | 4.0 px/frame | vitesse de chute maximale |
| `FAST_FALL_SPEED` | 6.0 px/frame | si bas maintenu en l'air |

### 2.2 Marche
| Constante | Valeur |
|---|---|
| `WALK_ACCEL` | 0.20 px/frame² |
| `WALK_MAX_SPEED` | 2.0 px/frame |
| `WALK_FRICTION_GROUND` | 0.30 px/frame² |
| `WALK_FRICTION_AIR` | 0.10 px/frame² |

### 2.3 Saut
| Constante | Valeur |
|---|---|
| `JUMP_VELOCITY` | -4.5 px/frame (vers le haut) |
| `JUMP_GRACE_FRAMES` | 6 (coyote time après avoir quitté une plateforme) |
| `JUMP_BUFFER_FRAMES` | 6 (saut bufferisé avant de toucher le sol) |
| `WALL_JUMP_VELOCITY_X` | ±3.0 px/frame |
| `WALL_JUMP_VELOCITY_Y` | -4.0 px/frame |

### 2.4 Dodge (esquive)
Le dodge est l'action centrale d'ArrowFall. Il :
- propulse l'archer dans la direction d'input (8 directions),
- accorde une **invincibilité brève**,
- permet de **rattraper une flèche** si l'archer la touche pendant l'iframe.

| Constante | Valeur |
|---|---|
| `DODGE_SPEED` | 4.0 px/frame |
| `DODGE_DURATION_FRAMES` | 8 |
| `DODGE_INVINCIBILITY_FRAMES` | 12 (iframe — couvre dodge + petit après) |
| `DODGE_COOLDOWN_FRAMES` | 30 (anti-spam) |
| `DODGE_CATCH_WINDOW_FRAMES` | 12 (fenêtre où le contact flèche = catch et non mort) |

### 2.5 Stomp
Si l'archer A retombe sur la **hitbox tête** de l'archer B avec une vélocité Y > 0, B meurt et A rebondit (`STOMP_BOUNCE_VELOCITY = -3.5`).

### 2.6 Hitboxes
| Entité | Largeur × Hauteur |
|---|---|
| Corps archer | 8 × 11 px |
| Tête archer (stompable) | 8 × 3 px (top du corps) |
| Flèche | 8 × 2 px (orientée selon direction) |
| Sol/mur | aligné sur la grille 16×16 |

---

## 3. L'archer

### 3.1 Inventaire de base par round
- **3 flèches normales** au spawn
- Capacité maximale d'inventaire : **5 flèches** (configurable)
- Pas d'arme de mêlée

### 3.2 Cycle de vie
- **Apparition** : sur un spawn point fixe avec invincibilité de 60 frames (1 s)
- **Mort** : à un coup. La mort déclenche une animation de fragmentation (gore stylisé pixel art) ; le corps disparaît après 30 frames
- **Drop d'arrow** : à la mort, les flèches non tirées sont éjectées en arc autour du point de mort et restent ramassables par tout le monde

### 3.3 Animations requises (chaque archer)
- Idle (4 frames boucle)
- Walk (6 frames boucle)
- Jump up / fall down (1 frame chacune)
- Dodge (4 frames)
- Aim (8 directions, 1 frame par direction)
- Shoot (3 frames, recouvre l'animation idle/walk)
- Death (4 frames + disparition)

### 3.4 Skins / archers du MVP
6 archers visuellement distincts, **mécaniquement identiques**. Noms suggérés :
1. **Verdant** (vert forêt)
2. **Crimson** (rouge sang)
3. **Azure** (bleu nuit)
4. **Saffron** (jaune doré)
5. **Onyx** (noir)
6. **Frost** (blanc/cyan)

---

## 4. Tir et flèches

### 4.1 Mécanique de tir
- **Visée** : à 8 directions, selon les inputs gauche/droite + haut/bas + tir.
- **Tap shoot** : pression brève → tir immédiat dans la direction de visée.
- **Charged shoot** (optionnel — V2) : maintenir = visée libre 360° avec ralenti. **Désactivé dans le MVP** pour simplifier.
- **Cooldown entre tirs** : 8 frames.
- **Récupération** : marcher sur une flèche au sol la ramasse (sauf cooldown court de 10 frames après son atterrissage, pour éviter le pickup immédiat).
- **Limite d'arrows à l'écran par joueur** : pas de limite stricte, mais l'inventaire de l'archer plafonne à 5.

### 4.2 Vitesse et physique des flèches
| Type de flèche | Vitesse | Gravité | Comportement |
|---|---|---|---|
| Normal | 5.0 px/frame | oui | trajectoire balistique standard |
| Bomb | 4.5 px/frame | oui | explose au contact d'un mur ou après 60 frames ; rayon 24 px |
| Drill | 5.0 px/frame | oui | perce **un seul** bloc solide puis impacte le suivant |
| Laser | 7.0 px/frame | non | rebondit jusqu'à **7 fois** puis disparaît après 30 frames |
| Bramble | 4.5 px/frame | oui | au contact d'une surface, génère des ronces létales 16×16 sur 90 frames |
| Feather | 8.0 px/frame | non | très rapide, pas de gravité |

> **MVP — types à implémenter** : Normal, Bomb, Drill, Laser. Bramble et Feather en V2.

### 4.3 Catch d'arrow (rattrapage)
Si une flèche touche un archer pendant `DODGE_CATCH_WINDOW_FRAMES` :
- la flèche est ajoutée à son inventaire (jusqu'à `MAX_INVENTORY`),
- elle conserve son **type** (catch d'une bomb arrow = bomb arrow dans l'inventaire),
- aucun dégât.

### 4.4 Friendly fire
- Activé par défaut : tu peux mourir de ta propre flèche qui te revient dessus (wrap d'écran).
- Pour un mode équipe (V2), désactivable.

---

## 5. Arènes (maps)

### 5.1 Structure
- Une arène = **grille 30 × 17 tiles** (480×270 px).
- Une cellule peut être : `EMPTY`, `SOLID` (mur plein), `JUMPTHRU` (plateforme traversable par le bas), `SPIKE` (mort au contact), `SPAWN` (point d'apparition d'archer), `CHEST_SPAWN` (spawn de coffre).

### 5.2 Wrap d'écran
- **Wrap horizontal et vertical** : un archer ou une flèche qui sort à droite réapparaît à gauche, idem haut/bas.
- Le wrap est **continu** : l'animation ne saute pas, elle est dupliquée des deux côtés pendant la transition.

### 5.3 Maps du MVP
Au moins **3 arènes distinctes** :
1. **Sacred Grove** — symétrique, plateformes horizontales étagées, ambiance forêt.
2. **Twin Spires** — verticale, deux tours latérales et un puits central.
3. **Old Temple** — labyrinthique, beaucoup de jumpthru, gravité standard.

Format de stockage : JSON (grille 2D + métadonnées spawn points et chest spawns).

---

## 6. Coffres au trésor (treasure chests)

### 6.1 Spawn
- Au début du round, **0 coffre** spawne.
- À intervalles aléatoires (entre 4 et 8 secondes), **1 coffre** apparaît sur l'un des `CHEST_SPAWN` libres de la map.
- Maximum **2 coffres simultanés** sur la map.

### 6.2 Ouverture
- Un archer ouvre un coffre en marchant dessus → animation 30 frames → contenu éjecté.
- **Contenu possible** (probabilités MVP) :
  - 50 % : 2 flèches normales
  - 20 % : 2 flèches bomb
  - 15 % : 2 flèches drill
  - 10 % : 2 flèches laser
  - 5 % : un **shield** (consomme un hit mortel)

### 6.3 Bomb trap chest (V2 — optionnel MVP)
1 chance sur 10 qu'un coffre soit piégé : explose à l'ouverture. Désactivé par défaut dans le MVP.

---

## 7. Modes Versus

### 7.1 Last Archer Standing (MVP)
- Mode unique du MVP.
- Round = jusqu'à ce qu'il ne reste qu'un archer en vie.
- Le survivant marque **+1 point**.
- En cas d'égalité (tous morts dans la même frame), aucun point.
- **Match** : premier à 10 points gagne. Configurable (5/10/15/20).

### 7.2 Modes V2 (hors MVP)
- Headhunters (kills cumulés sur durée fixe)
- Team Deathmatch (équipes)

---

## 8. Multijoueur en ligne

### 8.1 Architecture
- **Serveur autoritaire** en Node.js avec **Colyseus** (framework de game server).
- **Client** TypeScript + PixiJS, connecté en WebSocket.
- Toute simulation logique tourne sur le serveur. Le client fait du **rendu + prédiction + interpolation**.

### 8.2 Flux d'une session
1. Joueur arrive sur la home → entre un pseudo → choisit un archer.
2. Joueur crée une room (génère un code à 4 lettres) **ou** rejoint une room via code.
3. La room a un **lobby** : les joueurs voient les autres se connecter, le créateur lance le match.
4. Le serveur initialise un round, broadcast l'état initial.
5. Boucle de jeu : input client → serveur 30 Hz → broadcast snapshot → rendu interpolé client.
6. Fin du round → écran de score 5 s → round suivant.
7. Match terminé → écran final → retour lobby.

### 8.3 Schéma d'état serveur (Colyseus state)
- `match` : { scoreToWin, mapId, status: 'lobby' | 'starting' | 'playing' | 'roundEnd' | 'matchEnd' }
- `players` : Map<sessionId, Player> avec position, vélocité, archerId, alive, score, inventory[5]
- `arrows` : Array<Arrow> avec position, vélocité, type, ownerId, age
- `chests` : Array<Chest> avec position, contentSpec, opened
- `events` (one-shot) : kills, catches, openings — pour le rendu d'effets côté client.

### 8.4 Inputs client
Inputs envoyés à 60 Hz : `{ left, right, up, down, jump, shoot, dodge, aimDirection (8 valeurs) }`.
Le serveur réconcilie en se basant sur le timestamp d'input.

### 8.5 Lag compensation (MVP simple)
- **Client prediction** sur le mouvement de l'archer local.
- **Server reconciliation** : le serveur renvoie l'état authoritatif ; si écart > seuil, le client se corrige avec un lerp court (4 frames).
- **Interpolation** des autres archers (rendu 100 ms en arrière de l'état réel).
- **Pas de rollback netcode** dans le MVP — trop complexe pour un débutant.

### 8.6 Cas limites à gérer explicitement
- Déconnexion en cours de round : l'archer meurt instantanément, le round continue.
- Reconnexion : possible pendant le round suivant si la room existe encore.
- Hôte qui quitte : promotion automatique du joueur restant le plus ancien.
- Room vide pendant > 60 s : suppression.

---

## 9. Contrôles

### 9.1 Clavier (par défaut)
| Action | Touche |
|---|---|
| Marche gauche/droite | ← / → ou A / D |
| Visée haute | ↑ ou W |
| Crouch / fast-fall | ↓ ou S |
| Saut | Espace |
| Tir | J |
| Dodge | K |

### 9.2 Manette (Gamepad API)
| Action | Bouton |
|---|---|
| Mouvement / visée | stick gauche |
| Saut | A / Cross |
| Tir | X / Square |
| Dodge | B / Circle ou L1 |

### 9.3 Remappage
- Stocké en `localStorage` côté client.
- Pas de profil serveur dans le MVP.

---

## 10. Audio (V2 si pression sur le scope)

### 10.1 SFX
- shoot, jump, dodge, land, catch, death, chest_open, bomb_explode, drill_pierce, laser_bounce, round_start, round_end, victory.

### 10.2 Musique
- 1 piste de lobby + 1 piste de round (loopable). Sources libres CC0 (Free Music Archive, OpenGameArt).

---

## 11. Architecture technique cible

```
arrowfall/
├── packages/
│   ├── shared/              # types, constantes, math, state schemas
│   ├── engine/              # simulation pure (sans rendu, sans réseau) — testable
│   ├── client/              # PixiJS + Vite, rendu et input
│   └── server/              # Colyseus, expose engine en autoritaire
├── assets/                  # sprites, tilemaps, sons (CC0)
├── package.json             # workspaces yarn ou pnpm
└── README.md
```

Le **package `engine`** est la pièce centrale : pur TypeScript, sans dépendance navigateur ni réseau, **testé avec Vitest**. Le serveur l'importe et l'exécute. Le client peut aussi l'exécuter pour la prédiction locale.

---

## 12. Glossaire

- **Archer** : personnage joueur.
- **Round** : une manche, jusqu'à ce qu'il ne reste qu'un archer.
- **Match** : succession de rounds, jusqu'au score cible.
- **Catch** : rattrapage d'une flèche ennemie pendant un dodge.
- **Stomp** : kill par saut sur la tête.
- **Wrap** : sortie d'écran qui réapparaît du côté opposé.
- **Tilemap** : grille 30×17 de cellules d'arène.
- **Tick** : frame de simulation serveur (30 Hz).

---

## 13. Hors-scope explicite (NE PAS implémenter dans le MVP)

- Mode Quest (coop PvE)
- Mode Trials
- Bramble, Feather, Bolt, Trigger, Prism arrows
- Orbs (Dark, Time, Lava, Space)
- Variants (les 70 modificateurs de TowerFall)
- Achievements
- Replays
- Système de comptes / persistance / leaderboard
- Friendly fire désactivable, équipes
- Chat textuel ou vocal in-game
- Mobile / tactile
- Internationalisation (FR/EN seulement, FR par défaut côté UI)

---

## 14. Critères d'acceptation du MVP

Le MVP est considéré « livré » quand toutes les conditions suivantes sont vraies :

1. ✅ Deux joueurs sur deux machines différentes (réseau Internet) peuvent jouer un match complet à 10 points.
2. ✅ La simulation est **autoritative serveur** : aucun input client ne modifie directement l'état.
3. ✅ Latence < 100 ms entre l'action joueur et le retour visuel local (grâce à la prédiction).
4. ✅ Les 4 mécaniques cardinales fonctionnent : tirer, dodge-catch, stomp, wrap d'écran.
5. ✅ Au moins 3 maps, 4 types de flèches (Normal/Bomb/Drill/Laser), coffres avec contenus aléatoires.
6. ✅ Lobby avec code de room à 4 lettres partageable.
7. ✅ Engine testé : ≥ 80 % de couverture sur `packages/engine`.
8. ✅ Déployé : front Vercel + serveur Fly.io, accessible publiquement.
9. ✅ Aucun crash serveur sur une session de 30 min en charge 6 joueurs.
10. ✅ README clair : comment lancer en local, comment déployer, comment ajouter une map.

---

*Fin du document. Toute évolution = bump de version en tête de fichier et notification dans le projet.*
