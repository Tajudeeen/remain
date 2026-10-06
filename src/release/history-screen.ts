export interface HistoryFinding { objectSha: string; path: string; rule: string }

/** Pattern screening of tracked text, not an assurance that all secrets are absent. */
export function screenHistoryBlob(objectSha: string, path: string, bytes: Uint8Array): HistoryFinding[] {
  const rules = new Set<string>();
  const leaf = path.split('/').at(-1) ?? '';
  if ((leaf.startsWith('.env') && leaf !== '.env.example') || /\.(?:pem|key)$/i.test(leaf)) rules.add('CREDENTIAL_FILE_TRACKED');
  if (bytes.includes(0)) return [...rules].map(rule => ({ objectSha, path, rule }));
  const text = new TextDecoder().decode(bytes);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) rules.add('PRIVATE_KEY_MARKER');
  if (/BINANCE_WEB3_(?:API_KEY|SECRET_KEY)[\t ]*[:=][\t ]*["']?[A-Za-z0-9_+/=-]{20,}/.test(text)) rules.add('BINANCE_CREDENTIAL_LITERAL');
  if (/(?:PRIVATE_KEY|privateKey)[\t ]*[:=][\t ]*["']?(?:0x)?[a-fA-F0-9]{64}(?![a-fA-F0-9])/.test(text)) rules.add('WALLET_PRIVATE_KEY_LITERAL');
  return [...rules].map(rule => ({ objectSha, path, rule }));
}
