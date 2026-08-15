// Document content scanner — prompt-injection & malicious-content detection.
// Gold-standard principle (OWASP LLM01, Microsoft advisory 2026): documents are
// UNTRUSTED DATA. This scanner flags suspicious content at ingest so that:
//   1. Staff see a warning before relying on the document.
//   2. Future AI features NEVER feed flagged documents into model context.
//   3. Hidden-text techniques (white-on-white, tiny fonts, embedded JS) are
//      detected via raw-byte patterns even when invisible to the human.
//
// This is a heuristic first layer, not a guarantee. The architectural rules
// (prompt boundaries, tool gating, HITL) live in AGENTS.md §AI Guardrails.

export interface ScanResult {
  status: 'clean' | 'flagged';
  note: string | null;
}

// Known injection / jailbreak / exfiltration patterns (case-insensitive).
const INJECTION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore\s+(all\s+)?previous\s+instructions?/i, label: 'instruction-override' },
  { re: /ignore\s+(all\s+)?prior\s+(instructions?|prompts?|context)/i, label: 'instruction-override' },
  { re: /disregard\s+(all\s+)?(previous|prior)\s+(instructions?|prompts?)/i, label: 'instruction-override' },
  { re: /you\s+are\s+now\s+(an?\s+)?(unconstrained|unrestricted|DAN|jailbroken)/i, label: 'jailbreak' },
  { re: /\bDAN\b/i, label: 'jailbreak' },
  { re: /system\s*prompt/i, label: 'system-prompt-probe' },
  { re: /reveal\s+(your|the)\s+(system|initial)\s*prompt/i, label: 'system-prompt-probe' },
  { re: /EXECUTE[_A-Z]+\s*\(/i, label: 'tool-invocation' },
  { re: /route\s+(this|the)\s+(payment|transfer|invoice)/i, label: 'financial-redirect' },
  { re: /transfer\s+(funds|money|payment)\s+to/i, label: 'financial-redirect' },
  { re: /<script[\s>]/i, label: 'embedded-script' },
  { re: /javascript\s*:/i, label: 'embedded-script' },
  { re: /\/\/\s*Launch\s*Actions/i, label: 'pdf-launch-action' },
  { re: /\/OpenAction/i, label: 'pdf-open-action' },
  { re: /\/JavaScript/i, label: 'pdf-embedded-js' },
  { re: /base64\s*,\s*[A-Za-z0-9+/]{200,}/i, label: 'large-base64-blob' },
  { re: /(?:[A-Za-z0-9+/]{4}){50,}={0,2}/, label: 'large-base64-blob' },
  { re: /exfiltrat/i, label: 'exfiltration' },
  { re: /send\s+(this|the|all)\s+(document|file|content|data)\s+to/i, label: 'exfiltration' },
  { re: /delete\s+(all\s+)?(files?|records?|data)/i, label: 'destructive-action' },
  { re: /grant\s+(me|yourself)\s+(admin|root|privileged)/i, label: 'privilege-escalation' },
];

/** Scan raw upload bytes for suspicious content. */
export function scanDocumentBytes(bytes: Uint8Array, mimeType: string, filename: string): ScanResult {
  // Decode as latin-1 (lossless byte→char) so binary files still match patterns.
  let text = '';
  try {
    text = new TextDecoder('latin1').decode(bytes);
  } catch {
    text = '';
  }

  const hits: string[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.re.test(text)) hits.push(p.label);
  }

  // Text files: also check for suspicious instruction-like prefixes in the first lines.
  if (mimeType.startsWith('text/') || filename.endsWith('.txt') || filename.endsWith('.md')) {
    const firstLines = text.split('\n').slice(0, 20).join('\n');
    if (/^(you are|act as|from now on|your task is|remember to)\b/i.test(firstLines)) {
      hits.push('instruction-style-content');
    }
  }

  if (hits.length > 0) {
    const unique = [...new Set(hits)];
    return { status: 'flagged', note: `Suspicious content detected: ${unique.join(', ')}. Review before use — never feed into AI context.` };
  }
  return { status: 'clean', note: null };
}