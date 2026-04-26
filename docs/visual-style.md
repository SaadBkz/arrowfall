# ArrowFall — Visual Style Contract (Phase 10)

Ce document est le **contrat artistique** de la Phase 10. Toute décision visuelle doit s'y aligner. Si la spec et ce document divergent, ce document gagne pour la couche rendu (la spec gagne pour le gameplay).

## 0. Stratégie d'asset

**100% procédural CC0**, généré côté client via HTML5 Canvas au boot, puis converti en `PIXI.Texture` pour le rendu. Pas un seul fichier binaire d'asset n'est versionné. Avantages :

- CC0 par construction (notre code, notre licence — voir `assets/CREDITS.md`).
- Bundle léger (~0 KB d'assets, gain ~1.5 MB sur un pack équivalent).
- Reproductible et tunable (changer une palette = re-build, pas re-paint).
- Zéro risque légal : aucun pixel TowerFall n'est extrait.

Le code générateur vit sous `packages/client/src/assets/`. La fonction `buildAllAssets()` est appelée une fois au démarrage par `main.ts` et retourne un `AssetRegistry` injecté dans `Game`.

## 1. Résolution & grille

- Tile : **16 × 16 px** (immuable, aligné sur la grille moteur).
- Archer sprite : **16 × 16 px** par frame, body visible ~10×13 (déborde la hitbox 8×11 — silhouette > collider).
- Arrow sprite : **8 × 4 px** par frame (déborde l'AABB 8×2 d'1 px haut et bas pour empennage / glow).
- Chest sprite : **16 × 16 px** par frame, ouverture 6 frames sur 30 frames d'`openTimer`.
- Background : **480 × 270 px** plein écran, parallax ×0.4 (back) + ×0.7 (mid).

## 2. Palettes — 32 couleurs par thème

Chaque palette est structurée en familles de 4 tons : `shadow / mid / light / spec` (specular/highlight). Les palettes sont définies en TS sous `packages/client/src/assets/palettes.ts`.

### 2.1 Sacred Grove (forêt diurne)

| Famille | shadow | mid | light | spec |
|---|---|---|---|---|
| Mousse | `#2c5a3a` | `#3a7d44` | `#5da671` | `#88c97a` |
| Pierre | `#4a5238` | `#7c8a5b` | `#a3b078` | `#c8d699` |
| Bois | `#4a2f1c` | `#7a4a2c` | `#a87044` | `#d4995c` |
| Ciel | `#5fa6c4` | `#7ec8e3` | `#a6dcec` | `#cfeaf5` |
| Or accent | `#a0741a` | `#d4a02a` | `#f1c757` | `#fcd757` |
| Rouge feu | `#7a2820` | `#c84030` | `#ff6a3a` | `#ff8c39` |
| UI text | `#1a2618` | `#3c5a40` | `#dceadb` | `#ffffff` |
| Transp. | (alpha 0) | — | — | — |

### 2.2 Twin Spires (crépuscule hivernal)

| Famille | shadow | mid | light | spec |
|---|---|---|---|---|
| Pierre froide | `#1a2840` | `#243a5e` | `#345978` | `#5a82a5` |
| Neige | `#7a98b4` | `#a5bcd0` | `#cfdfee` | `#e8f1ff` |
| Bannière | `#5a181a` | `#a02828` | `#d04040` | `#ec6a5a` |
| Or chaud | `#8a5818` | `#c4862a` | `#f7c84a` | `#ffe07a` |
| Ciel nuit | `#1c1830` | `#2c2748` | `#4a3a6a` | `#7858a0` |
| Bois | `#2a1f14` | `#5a3e22` | `#8a5e34` | `#b08050` |
| UI text | `#0c0e18` | `#3a4866` | `#dce6f4` | `#ffffff` |
| Transp. | (alpha 0) | — | — | — |

### 2.3 Old Temple (sous-sol doré)

| Famille | shadow | mid | light | spec |
|---|---|---|---|---|
| Pierre pourpre | `#170818` | `#3b1d3a` | `#5b2e54` | `#7a4274` |
| Or rune | `#6a4818` | `#a07a22` | `#c89c3a` | `#f1c757` |
| Ténèbres | `#000000` | `#0a0612` | `#181024` | `#241a36` |
| Torche orange | `#7a2410` | `#c84818` | `#ff7a2a` | `#ffaa48` |
| Cyan magie | `#1a5e54` | `#28a292` | `#56e1c8` | `#9af2da` |
| Bronze | `#3a2418` | `#664028` | `#a06038` | `#d08a52` |
| UI text | `#0a0410` | `#3a2840` | `#e0d0e8` | `#ffffff` |
| Transp. | (alpha 0) | — | — | — |

## 3. Tile painters — règles communes

Tout tile suit le pipeline :

1. **Couche 0** : remplissage massif en `mid`.
2. **Couche 1** : déformation organique aux bords (mousse, neige, érosion) — déterministe via un PRNG seedé sur `(tx, ty, theme)` pour que les variantes restent figées entre rebuilds.
3. **Couche 2** : ombrage — `shadow` à droite + bas, `light` à gauche + haut (lumière virtuelle top-left).
4. **Couche 3** : détails distinctifs (rune, fissure, glyph) — appliqués à 1 tile sur 4 en moyenne pour éviter le pattern visible.
5. **Couche 4** : highlight `spec` 1-2 px isolé (capter l'œil).

Les **JUMPTHRU** se distinguent par :

- Sacred : poutre bois épaisse + ferrures dorées.
- Spires : barre marbre bleu + cristal au centre.
- Temple : barre bronze + glyph rune cyan.

Les **SPIKES** sont 4 pointes irrégulières + base teintée theme (mousse / glace / bronze).

## 4. Archers — silhouettes signatures

| # | Nom | Silhouette | Corps | Cape/accent | Eye/specular |
|---|---|---|---|---|---|
| 1 | **Verdant** | cape longue + capuche feuille | `#3a7d44` | `#5da671` cape, `#a0741a` ceinture | `#fcd757` œil |
| 2 | **Crimson** | armure + plumet vertical | `#a02828` | `#d04040` plastron, `#fcd757` plumet | `#ffe07a` œil |
| 3 | **Azure** | manteau pointu + capuchon | `#243a5e` | `#5a82a5` manteau, `#56e1c8` cristal | `#9af2da` œil |
| 4 | **Saffron** | écharpe ample + chapeau plat | `#c4862a` | `#7a4a2c` chapeau, `#5da671` écharpe | `#ffffff` œil |
| 5 | **Onyx** | encapuchonné totalement, masque pâle | `#181024` | `#3a2840` cape, `#dce6f4` masque | `#ec6a5a` œil rouge |
| 6 | **Frost** | armure légère + diadème cristal | `#a5bcd0` | `#e8f1ff` highlights, `#56e1c8` diadème | `#cfdfee` œil |

Chaque archer existe en 6 palettes locked — les autres champs (silhouette, animation timing) sont identiques.

## 5. Animations — timings

| Anim | Frames | Frame duration (60 fps) | Notes |
|---|---|---|---|
| idle | 4 | 12 frames each (5 fps) | breathe + cape sway |
| walk | 6 | 5 frames each (12 fps) | leg cycle, cape trails |
| jump-up | 1 | held while `vel.y < 0` | knees up |
| fall-down | 1 | held while `vel.y > 0` | knees out |
| dodge | 4 | 2 frames each (30 fps) | streak motion blur lines |
| aim | 8 | static (1 per direction) | bow rotates around body |
| shoot | 3 | 2/3/3 frames | recoil + bow flex |
| death | 4 | 6 frames each + fade | shatter pixel scatter |

Les animations sont **purement cosmétiques** — un compteur `renderFrame` interne au renderer choisit la frame selon `world.tick` mais ne touche jamais l'engine state.

## 6. Backgrounds — parallax 2 layers

| Theme | Back layer (parallax 0.4) | Mid layer (parallax 0.7) |
|---|---|---|
| Sacred Grove | dégradé ciel + nuages cumulus | rangée d'arbres flous |
| Twin Spires | dégradé nuit violette + lune | montagnes neigeuses + flocons drifting |
| Old Temple | ténèbres + sigils brumeux | colonnes + idole géante en silhouette |

Les layers ne se synchronisent pas avec le world wrap : ils défilent légèrement avec un offset basé sur le tick (vent / drift cosmique). Pas de coût gameplay.

## 7. Coffres + flèches + shield — sprites

- **Chest closed** : caisse bois bardée de fer, padlock (5×4 px) au centre du couvercle, hinge top.
- **Chest opening** (6 frames sur 30 ticks) : padlock pop, couvercle bascule, halo doré bref dernière frame.
- **Arrow normal** : empennage 2 px + tige 5 px + pointe 1 px, couleurs theme-agnostic (ivoire / brun / acier).
- **Arrow bomb** : tête bombe noire avec mèche allumée animée 4 frames.
- **Arrow drill** : pointe orange tournante (4 frames de rotation).
- **Arrow laser** : barre énergie pleine + halo cyan/blanc (déjà partiellement Phase 9b — on garde + ajoute glow).
- **Shield** : ring blanc-cyan déjà Phase 9b — on ajoute 4 sigils orbitaux qui tournent (4 frames sur 30).

## 8. Toggle dev `VITE_NO_SPRITES=1`

Quand cette variable d'env Vite vaut `"1"` au build, le client retombe sur les **rectangles colorés Phase 4** (TilemapRenderer/ArchersRenderer/ArrowsRenderer/ChestsRenderer en mode legacy). Pratique pour itérer sur la physique sans le coût visuel.

## 9. Performance budget

- Boot generation : ≤ 200 ms (mesuré au cold start, hors low-end). 6 archers × ~40 frames + 3 tilesheets × ~8 tiles + 3 backgrounds = ~280 canvas paints.
- Steady-state render : zéro régression vs Phase 9b (Sprite remplace Graphics — Pixi est plus rapide en Sprite qu'en clear/redraw Graphics).
- Bundle size delta : ≤ +50 KB minified (uniquement code generator).

## 10. Critères d'acceptation visuels (révisables par Saad)

1. Une partie sur Sacred Grove "ressemble" à TowerFall Sacred Forest sans plagier.
2. Les 6 archers sont distinguables d'un coup d'œil à 4 joueurs simultanés.
3. Les flèches restent lisibles en mouvement rapide (vol + impact).
4. Aucune régression gameplay vs Phase 9b.
