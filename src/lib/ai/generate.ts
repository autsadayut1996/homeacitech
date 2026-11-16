import Anthropic from "@anthropic-ai/sdk";
import { type Issue, type Plan, type Site, type ValidationResult, issuesForPrompt, validatePlan } from "@/lib/plan-core";
import { AI_OPTION_JSON_SCHEMA, AiOptionSchema, compileOption, type AiOption } from "./format";
import { SYSTEM_PROMPT } from "./prompt";

export const MODEL = "claude-opus-5-5";
export const MAX_ATTEMPTS = 4;

export type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

export interface ModelReply {
  /** Content blocks exactly as returned — appended unchanged on retries (keeps thinking blocks valid). */
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  text: string;
  stopReason: string | null;
  model: string;
  usage: { input: number; output: number; cacheRead: number };
}

/** Injected so the loop can be unit-tested without the network. */
export type CallModel = (messages: MessageParam[]) => Promise<ModelReply>;

export class AiError extends Error {
  constructor(
    message: string,
    public readonly code: "refusal" | "max_tokens" | "no_output" | "api",
  ) {
    super(message);
  }
}

export interface AttemptLog {
  attempt: number;
  parseError?: string;
  errors: Issue[];
  warnings: Issue[];
  usage: ModelReply["usage"];
}

export interface DesignResult {
  option: AiOption;
  plan: Plan;
  validation: ValidationResult;
  attempts: AttemptLog[];
  messages: MessageParam[];
  model: string;
}

/**
 * Ask the model for a design, compile it to Plan JSON, validate, and feed problems back
 * until the plan passes or MAX_ATTEMPTS is reached. The best attempt (fewest errors) is
 * returned even if it still has errors, so the salesperson can fix the rest in the editor.
 */
export async function runDesignLoop(opts: {
  call: CallModel;
  userPrompt: string;
  site: Site;
  specPackage?: Plan["specPackage"];
  origin?: [number, number];
  maxAttempts?: number;
}): Promise<DesignResult> {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const messages: MessageParam[] = [{ role: "user", content: opts.userPrompt }];
  const attempts: AttemptLog[] = [];
  let best: Omit<DesignResult, "attempts" | "messages"> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await opts.call(messages);
    messages.push({ role: "assistant", content: reply.content });

    let option: AiOption;
    try {
      option = AiOptionSchema.parse(JSON.parse(reply.text));
    } catch (e) {
      const parseError = e instanceof Error ? e.message.slice(0, 500) : String(e);
      attempts.push({ attempt, parseError, errors: [], warnings: [], usage: reply.usage });
      messages.push({ role: "user", content: `Your reply was not valid JSON for the schema (${parseError}). Return the complete design again as JSON only.` });
      continue;
    }

    const { plan, issues: compileIssues } = compileOption(option, opts.site, { specPackage: opts.specPackage, origin: opts.origin });
    const v = validatePlan(plan);
    const errors = [...compileIssues.filter((i) => i.severity === "error"), ...v.errors];
    const warnings = [...compileIssues.filter((i) => i.severity === "warning"), ...v.warnings];
    const validation: ValidationResult = { ok: errors.length === 0, errors, warnings };
    attempts.push({ attempt, errors, warnings, usage: reply.usage });

    if (!best || errors.length < best.validation.errors.length) best = { option, plan, validation, model: reply.model };
    if (validation.ok) break;

    if (attempt < maxAttempts) {
      messages.push({
        role: "user",
        content: `The design has problems. Errors (must fix):
${issuesForPrompt(errors)}
${warnings.length ? `\nWarnings (fix if you can without breaking anything else):\n${issuesForPrompt(warnings)}\n` : ""}
Return the complete corrected design.`,
      });
    }
  }

  if (!best) throw new AiError("The model did not return a usable design.", "no_output");
  return { ...best, attempts, messages };
}

/** Real model call: streaming (long outputs), structured JSON output, server-side refusal fallback. */
export function anthropicCaller(client = new Anthropic()): CallModel {
  return async (messages) => {
    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        system: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: { type: "json_schema", schema: AI_OPTION_JSON_SCHEMA } },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      });
      message = await stream.finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new AiError(`Claude API error ${e.status ?? ""}: ${e.message}`, "api");
      throw e;
    }
    if (message.stop_reason === "refusal") throw new AiError("The model declined this request.", "refusal");
    if (message.stop_reason === "max_tokens") throw new AiError("The design was too long and got cut off.", "max_tokens");
    const text = message.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      content: message.content as unknown as Anthropic.Beta.Messages.BetaContentBlockParam[],
      text,
      stopReason: message.stop_reason,
      model: message.model,
      usage: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
      },
    };
  };
}
