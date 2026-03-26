export interface LatestMessage {
  rawXml: string;
  text: string;
}

export interface ParsedMessage {
  sender: string | null;
  time: string | null;
  text: string;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * NanoClaw passes prompt as XML-like text (see src/router.ts: formatMessages).
 * This extracts the last <message>...</message> content.
 */
export function extractLatestMessage(promptXml: string): LatestMessage | null {
  const re = /<message[^>]*>([\s\S]*?)<\/message>/g;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = re.exec(promptXml)) !== null) {
    last = match[1] ?? '';
  }
  if (last === null) {
    const trimmed = promptXml.trim();
    if (!trimmed) return null;
    return { rawXml: promptXml, text: trimmed };
  }
  return { rawXml: promptXml, text: unescapeXml(last).trim() };
}

export function parseMessages(promptXml: string): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  const re = /<message(?:\s+([^>]*))?>([\s\S]*?)<\/message>/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(promptXml)) !== null) {
    const attrs = match[1] ?? '';
    const content = match[2] ?? '';

    const senderMatch = /sender="([^"]*)"/.exec(attrs);
    const timeMatch = /time="([^"]*)"/.exec(attrs);

    out.push({
      sender: senderMatch ? unescapeXml(senderMatch[1] ?? '') : null,
      time: timeMatch ? unescapeXml(timeMatch[1] ?? '') : null,
      text: unescapeXml(content).trim(),
    });
  }

  // Fallback: if prompt isn't XML-wrapped, treat it as a single user message.
  if (out.length === 0) {
    const trimmed = promptXml.trim();
    if (trimmed) {
      out.push({ sender: null, time: null, text: trimmed });
    }
  }

  return out;
}

export function stripLeadingTrigger(text: string, assistantName?: string): string {
  const name = (assistantName || '').trim();
  if (!name) return text;

  // Default trigger style is @Name
  const trigger = `@${name}`;
  const trimmed = text.trimStart();
  if (trimmed.toLowerCase().startsWith(trigger.toLowerCase())) {
    return trimmed.slice(trigger.length).trimStart();
  }
  return text;
}
