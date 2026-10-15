/**
 * What Jev has cost across games: one Durable Object ("jev-ledger") holding
 * the all-time total and the last few games, so they outlive the rooms.
 * Rooms report into it after judging; only hosts see it, through their
 * room's WebSocket.
 */
import { DurableObject } from "cloudflare:workers";
import {
  EMPTY_LEDGER,
  ledgerSummary,
  recordGame,
  type JevGameSpend,
  type JevLedgerData,
  type JevLedgerSummary,
} from "../../shared/jevLedger";
import type { Env } from "./index";

export class JevLedger extends DurableObject<Env> {
  async summary(): Promise<JevLedgerSummary> {
    return ledgerSummary(await this.load());
  }

  /** A game's whole spend so far (not just the latest calls). */
  async record(game: JevGameSpend): Promise<JevLedgerSummary> {
    const ledger = recordGame(await this.load(), game);
    await this.ctx.storage.put("ledger", ledger);
    return ledgerSummary(ledger);
  }

  private async load(): Promise<JevLedgerData> {
    return (await this.ctx.storage.get<JevLedgerData>("ledger")) ?? EMPTY_LEDGER;
  }
}

export function jevLedgerStub(env: Env) {
  return env.JEV_LEDGER.get(env.JEV_LEDGER.idFromName("jev-ledger"));
}
