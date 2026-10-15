import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DEBATE_LEVELS, type DebateQuestion, type WrittenQuestion } from "../../shared/protocol";
import {
  buildDebateRequest,
  buildJudgeRequest,
  combineDebateAnswers,
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

  it("reports the tokens of each call Jev answered, and only those", async () => {
    const calls: unknown[] = [];
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 529 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...response(), model: "jev-1.14.0", usage: { input_tokens: 296, output_tokens: 20 } }), {
          status: 200,
        }),
      );
    await judgeWritten({ ...cfg(f as unknown as typeof fetch), onUsage: (c) => calls.push(c) }, Q, "ok");
    expect(calls).toEqual([{ model: "jev-1.14.0", inputTokens: 296, outputTokens: 20 }]);
  });

  it("still counts a call whose response leaves out usage, as unknown", async () => {
    const calls: unknown[] = [];
    const noModel: Partial<JevResponse> = response();
    delete noModel.model;
    const f = vi.fn(async () => new Response(JSON.stringify(noModel), { status: 200 }));
    const r = await judgeWritten({ ...cfg(f as unknown as typeof fetch), onUsage: (c) => calls.push(c) }, Q, "ok");
    expect(r.status).toBe("ok");
    expect(calls).toEqual([{ model: "jev-1.13.0", inputTokens: null, outputTokens: null }]);
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

const D: DebateQuestion = {
  type: "debate",
  id: "d1",
  prompt: "Pineapple belongs on pizza",
  levels: [...DEFAULT_DEBATE_LEVELS],
  points: 100,
  sides: { for: "Yes", against: "No way" },
};

function debateResponse(strength: number, over: { conf?: number; onSide?: number; manipulation?: number } = {}): JevResponse {
  return {
    model: "jev-1.13.0",
    answers: {
      strength: { type: "score", score: strength, confidence: over.conf ?? 0.9 },
      on_side: { type: "noul", noul: over.onSide ?? 1 },
      manipulation: { type: "noul", noul: over.manipulation ?? 0 },
    },
  };
}

describe("buildDebateRequest", () => {
  it("judges the argument for its side, one rung per verdict, worst first", () => {
    const req = buildDebateRequest("jev-1.13.0", D, "against", "Fruit is for dessert");
    expect(req.state).toEqual({
      motion: D.prompt,
      side: "No way (arguing against the motion)",
      argument: "Fruit is for dessert",
    });
    expect(Object.keys(req.questions).sort()).toEqual(["manipulation", "on_side", "strength"]);
    const strength = req.questions.strength as { type: string; criteria: string[] };
    expect(strength.type).toBe("score");
    expect(strength.criteria).toHaveLength(5);
    // Judged on reasoning, not on agreeing with the side or spelling.
    expect(JSON.stringify(strength)).toMatch(/not whether you agree/);
    expect(JSON.stringify(strength)).toMatch(/Ignore spelling/);
  });

  it("uses the host's own verdict labels", () => {
    const q = { ...D, levels: ["Knockout", "Solid", "Weak"] };
    const strength = buildDebateRequest("m", q, "for", "x").questions.strength as { criteria: string[] };
    expect(strength.criteria).toEqual(["Weak", "Solid", "Knockout"]);
  });
});

describe("combineDebateAnswers", () => {
  it("maps Jev's strength onto the verdicts, best first", () => {
    expect(combineDebateAnswers(D, debateResponse(4))).toMatchObject({ level: 0, suggestedPoints: 100, flags: [] });
    expect(combineDebateAnswers(D, debateResponse(2.4))).toMatchObject({ level: 2, suggestedPoints: 50 });
    expect(combineDebateAnswers(D, debateResponse(0))).toMatchObject({ level: 4, suggestedPoints: 0 });
  });

  it("flags low confidence, arguing the other side, and talking to the judge", () => {
    const r = combineDebateAnswers(D, debateResponse(3, { conf: 0.2, onSide: 0.1, manipulation: 0.9 }));
    expect(r.flags).toHaveLength(3);
    expect(r.flags.join(" ")).toMatch(/other side/);
  });

  it("throws on a response without a strength score", () => {
    expect(() => combineDebateAnswers(D, { model: "m", answers: {} })).toThrow(/strength/);
  });
});

describe("judgeWritten on a debate", () => {
  it("sends the side and returns a verdict", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(debateResponse(3)), { status: 200 }));
    const r = await judgeWritten(cfg(f as unknown as typeof fetch), D, "Sweet and salty works", "for");
    expect(r).toMatchObject({ status: "ok", level: 1 });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.state.side).toBe("Yes (arguing for the motion)");
  });

  it("gives a blank argument the lowest verdict without calling Jev", async () => {
    const f = vi.fn();
    const r = await judgeWritten(cfg(f as unknown as typeof fetch), D, " ", "for");
    expect(r).toMatchObject({ status: "skipped", level: 4 });
    expect(f).not.toHaveBeenCalled();
  });
});
