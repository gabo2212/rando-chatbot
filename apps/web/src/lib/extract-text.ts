import { extractText as extractPdfText } from "unpdf";

export type ExtractResult = {
  text: string;
  method: string;
  warning?: string;
};

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "html",
  "htm",
  "xml",
  "yml",
  "yaml",
  "toml",
  "ini",
  "log",
  "rs",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "css",
  "scss",
  "sql",
  "sh",
  "env",
  "r",
  "rb",
  "php",
  "swift",
  "kt",
]);

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

async function asUtf8(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buf = Buffer.from(await file.arrayBuffer());
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value;
}

async function extractPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const { text } = await extractPdfText(data);
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
}

/**
 * Best-effort text extraction for RAG indexing.
 * Images: optional Ollama vision describe (llava / moondream) if available.
 */
export async function extractFileText(file: File): Promise<ExtractResult> {
  const ext = extOf(file.name);
  const type = (file.type || "").toLowerCase();

  try {
    if (ext === "pdf" || type === "application/pdf") {
      const text = (await extractPdf(file)).trim();
      if (!text) {
        return {
          text: "",
          method: "pdf",
          warning: "PDF had no extractable text (may be scanned/image-only).",
        };
      }
      return { text, method: "pdf" };
    }

    if (
      ext === "docx" ||
      type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const text = (await extractDocx(file)).trim();
      return { text, method: "docx", warning: text ? undefined : "DOCX was empty." };
    }

    if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      const described = await describeImageWithOllama(file);
      if (described) {
        return { text: described, method: "ollama-vision" };
      }
      return {
        text: `[Image file: ${file.name} (${type || ext}). No vision model available for OCR/description.]`,
        method: "image-stub",
        warning:
          "Image stored as a stub. Pull a vision model (e.g. `docker exec rando-ollama ollama pull llava`) for descriptions.",
      };
    }

    if (TEXT_EXT.has(ext) || type.startsWith("text/") || type === "application/json") {
      const text = (await asUtf8(file)).trim();
      return { text, method: "text", warning: text ? undefined : "File was empty." };
    }

    // Unknown binary: try UTF-8, otherwise stub
    const raw = await asUtf8(file);
    const printable = raw.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "").trim();
    if (printable.length > 40 && printable.length / Math.max(raw.length, 1) > 0.7) {
      return { text: printable, method: "utf8-fallback" };
    }

    return {
      text: `[Binary file: ${file.name} (${type || "unknown"}). Text extraction not supported for this format.]`,
      method: "unsupported",
      warning: `No text extractor for .${ext || "unknown"}. Indexed metadata only.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "extract failed";
    return {
      text: `[Failed to extract ${file.name}: ${message}]`,
      method: "error",
      warning: message,
    };
  }
}

async function describeImageWithOllama(file: File): Promise<string | null> {
  const base =
    process.env.OLLAMA_BASE_URL?.replace(/\/v1\/?$/, "") ?? "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_VISION_MODEL ?? "llava";

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const b64 = buf.toString("base64");
    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt:
          "Describe this image in detail for a retrieval index. Include any visible text (OCR), objects, layout, and context.",
        images: [b64],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    const text = data.response?.trim();
    return text || null;
  } catch {
    return null;
  }
}
