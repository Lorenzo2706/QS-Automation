import { task } from "@trigger.dev/sdk/v3";
import { readFileSync } from "fs";
import { basename, resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// pdf2json is a pure Node.js PDF parser - no web workers, no bundling issues
import PDFParser, { type Output, type Page, type Text } from "pdf2json";

type ParsedResumePdf = {
  parsedText: string;
  rawText: string;
  warnings: string[];
};

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
  spaceWidth: number;
  fontSize: number;
  isBold: boolean;
};

type ResumeLine = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  isBold: boolean;
};

const SECTION_HEADINGS = new Set([
  "about",
  "certifications",
  "certificates",
  "contact",
  "education",
  "ervaring",
  "interests",
  "languages",
  "opleiding",
  "opleidingen",
  "personal details",
  "persoonlijke gegevens",
  "profile",
  "profiel",
  "projects",
  "references",
  "samenvatting",
  "skills",
  "summary",
  "talen",
  "vaardigheden",
  "werkervaring",
  "work experience",
]);

function parseResumePdf(buffer: Buffer): Promise<ParsedResumePdf> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true);

    parser.on("pdfParser_dataError", (err) => {
      parser.destroy();
      reject(new Error(`PDF parsing failed: ${getParserErrorMessage(err)}`));
    });

    parser.on("pdfParser_dataReady", (pdfData) => {
      try {
        const rawText = parser.getRawTextContent()?.trim() ?? "";
        const normalizedText = normalizeResumePdf(pdfData);
        const parsedText = normalizedText || normalizeFallbackText(rawText);

        parser.destroy();
        resolve({
          parsedText,
          rawText,
          warnings: analyzeParsedResume(parsedText),
        });
      } catch (error) {
        parser.destroy();
        reject(error);
      }
    });

    parser.parseBuffer(buffer);
  });
}

function getParserErrorMessage(err: Error | { parserError: Error }): string {
  const parserError = err instanceof Error ? err : err.parserError;
  return parserError.message || String(parserError);
}

function normalizeResumePdf(pdfData: Output): string {
  const pages = pdfData.Pages ?? [];
  const pageTexts = pages
    .map((page) => normalizePageText(page))
    .filter((pageText) => pageText.length > 0);

  return postProcessLines(pageTexts.join("\n\n").split("\n"));
}

function normalizePageText(page: Page): string {
  const blocks = extractPositionedText(page.Texts ?? []);
  if (blocks.length === 0) return "";

  return splitLikelyColumns(blocks, page.Width)
    .flatMap((columnBlocks) => buildLines(columnBlocks))
    .map((line) => line.text)
    .join("\n");
}

function extractPositionedText(texts: Text[]): PositionedText[] {
  return texts
    .map((block) => {
      const text = normalizeInlineText(block.R.map((run) => decodePdfText(run.T)).join(""));
      const fontSizes = block.R.map((run) => run.TS?.[1] ?? 0).filter((size) => size > 0);
      const fontSize = fontSizes.length > 0 ? Math.max(...fontSizes) : 10;

      return {
        text,
        x: block.x,
        y: block.y,
        width: block.w ?? 0,
        spaceWidth: block.sw ?? 0.2,
        fontSize,
        isBold: block.R.some((run) => run.TS?.[2] === 1),
      };
    })
    .filter((block) => block.text.length > 0);
}

function decodePdfText(text: string): string {
  if (!/%[0-9a-f]{2}/i.test(text)) return text;

  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function normalizeInlineText(text: string): string {
  return text
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/[\u2022\u25aa\u25ab\u25cf\u25e6\u25c6]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLikelyColumns(blocks: PositionedText[], pageWidth: number): PositionedText[][] {
  if (blocks.length < 16 || pageWidth <= 0) return [sortByReadingOrder(blocks)];

  const centers = blocks
    .map((block) => block.x + block.width / 2)
    .sort((a, b) => a - b);
  const minSplitX = pageWidth * 0.2;
  const maxSplitX = pageWidth * 0.8;
  let bestGap = 0;
  let splitX: number | null = null;

  for (let index = 1; index < centers.length; index++) {
    const left = centers[index - 1];
    const right = centers[index];
    const middle = (left + right) / 2;
    const gap = right - left;

    if (middle < minSplitX || middle > maxSplitX) continue;
    if (gap > bestGap) {
      bestGap = gap;
      splitX = middle;
    }
  }

  if (splitX === null || bestGap < pageWidth * 0.12) return [sortByReadingOrder(blocks)];

  const leftColumn = blocks.filter((block) => block.x + block.width / 2 <= splitX);
  const rightColumn = blocks.filter((block) => block.x + block.width / 2 > splitX);

  if (!isSubstantialColumn(leftColumn) || !isSubstantialColumn(rightColumn)) {
    return [sortByReadingOrder(blocks)];
  }

  return [leftColumn, rightColumn]
    .sort((a, b) => getMinX(a) - getMinX(b))
    .map((column) => sortByReadingOrder(column));
}

function isSubstantialColumn(blocks: PositionedText[]): boolean {
  if (blocks.length < 6) return false;

  const minY = Math.min(...blocks.map((block) => block.y));
  const maxY = Math.max(...blocks.map((block) => block.y));
  return maxY - minY > 4;
}

function getMinX(blocks: PositionedText[]): number {
  return Math.min(...blocks.map((block) => block.x));
}

function sortByReadingOrder(blocks: PositionedText[]): PositionedText[] {
  return [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
}

function buildLines(blocks: PositionedText[]): ResumeLine[] {
  const lines: Array<{ y: number; blocks: PositionedText[] }> = [];

  for (const block of sortByReadingOrder(blocks)) {
    const tolerance = Math.max(0.12, block.fontSize / 70);
    const existingLine = [...lines]
      .reverse()
      .slice(0, 4)
      .find((line) => Math.abs(line.y - block.y) <= tolerance);

    if (existingLine) {
      existingLine.blocks.push(block);
      existingLine.y =
        existingLine.blocks.reduce((sum, item) => sum + item.y, 0) / existingLine.blocks.length;
    } else {
      lines.push({ y: block.y, blocks: [block] });
    }
  }

  return lines
    .sort((a, b) => a.y - b.y)
    .map((line) => buildLine(line.blocks))
    .filter((line) => line.text.length > 0);
}

function buildLine(blocks: PositionedText[]): ResumeLine {
  const sortedBlocks = [...blocks].sort((a, b) => a.x - b.x);
  const firstBlock = sortedBlocks[0];
  let previousBlock: PositionedText | null = null;
  let text = "";

  for (const block of sortedBlocks) {
    if (previousBlock && shouldInsertSpace(previousBlock, block)) {
      text += " ";
    }

    text += block.text;
    previousBlock = block;
  }

  return {
    text: normalizeLineText(text),
    x: firstBlock.x,
    y: firstBlock.y,
    fontSize: Math.max(...sortedBlocks.map((block) => block.fontSize)),
    isBold: sortedBlocks.some((block) => block.isBold),
  };
}

function shouldInsertSpace(previousBlock: PositionedText, currentBlock: PositionedText): boolean {
  if (/[\s\-/(]$/.test(previousBlock.text) || /^[\s,.;:)/-]/.test(currentBlock.text)) {
    return false;
  }

  const previousRight = previousBlock.x + previousBlock.width;
  const gap = currentBlock.x - previousRight;
  const threshold = Math.max(0.05, Math.min(0.25, previousBlock.spaceWidth * 0.4));

  return gap > threshold;
}

function normalizeLineText(text: string): string {
  return text
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function postProcessLines(textOrLines: string | string[]): string {
  const lines = (Array.isArray(textOrLines) ? textOrLines : textOrLines.split("\n"))
    .map(normalizeLineText)
    .filter((line) => line.length > 0 && !isDecorativeLine(line));

  const output: string[] = [];

  for (const line of lines) {
    const normalizedLine = normalizeBulletLine(line);
    const previousLine = output[output.length - 1];

    if (isSectionHeading(normalizedLine) && output.length > 0 && previousLine !== "") {
      output.push("");
    }

    if (previousLine && shouldMergeContinuation(previousLine, normalizedLine)) {
      output[output.length - 1] = `${previousLine} ${normalizedLine}`;
    } else {
      output.push(normalizedLine);
    }
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeBulletLine(line: string): string {
  return line.replace(/^[-*]\s*/, "- ");
}

function shouldMergeContinuation(previousLine: string, line: string): boolean {
  if (isSectionHeading(previousLine) || isSectionHeading(line)) return false;
  if (isBulletLine(line)) return false;
  if (isBulletLine(previousLine)) return true;
  if (/[,;:]$/.test(previousLine)) return true;
  return /^[a-z]/.test(line) && !/[.!?)]$/.test(previousLine);
}

function isBulletLine(line: string): boolean {
  return /^[-*]\s+/.test(line);
}

function isDecorativeLine(line: string): boolean {
  return /^[|_\-=., ]+$/.test(line);
}

function isSectionHeading(line: string): boolean {
  const key = line
    .toLowerCase()
    .replace(/[:|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (SECTION_HEADINGS.has(key)) return true;
  if (key.length > 42 || /@|https?:|www\.|\d{4}/.test(key)) return false;

  const letters = line.replace(/[^a-z]/gi, "");
  if (letters.length < 3) return false;

  const uppercaseLetters = letters.replace(/[^A-Z]/g, "");
  return uppercaseLetters.length / letters.length > 0.75;
}

function normalizeFallbackText(text: string): string {
  return postProcessLines(
    text
      .replace(/\r/g, "\n")
      .replace(/-{8,}Page \(\d+\) Break-{8,}/g, "\n")
      .split("\n")
  );
}

function analyzeParsedResume(parsedText: string): string[] {
  const lines = parsedText.split("\n").map((line) => line.trim()).filter(Boolean);
  const warnings: string[] = [];

  if (lines.length < 8) {
    warnings.push("Parsed resume has very few lines; the PDF may be scanned or image-based.");
  }

  if (!lines.some(isSectionHeading)) {
    warnings.push("Parsed resume has no obvious section headings; review the extracted text.");
  }

  if (lines.filter((line) => line.length > 220).length > 2) {
    warnings.push("Parsed resume has unusually long lines; the PDF layout may still need manual cleanup.");
  }

  return warnings;
}

/**
 * One-time setup task: parses a PDF resume and stores the text in Supabase.
 * Run this from the Trigger.dev dev server (locally) where the PDF file is accessible.
 *
 * Trigger from the Trigger.dev dashboard with a payload like:
 * {
 *   "userId": "uuid-from-register-user-task",
 *   "pdfPath": "C:/Users/LorenzoGiori/Documents/resume.pdf"
 * }
 *
 * Notes:
 *   - pdfPath must be an absolute path accessible from your local machine
 *   - Each call deactivates the previous resume for this user and adds the new one
 *   - The parsed text is stored in Supabase and used by classify-job in production
 */
export const uploadResumeTask = task({
  id: "upload-resume",
  maxDuration: 120,
  run: async (payload: { userId: string; pdfPath: string }) => {
    const { userId, pdfPath } = payload;

    if (!userId?.trim()) throw new Error("userId is required");
    if (!pdfPath?.trim()) throw new Error("pdfPath is required");

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");

    const db = createClient(url, key, { auth: { persistSession: false } });

    // Validate that the user exists
    const { data: user, error: userError } = await db
      .from("users")
      .select("user_id, name")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      throw new Error(`User not found: ${userId}. Run register-user first.`);
    }

    // Read and parse the PDF
    const absolutePath = resolve(pdfPath);
    console.log(`Parsing PDF: ${absolutePath}`);

    let buffer: Buffer;
    try {
      buffer = readFileSync(absolutePath);
    } catch {
      throw new Error(`Could not read file: ${absolutePath}. Check the path and try again.`);
    }

    const { parsedText, rawText, warnings } = await parseResumePdf(buffer);

    if (!parsedText) {
      throw new Error("PDF parsing produced empty text - check the file is a valid text-based PDF");
    }

    console.log(
      `Parsed ${parsedText.length} normalized characters from ${basename(absolutePath)} ` +
        `(${rawText.length} raw characters)`
    );

    for (const warning of warnings) {
      console.warn(`Resume parsing warning: ${warning}`);
    }

    // Deactivate any previous resumes for this user
    const { error: deactivateError } = await db
      .from("resumes")
      .update({ is_active: false })
      .eq("user_id", userId);

    if (deactivateError) {
      throw new Error(`Failed to deactivate previous resumes: ${deactivateError.message}`);
    }

    // Insert new resume
    const { data: resume, error: insertError } = await db
      .from("resumes")
      .insert({
        user_id: userId,
        filename: basename(absolutePath),
        parsed_text: parsedText,
        is_active: true,
      })
      .select("resume_id")
      .single();

    if (insertError) throw new Error(`Failed to insert resume: ${insertError.message}`);

    console.log(`Resume uploaded successfully:`);
    console.log(`  resume_id: ${resume.resume_id}`);
    console.log(`  user: ${(user as { name: string }).name}`);
    console.log(`  file: ${basename(absolutePath)}`);
    console.log(`  characters: ${parsedText.length}`);

    return {
      resumeId: resume.resume_id as string,
      userId,
      filename: basename(absolutePath),
      textLength: parsedText.length,
    };
  },
});
