import { GoogleGenerativeAI } from "@google/generative-ai";

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash-lite",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
}

/**
 * Asks Gemini whether the job is a temporary, contract, or freelance position.
 * Returns true if confirmed, false otherwise.
 */
export async function filterJob(title: string, description: string): Promise<boolean> {
  const model = getModel();
  const prompt = `You are a job classification assistant. Given the following job title and description, determine if this job is a temporary, contract, or freelance position (as opposed to permanent employment).

Respond ONLY with valid JSON in this exact format: {"is_freelance": true} or {"is_freelance": false}

Title: ${title}
Description: ${description}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const parsed = JSON.parse(text) as { is_freelance: boolean };
    return parsed.is_freelance === true;
  } catch {
    throw new Error(`Gemini returned invalid JSON for filterJob: ${text}`);
  }
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
