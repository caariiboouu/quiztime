/**
 * The Ceramic Duck Hours standings: one Durable Object ("standings") holding
 * the document the site used to keep in src/data/duckHours.json. Anyone can
 * read it; editing needs the host password (checked by the Worker), and a
 * live quiz's results flow in through the room that ran it.
 */
import { DurableObject } from "cloudflare:workers";
import type { DuckHoursData } from "../../src/types";
import { applyQuizStandings, type QuizStanding } from "../../shared/duckStandings";
import type { Env } from "./index";

type Stored = { data: DuckHoursData; updatedAt: number };

export class Standings extends DurableObject<Env> {
  /** The standings, or null if nobody has loaded them in yet. */
  async get(): Promise<Stored | null> {
    return (await this.ctx.storage.get<Stored>("standings")) ?? null;
  }

  async save(data: DuckHoursData, now: number): Promise<Stored> {
    // Keep what it replaced, so one mistake (a test game applied, a bad
    // edit) can be undone.
    const previous = await this.get();
    const stored = { data, updatedAt: now };
    await this.ctx.storage.put({ standings: stored, ...(previous ? { previous } : {}) });
    return stored;
  }

  /** Put back the standings from before the last change (once). */
  async undo(now: number): Promise<Stored | null> {
    const previous = await this.ctx.storage.get<Stored>("previous");
    if (!previous) return null;
    const stored = { data: previous.data, updatedAt: now };
    await this.ctx.storage.put("standings", stored);
    await this.ctx.storage.delete("previous");
    return stored;
  }

  async canUndo(): Promise<boolean> {
    return (await this.ctx.storage.get("previous")) !== undefined;
  }

  /**
   * A quiz just finished: its players take their new ranks (newcomers are
   * added), everyone else is benched, and the clock restarts. Returns the
   * Duck Hours entry for each standing (new or existing), in order.
   */
  async applyQuiz(standings: QuizStanding[], now: number): Promise<{ holderIds: string[] } | { error: string }> {
    const current = await this.get();
    if (!current) return { error: "The Duck Hours standings haven't been loaded onto the server yet." };
    const { data, createdIds } = applyQuizStandings(current.data, standings, now);
    await this.save(data, now);
    return { holderIds: standings.map((s, i) => createdIds[i] ?? s.holderId!) };
  }
}

export function standingsStub(env: Env) {
  return env.STANDINGS.get(env.STANDINGS.idFromName("standings"));
}
