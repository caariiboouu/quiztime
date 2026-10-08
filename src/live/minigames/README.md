# Live minigames

Short Mario Party-style games played between questions, rendered in 3D with
[three.js](https://threejs.org/) via [React Three Fiber](https://r3f.docs.pmnd.rs/).
Every player gets the same seeded course; each game reports one number, and
the server awards placement points (1st gets the segment's full points, last
of _n_ still gets 1/_n_).

## Anatomy of a game

| File | Job |
| - | - |
| `logic/useMyGame.ts` | **All** rules and state: course from the seed, input via `useControls`, scoring via `onScore`/`onDone`. No rendering. |
| `MyGame3D.tsx` | The 3D scene (default export; lazy-loaded). Reads the hook, draws with `Stage3D` and the shared models. |
| `MyGame2D.tsx` | Flat fallback using the same hook: for devices without WebGL, a crashed scene, or players who tick "Simple 2D graphics". |

Because both views run the same hook, a game scores identically however it's
drawn. `MinigamePlayer` picks the view; `three/` holds shared pieces:

- `Stage3D`: canvas, lights, shadows, and a camera that keeps a given area in
  frame from phone-portrait to widescreen
- `models.tsx`: `Water`, `LilyPad`, `Ring` (the duck is the mascot, `../mascot/DuckModel`)
- `fallbackContext.ts`: WebGL detection, reduced-motion check

three.js (~250 kB gzipped) is code-split and lazy: it loads in the background
for the mascot or during a minigame's countdown, never blocking the quiz.

## Accessibility rules (non-negotiable)

At least one player can only use one hand, so every minigame must be fully
playable with one hand on the keyboard (or one finger on a phone):

1. **Inputs are `up` / `down` / `left` / `right` / `action` only**, via
   `useControls` from `../controls`. That covers WASD+Space, arrows+Enter and
   numpad 8/4/6/2+0 automatically, so left- and right-handed players are equal.
2. **Never require holding, chords or modifiers.** A tap must always work.
   Holding may be an optional convenience (the flock's "hold to keep
   walking", via `onHeld`), and key auto-repeat never counts as presses.
3. **No mashing.** Don't score how fast or how often someone can press. (The
   flock's tap boost is deliberately tiny: flat-out tapping beats holding by
   only ~7%.)
   Score accuracy, memory, judgement, or timing of a single press.
4. **Everything is tappable too**, with large DOM buttons outside the canvas
   (3D click targets are a bonus, not the only way).
5. **No text entry** inside a minigame.
6. **Determinism:** derive all randomness from `seededRandom(seed)` so the
   course is identical for everyone.

And for 3D specifically:

7. **The canvas is decoration.** Status, score and feedback live in DOM text
   (`aria-live`), and the canvas is `aria-hidden` with a `description`.
8. **Don't require depth perception.** Use a fixed, mostly top-down camera;
   anything the player must line up should be judged left/right or by
   direction, not distance from the camera.
9. **Respect reduced motion.** Decorative motion (waves, bobbing) stops when
   `prefersReducedMotion()` is true; only gameplay motion remains.
10. **Mutate three.js objects in `useFrame` via refs**, never during render
    (the React Compiler lint rules enforce this).

## Adding one

1. Write `logic/useMyGame.ts`, `MyGame3D.tsx` (default export) and
   `MyGame2D.tsx`, all taking `MinigameProps` (`seed`, `active`, `onScore`,
   `onDone`). Call `onScore` whenever the score changes; the latest value is
   submitted when time runs out or you call `onDone`.
2. Register it in `index.ts` (`Scene3D: lazy(load)`, `preload: load`,
   `Fallback`).
3. Add its id to `MinigameId` in `shared/protocol.ts` and to `MINIGAMES` in
   `worker/src/engine.ts`.

## Player ducks and the flock

Every player has their own duck (`../mascot/variants.ts`): a breed
(`breeds.ts`: Pekin, Mallard, Cayuga, Magpie, Muscovy…), accessory colour,
hat, neckpiece (9 kinds, plain, polka-dot or striped) and subtle proportions.
Whoever leads the Ceramic Duck Hours standings wears the gold crown
(`duckChampion.ts`). The server hands out a
`lookIndex` in join order (`PublicPlayer.lookIndex`), and
`lookForIndex(i)` turns it into a look. The colour + hat pair is unique for
the first 83 players, and indices are never reused after a kick. Pass the
look to `DuckModel` (`look`, plus `detail="crowd"` and `shadows={false}`
for big scenes).

`../flock/` is the base for minigames where each player steers a duck:

- `shared/flock.ts`: pure movement, shared with the Worker. Hold to walk,
  or one press = one waddle step (max two queued) with a very slight,
  rationed boost, wandering for AI
  ducks, avoidance steering, capsule-shaped bodies that can't overlap,
  bumps (knock-back, flap, honk), crowd launches (3 different bumpers in 2.25 s
  sends a duck flying over everyone) and necks that bend away from neighbours.
- `FlockScene.tsx`: all ducks in **one** canvas (browsers cap WebGL
  contexts), name tags, a ring under "you", and a `FlockControl` handle
  (`step`, `hold`, `emote`, `everyone`) for keyboard or network input.
- `#/live/flock`: stress test with 16–64 ducks and live fps / draw-call
  stats. 32 ducks run at ~57 fps on an Intel UHD 620 laptop GPU.
