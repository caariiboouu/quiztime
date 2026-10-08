/**
 * Quiztime Live — HTTP entry point. Routes:
 *
 *   POST /api/rooms              create a room (needs HOST_PASSWORD)
 *   GET  /api/rooms/:code        lobby info (title, teams)
 *   POST /api/rooms/:code/join   join as a player → { playerId, token }
 *   GET  /api/rooms/:code/ws     WebSocket (?host=<hostKey> or ?token=<token>)
 *   GET  /api/demo/ws            WebSocket: the public practice arena (no sign-up)
 *   GET  /api/demo/stats         how the practice arena is doing (counts, recent errors)
 *   GET  /api/accounts           everyone who has an account (names, no secrets)
 *   POST /api/accounts           claim a Duck Hours entry or add someone new (+ PIN)
 *   POST /api/accounts/:id/login sign in on this device with the PIN
 *   POST /api/accounts/:id/reset host resets a forgotten PIN (needs HOST_PASSWORD)
 *   POST /api/show/load          the saved question set, answers and all (needs HOST_PASSWORD)
 *   POST /api/show/save          replace the saved question set (needs HOST_PASSWORD)
 */
import type {
  CreateAccountRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRequest,
  LoadShowRequest,
  LoginRequest,
  ResetPinRequest,
  SaveShowRequest,
  Show,
} from "../../shared/protocol";
import { Accounts, accountsStub } from "./accounts";
import { Library, libraryStub } from "./library";
import { validateSettings, validateShow } from "./engine";
import { Demo } from "./demo";
import { Room } from "./room";
import { randomToken, timingSafeEqual } from "./secrets";

export { Accounts, Demo, Library, Room };

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  /** The one shared practice arena. */
  DEMO: DurableObjectNamespace<Demo>;
  /** Everyone's accounts (one object). */
  ACCOUNTS: DurableObjectNamespace<Accounts>;
  /** The host's saved question set (one object). */
  LIBRARY: DurableObjectNamespace<Library>;
  /** Secret: password the host types to create a room. */
  HOST_PASSWORD: string;
  /** Secret: TypeSafe API key for Jev. Without it, written answers are hand-scored. */
  JEV_API_KEY?: string;
  JEV_API_URL: string;
  JEV_MODEL: string;
  /** Comma-separated origins allowed to call the API. */
  ALLOWED_ORIGINS: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O
const CODE_RE = /^[A-Z]{4}$/;

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return allowed.includes(origin) ? origin : null;
}

function json(body: unknown, status: number, origin: string | null): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: origin ? 204 : 403,
        headers: origin
          ? {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Max-Age": "86400",
              Vary: "Origin",
            }
          : {},
      });
    }
    // Browsers always send Origin on cross-site and WebSocket requests;
    // refuse ones from sites we don't serve.
    if (request.headers.get("Origin") && !origin) {
      return json({ error: "Origin not allowed" }, 403, null);
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, judge: Boolean(env.JEV_API_KEY) }, 200, origin);
    }

    if (url.pathname === "/api/demo/ws") {
      return env.DEMO.get(env.DEMO.idFromName("demo")).fetch(request);
    }
    if (url.pathname === "/api/demo/stats" && request.method === "GET") {
      return json(await env.DEMO.get(env.DEMO.idFromName("demo")).getStats(), 200, origin);
    }

    if ((url.pathname === "/api/show/load" || url.pathname === "/api/show/save") && request.method === "POST") {
      const body = await readJson<LoadShowRequest & Partial<SaveShowRequest>>(request);
      if (!body) return json({ error: "Invalid JSON" }, 400, origin);
      if (!env.HOST_PASSWORD || !timingSafeEqual(String(body.password ?? ""), env.HOST_PASSWORD)) {
        return json({ error: "Wrong host password" }, 401, origin);
      }
      const library = libraryStub(env);
      if (url.pathname === "/api/show/load") return json(await library.load(), 200, origin);
      const problem = validateShow(body.show);
      if (problem) return json({ error: problem }, 400, origin);
      return json(await library.save(body.show as Show, Date.now()), 200, origin);
    }

    if (url.pathname.startsWith("/api/accounts")) {
      const accounts = accountsStub(env);
      if (url.pathname === "/api/accounts" && request.method === "GET") {
        return json({ accounts: await accounts.list() }, 200, origin);
      }
      if (url.pathname === "/api/accounts" && request.method === "POST") {
        const body = await readJson<CreateAccountRequest>(request);
        if (!body) return json({ error: "Invalid JSON" }, 400, origin);
        const res = await accounts.create(body);
        return "error" in res ? json({ error: res.error }, res.status, origin) : json(res, 201, origin);
      }
      const a = url.pathname.match(/^\/api\/accounts\/([0-9a-f-]{36})\/(login|reset)$/);
      if (a && request.method === "POST") {
        if (a[2] === "login") {
          const body = await readJson<LoginRequest>(request);
          if (!body) return json({ error: "Invalid JSON" }, 400, origin);
          const res = await accounts.login(a[1], String(body.pin ?? ""));
          return "error" in res ? json({ error: res.error }, res.status, origin) : json(res, 200, origin);
        }
        const body = await readJson<ResetPinRequest>(request);
        if (!body) return json({ error: "Invalid JSON" }, 400, origin);
        if (!env.HOST_PASSWORD || !timingSafeEqual(String(body.password ?? ""), env.HOST_PASSWORD)) {
          return json({ error: "Wrong host password" }, 401, origin);
        }
        return (await accounts.resetPin(a[1]))
          ? json({ ok: true }, 200, origin)
          : json({ error: "No such player" }, 404, origin);
      }
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const body = await readJson<CreateRoomRequest>(request);
      if (!body) return json({ error: "Invalid JSON" }, 400, origin);
      if (!env.HOST_PASSWORD || !timingSafeEqual(String(body.password ?? ""), env.HOST_PASSWORD)) {
        return json({ error: "Wrong host password" }, 401, origin);
      }
      const problem = validateShow(body.show) ?? validateSettings(body.settings);
      if (problem) return json({ error: problem }, 400, origin);

      const hostKey = randomToken();
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        if (await stub.init(code, hostKey, { ...body, password: "" })) {
          return json({ code, hostKey } satisfies CreateRoomResponse, 201, origin);
        }
      }
      return json({ error: "Couldn't find a free room code; try again" }, 503, origin);
    }

    const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})(\/join|\/ws)?$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: "Bad room code" }, 400, origin);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));

      if (!m[2] && request.method === "GET") {
        const info = await stub.info();
        return info ? json(info, 200, origin) : json({ error: "Room not found" }, 404, origin);
      }
      if (m[2] === "/join" && request.method === "POST") {
        const body = await readJson<JoinRequest>(request);
        if (!body) return json({ error: "Invalid JSON" }, 400, origin);
        const res = await stub.join(body);
        return "error" in res ? json(res, 400, origin) : json(res, 201, origin);
      }
      if (m[2] === "/ws") {
        return stub.fetch(request);
      }
    }

    return json({ error: "Not found" }, 404, origin);
  },
} satisfies ExportedHandler<Env>;
