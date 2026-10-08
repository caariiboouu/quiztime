/**
 * Player accounts: one Durable Object ("accounts") holding everyone.
 *
 * No sign-ups or emails. A player picks themselves from the Ceramic Duck
 * Hours leaderboard (claiming that entry) or adds themselves as someone new,
 * and sets a four-digit PIN. Devices then stay signed in with a random token;
 * on a new device they type the PIN. The account remembers their outfit.
 *
 * A four-digit PIN is only as strong as the guessing limit, so that's what
 * protects it: PIN_TRIES wrong in a row locks the account for
 * PIN_LOCK_MINUTES. PINs and tokens are stored salted/hashed (SHA-256; a
 * slow hash buys nothing for 10,000 possibilities and Workers have little
 * CPU to spare). A forgotten PIN is reset by the host.
 */
import { DurableObject } from "cloudflare:workers";
import { cleanOutfit, type DuckOutfit } from "../../shared/outfit";
import {
  MAX_NAME_LENGTH,
  PIN_LOCK_MINUTES,
  PIN_RE,
  PIN_TRIES,
  type Account,
  type AccountSession,
  type CreateAccountRequest,
} from "../../shared/protocol";
import type { Env } from "./index";
import { randomToken } from "./secrets";

/** Signed-in devices are remembered this long. */
const SESSION_DAYS = 365;

export type AccountResult<T> = T | { error: string; status: number };

type Row = {
  id: string;
  name: string;
  holder_id: string | null;
  pin_salt: string | null;
  pin_hash: string | null;
  outfit: string | null;
  failures: number;
  locked_until: number;
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function cleanAccountName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) : "";
}

function parseOutfit(raw: string | null): DuckOutfit | null {
  try {
    return raw ? cleanOutfit(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function toAccount(r: Row): Account {
  const outfit = parseOutfit(r.outfit);
  return { id: r.id, name: r.name, holderId: r.holder_id, outfit, needsPin: !r.pin_hash };
}

export class Accounts extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        holder_id TEXT UNIQUE,
        pin_salt TEXT,
        pin_hash TEXT,
        outfit TEXT,
        created_at INTEGER NOT NULL,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  private row(id: string): Row | null {
    const rows = this.sql.exec<Row>("SELECT * FROM accounts WHERE id = ?", id).toArray();
    return rows[0] ?? null;
  }

  private async newSession(r: Row): Promise<AccountSession> {
    const token = randomToken();
    this.sql.exec(
      "INSERT INTO sessions (token_hash, account_id, created_at) VALUES (?, ?, ?)",
      await sha256(token),
      r.id,
      Date.now(),
    );
    return { account: toAccount(r), token };
  }

  private async setPin(id: string, pin: string) {
    const salt = randomToken(12);
    this.sql.exec(
      "UPDATE accounts SET pin_salt = ?, pin_hash = ?, failures = 0, locked_until = 0 WHERE id = ?",
      salt,
      await sha256(`${salt}:${pin}`),
      id,
    );
  }

  /** Everyone with an account (no secrets). */
  async list(): Promise<Account[]> {
    return this.sql
      .exec<Row>("SELECT * FROM accounts ORDER BY name_key")
      .toArray()
      .map(toAccount);
  }

  /** Claim a Duck Hours entry, or add someone new. */
  async create(req: CreateAccountRequest): Promise<AccountResult<AccountSession>> {
    const name = cleanAccountName(req?.name);
    if (!name) return { error: "Please enter a name", status: 400 };
    if (!PIN_RE.test(String(req?.pin ?? ""))) return { error: "Your PIN must be 4 digits", status: 400 };
    const holderId =
      typeof req.holderId === "string" && req.holderId.length > 0 && req.holderId.length <= 64
        ? req.holderId
        : null;
    if (holderId) {
      const taken = this.sql.exec("SELECT id FROM accounts WHERE holder_id = ?", holderId).toArray();
      if (taken.length) return { error: "That duck already has a PIN. Pick it and enter the PIN.", status: 409 };
    }
    const nameKey = name.toLowerCase();
    if (this.sql.exec("SELECT id FROM accounts WHERE name_key = ?", nameKey).toArray().length) {
      return { error: "Someone already has that name", status: 409 };
    }
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO accounts (id, name, name_key, holder_id, created_at) VALUES (?, ?, ?, ?, ?)",
      id,
      name,
      nameKey,
      holderId,
      Date.now(),
    );
    await this.setPin(id, req.pin);
    return this.newSession(this.row(id)!);
  }

  /** Sign in on a new device with the PIN. */
  async login(id: string, pin: string): Promise<AccountResult<AccountSession>> {
    const r = this.row(id);
    if (!r) return { error: "No such player", status: 404 };
    const now = Date.now();
    if (r.locked_until > now) {
      const mins = Math.ceil((r.locked_until - now) / 60_000);
      return { error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask the host to reset it.`, status: 429 };
    }
    if (!r.pin_hash || !r.pin_salt) {
      // Reset by the host: this PIN becomes the new one.
      if (!PIN_RE.test(String(pin ?? ""))) return { error: "Your PIN must be 4 digits", status: 400 };
      await this.setPin(id, pin);
      return this.newSession(this.row(id)!);
    }
    if (!PIN_RE.test(String(pin ?? "")) || (await sha256(`${r.pin_salt}:${pin}`)) !== r.pin_hash) {
      const failures = r.failures + 1;
      const locked = failures >= PIN_TRIES;
      this.sql.exec(
        "UPDATE accounts SET failures = ?, locked_until = ? WHERE id = ?",
        locked ? 0 : failures,
        locked ? now + PIN_LOCK_MINUTES * 60_000 : 0,
        id,
      );
      return locked
        ? { error: `Too many wrong PINs. Try again in ${PIN_LOCK_MINUTES} minutes, or ask the host to reset it.`, status: 429 }
        : { error: `Wrong PIN (${PIN_TRIES - failures} ${PIN_TRIES - failures === 1 ? "try" : "tries"} left)`, status: 401 };
    }
    this.sql.exec("UPDATE accounts SET failures = 0 WHERE id = ?", id);
    return this.newSession(r);
  }

  /** The account for a signed-in device, or null if the token's no good. */
  async verify(id: string, token: string): Promise<Account | null> {
    if (typeof id !== "string" || typeof token !== "string") return null;
    const hash = await sha256(token);
    const s = this.sql
      .exec<{ account_id: string; created_at: number }>(
        "SELECT account_id, created_at FROM sessions WHERE token_hash = ?",
        hash,
      )
      .toArray()[0];
    if (!s || s.account_id !== id) return null;
    if (Date.now() - s.created_at > SESSION_DAYS * 86_400_000) {
      this.sql.exec("DELETE FROM sessions WHERE token_hash = ?", hash);
      return null;
    }
    const r = this.row(id);
    return r ? toAccount(r) : null;
  }

  /** They've been added to the Duck Hours board: link the new entry. */
  async setHolder(id: string, holderId: string): Promise<void> {
    this.sql.exec("UPDATE accounts SET holder_id = ? WHERE id = ? AND holder_id IS NULL", holderId, id);
  }

  async setOutfit(id: string, outfit: DuckOutfit | null): Promise<void> {
    this.sql.exec("UPDATE accounts SET outfit = ? WHERE id = ?", outfit ? JSON.stringify(outfit) : null, id);
  }

  /** Forgotten PIN: sign out every device; the next PIN they type becomes the new one. */
  async resetPin(id: string): Promise<boolean> {
    if (!this.row(id)) return false;
    this.sql.exec(
      "UPDATE accounts SET pin_salt = NULL, pin_hash = NULL, failures = 0, locked_until = 0 WHERE id = ?",
      id,
    );
    this.sql.exec("DELETE FROM sessions WHERE account_id = ?", id);
    return true;
  }
}

/** The one object holding every account. */
export function accountsStub(env: Env) {
  return env.ACCOUNTS.get(env.ACCOUNTS.idFromName("accounts"));
}
