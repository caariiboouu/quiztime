/**
 * The host's saved question set: one Durable Object ("library") holding the
 * show every new game starts with, until the host edits it. Reading it
 * (answers included) or saving it needs the host password; the Worker
 * checks that before calling in here.
 */
import { DurableObject } from "cloudflare:workers";
import type { SavedShow, Show } from "../../shared/protocol";
import type { Env } from "./index";

export class Library extends DurableObject<Env> {
  async load(): Promise<SavedShow> {
    const saved = await this.ctx.storage.get<{ show: Show; updatedAt: number }>("show");
    return saved ?? { show: null, updatedAt: null };
  }

  async save(show: Show, now: number): Promise<SavedShow> {
    const saved = { show, updatedAt: now };
    await this.ctx.storage.put("show", saved);
    return saved;
  }
}

export function libraryStub(env: Env) {
  return env.LIBRARY.get(env.LIBRARY.idFromName("library"));
}
