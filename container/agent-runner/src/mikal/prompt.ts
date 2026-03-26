export interface LatestMessage {
  rawXml: string;
  text: string;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
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
  if (last === null) return null;
  return { rawXml: promptXml, text: unescapeXml(last).trim() };
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
