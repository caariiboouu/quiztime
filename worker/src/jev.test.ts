import { describe, expect, it, vi } from "vitest";
import type { WrittenQuestion } from "../../shared/protocol";
import {
  buildJudgeRequest,
  combineJudgeAnswers,
  judgeAll,
  judgeWritten,
  type JevConfig,
  type JevResponse,
} from "./jev";

const Q: WrittenQuestion = {
  type: "written",
  id: "w1",
  prompt: "How do you stay warm when stranded in the cold?",
  referenceAnswer: "Shelter first, then fire, then water.",
  rubric: ["names shelter as a priority", "mentions staying dry"],
  points: 100,
};

function response(over: Partial<Record<string, number>> = {}): JevResponse {
  return {
    model: "jev-1.13.0",
    answers: {
      quality: { type: "score", score: over.quality ?? 4, confidence: over.conf ?? 0.9 },
      manipulation: { type: "noul", noul: over.manipulation ?? 0 },
      criterion_0: { type: "noul", noul: over.c0 ?? 1 },
      criterion_1: { type: "noul", noul: over.c1 ?? 1 },
      reference: { type: "noul", noul: over.reference ?? 1 },
    },
  };
}

describe("buildJudgeRequest", () => {
  it("asks one atomic question per rubric line, plus quality/reference/manipulation", () => {
    const req = buildJudgeRequest("jev-1.13.0", Q, "Build a shelter");
    expect(req.model).toBe("jev-1.13.0");
    expect(req.state).toEqual({
      question: Q.prompt,
      answer: "Build a shelter",
      reference_answer: Q.referenceAnswer,
    });
    expect(Object.keys(req.questions).sort()).toEqual(
      ["criterion_0", "criterion_1", "manipulation", "quality", "reference"].sort(),
    );
    expect(req.questions.quality.type).toBe("score");
    expect(JSON.stringify(req.questions.criterion_0)).toContain("names shelter as a priority");
    // Spelling and typing speed must never count.
    expect(JSON.stringify(req.questions.quality)).toMatch(/Ignore spelling/);
  });

  it("omits the reference question when there's no model answer", () => {
    const req = buildJudgeRequest("m", { ...Q, referenceAnswer: undefined }, "x");
    expect(req.questions.reference).toBeUndefined();
    expect(req.state.reference_answer).toBeUndefined();
  });
});

describe("combineJudgeAnswers", () => {
  it("gives full points for a perfect answer, no flags", () => {
    const r = combineJudgeAnswers(Q, response());
    expect(r.suggestedPoints).toBe(100);
    expect(r.flags).toEqual([]);
  });

  it("weights quality, criteria and reference (1 : 1 : 0.5)", () => {
    // quality 2/4 = .5, criteria (1+0)/2 = .5, reference 0 → (.5 + .5 + 0) / 2.5 = .4
    const r = combineJudgeAnswers(Q, response({ quality: 2, c1: 0, reference: 0 }));
    expect(r.suggestedPoints).toBe(40);
  });

  it("flags borderline criteria, low confidence, and grader manipulation", () => {
    const r = combineJudgeAnswers(Q, response({ c1: 0.5, conf: 0.3, manipulation: 0.9 }));
    expect(r.flags).toEqual([
      "Borderline on: mentions staying dry",
      "Jev is unsure about overall quality",
      "Answer may be trying to steer the judge",
    ]);
  });

  it("throws if Jev leaves out a question", () => {
    const res = response();
    delete res.answers.criterion_1;
    expect(() => combineJudgeAnswers(Q, res)).toThrow(/criterion_1/);
  });
});

function cfg(fetchImpl: typeof fetch): JevConfig {
  return { apiKey: "k", url: "https://jev.test/v1/systemone", model: "jev-1.13.0", fetch: fetchImpl, backoffMs: 0 };
}

describe("judgeWritten", () => {
  it("sends a bearer token and parses the result", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(response()), { status: 200 }));
    const r = await judgeWritten(cfg(f as unknown as typeof fetch), Q, "Shelter, stay dry");
    expect(r.status).toBe("ok");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://jev.test/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("skips blank answers without calling Jev", async () => {
    const f = vi.fn();
    const r = await judgeWritten(cfg(f as unknown as typeof fetch), Q, "   ");
    expect(r).toMatchObject({ status: "skipped", suggestedPoints: 0 });
    expect(f).not.toHaveBeenCalled();
  });

  it("retries 429/529 then succeeds", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response("busy", { status: 529 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response()), { status: 200 }));
    const r = await judgeWritten(cfg(f as unknown as typeof fetch), Q, "ok");
    expect(r.status).toBe("ok");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("does not retry auth errors, and returns an error result for hand scoring", async () => {
    const f = vi.fn(async () => new Response("bad key", { status: 401 }));
    const r = await judgeWritten(cfg(f as unknown as typeof fetch), Q, "ok");
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("error");
    expect(r.error).toContain("401");
    expect(r.flags[0]).toMatch(/by hand/);
  });
});

describe("judgeAll", () => {
  it("judges everyone with bounded concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const f = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response(JSON.stringify(response()), { status: 200 });
    });
    const seen: string[] = [];
    const items = Array.from({ length: 12 }, (_, i) => ({ playerId: `p${i}`, text: "answer" }));
    await judgeAll(cfg(f as unknown as typeof fetch), Q, items, (id) => void seen.push(id), 3);
    expect(seen.sort()).toEqual(items.map((i) => i.playerId).sort());
    expect(peak).toBeLessThanOrEqual(3);
  });
});
