import { GoogleGenerativeAI } from "@google/generative-ai";

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
}

export type JobCategory = "freelance" | "temporary" | "permanent";

/**
 * Classifies a Dutch job posting into freelance / temporary / permanent.
 * Exactly one of the three booleans in the Gemini response must be true.
 *
 * Returns a category ONLY for a well-formed response. On a malformed response
 * (parse error, or zero/multiple trues) we **throw** so the `filter-job` task
 * retries (it re-rolls Gemini, which usually resolves a transient ambiguity).
 * We deliberately do NOT fall back to "permanent" here: that would let the
 * caller mark the job evaluated and drop it forever on a transient failure.
 * If retries are exhausted the run fails visibly and the job stays pending
 * (needs_evaluation=true), to be reprocessed on the next scrape.
 */
export async function filterJob(title: string, description: string): Promise<JobCategory> {
  const model = getModel();
  const prompt = `You are a job classification expert. Classify this Dutch job posting into exactly ONE of:
- 'Freelance'
- 'Temporary'
- 'Permanent'

Rules (evaluate in this order; stop at the first match):

1. Freelance — pick this if the posting is aimed at independent contractors:
   mentions of freelance, zzp, zzp'er, zelfstandige, contractor, interim professional,
   interim assignment for a self-employed, "opdracht" advertised to a freelancer,
   or hourly/day-rate phrasing aimed at independents.

2. Temporary — pick this if the role has a defined engagement period or finite scope,
   and the posting does NOT promise a path to a permanent contract. Signals:
   - Explicit start and/or end date (e.g. "Start date: dd/mm/yyyy", "End date: dd/mm/yyyy").
   - Explicit duration (e.g. "6 maanden", "duur 12 maanden", "contract of X months").
   - Fixed-term / fixed-purpose phrasing: "tijdelijk contract", "tijdelijke opdracht",
     "project tot", "opdracht tot", "vervanging", "waarneming", "tijdelijke vervanging",
     maternity cover, sick-leave replacement, interim role filled as employee.
   - Staffing-agency / secondment / detachering assignments with a defined end.

3. Permanent — pick this ONLY if neither Freelance nor Temporary applies:
   - Open-ended / indefinite contracts ("vast contract", "onbepaalde tijd", "permanent").
   - No end date, no fixed duration, and no finite-scope language mentioned.
   - Fixed-term contracts that EXPLICITLY advertise conversion to permanent
     ("uitzicht op vast", "met kans op vast dienstverband", "tijdelijk met uitzicht op vast")
     — these are Permanent because the intent is a permanent hire.

Tie-breakers:
- If Freelance signals are present, classify as Freelance even if dates are mentioned.
- If dates/duration are present and "uitzicht op vast" is NOT mentioned, classify as Temporary.
- If the posting is silent on duration and contract type, classify as Permanent.

Respond ONLY with valid JSON in this exact shape, where EXACTLY ONE field is true
and the other two are false:
{"is_freelance": true|false, "is_temporary": true|false, "is_permanent": true|false}

Title: ${title}
Description: ${description}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  let parsed: { is_freelance?: unknown; is_temporary?: unknown; is_permanent?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`filterJob: Gemini returned non-JSON (will retry). Raw: ${text}`);
  }

  const f = parsed.is_freelance === true;
  const t = parsed.is_temporary === true;
  const p = parsed.is_permanent === true;
  const trueCount = Number(f) + Number(t) + Number(p);

  if (trueCount !== 1) {
    throw new Error(
      `filterJob: Gemini returned ${trueCount} true booleans (expected 1, will retry). Raw: ${text}`
    );
  }

  if (f) return "freelance";
  if (t) return "temporary";
  return "permanent";
}

/**
 * Asks Gemini to score how well the resume matches the job.
 * Returns a score 0–100 and a short explanation.
 */
export async function scoreJob(
  title: string,
  description: string,
  resumeText: string
): Promise<{ score: number; reason: string }> {
  const model = getModel();
  const prompt = `You are a job matching assistant. Score how well the candidate's resume matches this job posting.

RESUME:
${resumeText}

JOB TITLE: ${title}
JOB DESCRIPTION:
${description}

Respond ONLY with valid JSON in this exact format: {"score": <integer 0-100>, "reason": "<1-2 sentence explanation>"}

Scoring guidelines:
- 90–100: Near-perfect match — candidate's experience directly covers almost every requirement
- 75–89: Strong match — most key requirements covered, minor gaps
- 50–74: Moderate match — relevant background but notable gaps
- Below 50: Weak match — significant gaps or mismatch
Be strict: only score above 85 when the match is genuinely strong.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const parsed = JSON.parse(text) as { score: number; reason: string };
    if (typeof parsed.score !== "number" || typeof parsed.reason !== "string") {
      throw new Error("Invalid shape");
    }
    return { score: Math.round(parsed.score), reason: parsed.reason };
  } catch {
    throw new Error(`Gemini returned invalid JSON for scoreJob: ${text}`);
  }
}
