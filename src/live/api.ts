import type {
  Account,
  AccountList,
  AccountSession,
  CreateAccountRequest,
  CreateRoomRequest,
  SavedShow,
  Show,
  CreateRoomResponse,
  JoinRequest,
  JoinResponse,
  RoomInfo,
} from "../../shared/protocol";
import type { DuckHoursData } from "../types";
import type { DuckOutfit } from "../../shared/outfit";

/**
 * Where the live-quiz Worker lives. Set VITE_LIVE_API_URL at build time
 * (e.g. https://quiztime-live.<you>.workers.dev); in dev it defaults to
 * `wrangler dev`'s local address.
 */
export const API_BASE: string = (
  import.meta.env.VITE_LIVE_API_URL ??
  (import.meta.env.DEV ? "http://localhost:8787" : "")
).replace(/\/$/, "");

export const liveConfigured = API_BASE !== "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "Can't reach the live quiz server");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const createRoom = (req: CreateRoomRequest) =>
  call<CreateRoomResponse>("/api/rooms", { method: "POST", body: JSON.stringify(req) });

export const getRoomInfo = (code: string) =>
  call<RoomInfo>(`/api/rooms/${encodeURIComponent(code)}`);

export const joinRoom = (code: string, req: JoinRequest) =>
  call<JoinResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify(req),
  });

/** The saved question set, answers and all (host password needed). */
export const loadSavedShow = (password: string) =>
  call<SavedShow>("/api/show/load", { method: "POST", body: JSON.stringify({ password }) });

/** Replace the saved question set: every new game starts with it. */
export const saveSavedShow = (password: string, show: Show) =>
  call<SavedShow>("/api/show/save", { method: "POST", body: JSON.stringify({ password, show }) });

/** Replace the Ceramic Duck Hours standings (host password needed). */
export const saveDuckStandings = (password: string, data: DuckHoursData) =>
  call<{ data: DuckHoursData; updatedAt: number }>("/api/duck-hours/save", {
    method: "POST",
    body: JSON.stringify({ password, data }),
  });

/** Put back the Duck Hours standings from before the last change. */
export const undoDuckStandings = (password: string) =>
  call<{ data: DuckHoursData; updatedAt: number }>("/api/duck-hours/undo", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

export const listAccounts = () => call<AccountList>("/api/accounts");

export const createAccount = (req: CreateAccountRequest) =>
  call<AccountSession>("/api/accounts", { method: "POST", body: JSON.stringify(req) });

export const loginAccount = (id: string, pin: string) =>
  call<AccountSession>(`/api/accounts/${encodeURIComponent(id)}/login`, {
    method: "POST",
    body: JSON.stringify({ pin }),
  });

/** Dress your duck outside a game (this device must be signed in as them). */
export const setAccountOutfit = (id: string, token: string, outfit: DuckOutfit) =>
  call<Account>(`/api/accounts/${encodeURIComponent(id)}/outfit`, {
    method: "POST",
    body: JSON.stringify({ token, outfit }),
  });

/** Change your PIN by typing the current one. */
export const changeAccountPin = (id: string, pin: string, newPin: string) =>
  call<AccountSession>(`/api/accounts/${encodeURIComponent(id)}/pin`, {
    method: "POST",
    body: JSON.stringify({ pin, newPin }),
  });

export const resetAccountPin = (id: string, password: string) =>
  call<{ ok: true }>(`/api/accounts/${encodeURIComponent(id)}/reset`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });

export function socketUrl(code: string, cred: { host: string } | { token: string }): string {
  const base = API_BASE.replace(/^http/, "ws");
  const q = "host" in cred ? `host=${encodeURIComponent(cred.host)}` : `token=${encodeURIComponent(cred.token)}`;
  return `${base}/api/rooms/${encodeURIComponent(code)}/ws?${q}`;
}

export function joinLink(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/live/join/${code}`;
}

// Credentials survive a refresh so nobody loses their seat.
const HOST_KEY = "quiztime.live.host";
const playerKey = (code: string) => `quiztime.live.player.${code}`;

export type HostCreds = { code: string; hostKey: string };
export type PlayerCreds = { code: string; playerId: string; token: string };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode etc.: the session still works, it just won't survive a refresh.
  }
}

export const loadHostCreds = () => read<HostCreds>(HOST_KEY);
export const saveHostCreds = (c: HostCreds | null) => write(HOST_KEY, c);
export const loadPlayerCreds = (code: string) => read<PlayerCreds>(playerKey(code));
export const savePlayerCreds = (code: string, c: PlayerCreds | null) => write(playerKey(code), c);

// Signed-in accounts on this device (a shared family tablet can hold a few),
// and who used it last, so they're one tap away next time.
const SESSIONS_KEY = "quiztime.live.accounts";
const LAST_KEY = "quiztime.live.lastAccount";
type SavedSessions = Record<string, { token: string; account: Account }>;

export const loadSessions = () => read<SavedSessions>(SESSIONS_KEY) ?? {};
export function saveSession(s: AccountSession) {
  write(SESSIONS_KEY, { ...loadSessions(), [s.account.id]: { token: s.token, account: s.account } });
  write(LAST_KEY, s.account.id);
}
export function forgetSession(accountId: string) {
  const all = loadSessions();
  delete all[accountId];
  write(SESSIONS_KEY, all);
}
export const lastAccountId = () => read<string>(LAST_KEY);
