# Quiztime Live

The online counterpart to the in-person quiz: players join from their own
devices with a room code, and a host runs the show from a presenter screen.

- **Slido-style core:** the host paces the show; players answer on their
  own devices; results and a leaderboard follow. Polls show live results on
  the host screen. Audience Q&A with upvotes runs alongside.
- **Question types:** multiple choice / true-false, closest number wins,
  polls, and longform written answers judged by **Jev** and confirmed by the
  host.
- **Scoring:** accuracy-only by default, with speed scoring as an option
  (see below) and **lightning rounds** for quick-fire, speed-scored blocks.
- **3D minigames** between questions (Mario Party style, three.js), see
  `src/live/minigames/README.md`.
- **Teams** (score = average per member).
- **Ceramic Duck Hours:** players can link their duck entry when joining;
  bonus rules are a stub in `shared/duckBonus.ts`.

## Accessibility

At least one player can only use one hand, so:

- Speed is only ever scored on multiple choice, where every answer is one
  keypress, so it measures knowing the answer rather than typing speed.
- Every player action is a single key from any of three clusters
  (WASD+Space, arrows+Enter, numpad 8/4/6/2+0) or a tap. No chords, no holds,
  no mashing. Choice answers are one keypress (direction or 1–4).
- Written answers have **no timer and no speed bonus**, the judge is told to
  ignore spelling/typos/length, and players can keep editing until the host
  closes the question. Enter submits.

## Scoring and lightning rounds

Multiple-choice questions use one of two `ScoringMode`s:

- `accuracy` (default): a correct answer earns its `points`, however long it
  took.
- `speed`: a correct answer also earns a bonus, from the full bonus for an
  instant answer down to 0 at the time limit.

The host picks the default on the setup screen; a question can override it
with `"scoring": "speed" | "accuracy"` (and `"speedBonus"` for its max).

A **lightning round** is one block in the show file that expands into
back-to-back speed-scored questions:

```json
{
  "kind": "lightning", "id": "zap", "title": "Lightning round",
  "timeLimitSec": 10, "points": 50, "speedBonus": 50, "revealSec": 3,
  "questions": [
    { "id": "z1", "prompt": "A male duck is called a…",
      "options": [{ "id": "a", "text": "Drake" }, { "id": "b", "text": "Cob" }],
      "correctId": "a" }
  ]
}
```

It runs itself: a 3-second "get ready" countdown (speed is timed from when
answers open, so nobody's bonus depends on noticing the round began), then
each question closes on its timer or once everyone has answered, the answer
shows for `revealSec`, and the next opens. The last question shows round
totals and hands control back to the host. The host can skip ahead at any
point, or pause by showing the leaderboard.

## Answer arena

Any multiple-choice question or poll can set `"arena": true` to be played by
walking instead of tapping. Everyone's duck starts in a huddle in the middle;
each answer owns a wedge around it, pointing the same way as the answer pad
(up = 1 with four options). The middle grows with the crowd (about 7 units
across the radius for 30 players, 6 for 12), always at least two duck lengths
from the huddle to any answer. Where your duck
stands when time runs out is your answer (speed scoring counts from when you
arrived).

- Hold a direction to walk, or tap it for one waddle step (arrows, WASD,
  numpad or the on-screen pad); press 1–N to walk straight to an answer,
  Space to quack. Each fresh tap gives a very slight boost and a skip, rationed
  so tapping flat out is only ~7% faster than holding. Held directions are a
  lease the client renews every 0.4 s, so a dropped connection lets go.
- On phones and tablets the arena gets taller and the controls sit over its
  bottom corners like a handheld console: arrows on one side, numbered
  answer buttons and Quack on the other (either set alone is enough; ⇄
  swaps sides). Answer cards stay above them.
- When time runs out every duck stops dead where it stands (`freezeArena`):
  no more steps, holds, knock-back or gliding, and moves are ignored.
- Ducks steer round each other, bump (a little knock-back, a flap and a
  startled quack, feathers fly), and a standing duck mostly holds its ground.
- Every duck is heard from where yours stands: quacks, bumps and take-offs
  are real mallard recordings (`public/sounds`, CC BY-SA, credited there),
  picked at random, quieter with distance and panned to their side, so a
  crowd is a cacophony. Capped at 14 voices; the presenter screen is silent.
- Get bumped by 3 different ducks within 2.25 seconds and you're launched,
  flapping, over the crowd (a crush of 30 sends a handful flying; two ducks
  bumping each other never can).
- The Worker runs the simulation (`shared/arenaSim.ts`) at 10 Hz and streams
  positions; clients smooth between snapshots. Players' cameras follow their
  own duck, with each answer pinned to the screen edge in its direction; the
  host screen shows the whole arena with live counts.

### Players and PINs

There are no sign-ups. To join, players pick themselves from the Ceramic Duck
Hours leaderboard (claiming that entry) or tap "I'm new here", then set a
four-digit PIN. The device remembers them, so next time it's one tap; on a new
device they type the PIN. Accounts live in the `Accounts` Durable Object
(`worker/src/accounts.ts`): PINs and device tokens are stored salted and
hashed, and 5 wrong PINs in a row lock the account for 15 minutes. The host
resets a forgotten PIN from "Forgotten PINs" under the room setup form (needs
the host password); the next PIN that player types becomes their new one.

In the lobby players dress their duck: a hat and a neckpiece
(`shared/outfit.ts`), saved on their account for every game. Breed and
accessory colour still come from join order, so ducks stay easy to tell apart.
Whoever leads the Duck Hours wears the crown in the hat's place, so they only
pick a neckpiece.

### Practice arena

`#/live/arena` is one shared practice arena (the `Demo` Durable Object,
`worker/src/demo.ts`, at `/api/demo/ws`): anyone who opens the page gets a
duck, no code or name needed. Questions (`shared/demo.ts`) loop by
themselves: 20 s to walk, time's up, 7 s reveal, next. Computer ducks
(`shared/arenaBots.ts`) top the crowd up to 12 at the start of each round. At
most 40 people; it only runs while someone's connected. If the server can't
be reached the page practises offline in the browser with the same rules.
Players type a name for their duck when they arrive (or take a random duck
name); a duplicate gets a number.

How it's doing: `GET /api/demo/stats` (people now, peak, joins, clean leaves
vs. dropped connections, rounds, the last few errors) since it last started.
Each notable event is also one JSON log line (`wrangler tail`, or Workers →
quiztime-live → Logs in the dashboard), though practice-arena lines only
arrive once its connections close.

## Layout

| Path | What |
| - | - |
| `shared/protocol.ts` | Data model and wire protocol used by both sides |
| `shared/scoring.ts` | Speed bonus, placement points, team averages |
| `shared/duckBonus.ts` | **Stub:** Duck Hours bonus rules |
| `shared/flock.ts` | Duck movement: steps, steering, collisions, bumps, neck bending |
| `shared/arena.ts`, `shared/arenaSim.ts` | Answer arena layout and simulation |
| `shared/demo.ts`, `shared/arenaBots.ts` | Practice arena questions and computer ducks |
| `worker/src/engine.ts` | Game rules as a pure state machine (unit tested) |
| `worker/src/room.ts` | Durable Object: sockets, storage, deadlines, Jev calls |
| `worker/src/demo.ts` | Durable Object: the shared practice arena |
| `worker/src/accounts.ts` | Durable Object: player accounts, PINs, saved outfits |
| `worker/src/jev.ts` | Jev judging (composite rubric scoring) |
| `src/live/` | Host console/presenter screen and player app |

Routes: `#/live` (enter code), `#/live/join/ABCD`, `#/live/host`,
`#/live/arena` (shared practice). They sit
outside the "coming soon" gate, like `#/duck`.

## Jev

Jev is [TypeSafe's](https://docs.typesafe.ai/) "System One" model: you send a
`state` and typed questions (Choice / Score / Noul) and get calibrated
probabilities back rather than generated text. Each written answer becomes one
request with `state = { question, answer, reference_answer? }` and:

- `quality`: Score 0–4 on how well it answers
- `criterion_N`: one yes/no Noul per rubric line
- `reference`: Noul, consistent with the model answer (if given)
- `manipulation`: Noul, is the answer trying to steer the grader

`jev.ts` combines these with weights 1 : 1 : 0.5 into suggested points, and
flags borderline criteria, low confidence, and manipulation attempts. The host
reviews before anything is awarded. If Jev errors (or no key is set), answers
fall back to hand scoring.

The model is pinned to `jev-1.13.0` in `wrangler.jsonc`; bump it deliberately.
If your key came from OpenRouter rather than TypeSafe, change `JEV_API_URL`
accordingly.

## Local development

```sh
cat > worker/.dev.vars <<'EOF'
HOST_PASSWORD=pick-something
JEV_API_KEY=your-typesafe-key   # optional; omit to hand-score
EOF
npm run worker:dev   # http://localhost:8787
npm run dev          # http://localhost:5173/quiztime/#/live/host
npm test
```

## Deploying

1. `npx wrangler login`
2. `npx wrangler secret put HOST_PASSWORD -c worker/wrangler.jsonc`
3. `npx wrangler secret put JEV_API_KEY -c worker/wrangler.jsonc`
4. `npm run worker:deploy`, then note the `https://quiztime-live.<you>.workers.dev` URL.
5. In GitHub repo **Settings → Secrets and variables → Actions → Variables**,
   add `LIVE_API_URL` = that URL. The Pages build passes it to the app.
6. If the site moves off `caariiboouu.github.io`, update `ALLOWED_ORIGINS`.

Rooms live in a Durable Object and are deleted 24 hours after creation.
Because a deploy can land mid-game, stored rooms carry a `schema` number;
when `RoomState` changes shape, bump `ROOM_SCHEMA` in `engine.ts` and teach
`loadRoom` to upgrade the old shape.

## Writing a show

A show is JSON matching `Show` in `shared/protocol.ts`. See
`src/data/liveSampleShow.json`. **Don't commit real shows**: the site bundle
is public, answers included. Keep them locally and load the file on the host
setup screen; the Worker validates it and never sends answers, rubrics or
model answers to players before the reveal.
