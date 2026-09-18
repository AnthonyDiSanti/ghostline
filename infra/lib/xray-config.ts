export interface XrayBundle {
  files: Record<string, string>;
  [metadata: string]: unknown;
}

export function parseJson(text: string): any {
  // JSON parser diagnostics can quote secret input; expose only a fixed diagnostic.
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON; contents withheld.'); }
}

export function validateXrayBundle(value: unknown): XrayBundle {
  // Preserve the server envelope bytes; reject unsafe filenames and malformed encoded configuration.
  const bundle = value as XrayBundle;
  if (!bundle || !bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) {
    throw new Error('Expected an Xray configuration bundle.');
  }
  for (const [name, content] of Object.entries(bundle.files)) {
    if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(name) || typeof content !== 'string'
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
      throw new Error('Bundle contains an invalid filename or encoding.');
    }
  }
  const server = parseJson(Buffer.from(bundle.files['server.json'] ?? '', 'base64').toString('utf8'));
  const inbound = server?.inbounds?.find((item: any) => item.protocol === 'vless');
  if (!inbound || server.inbounds.length !== 1 || inbound.port !== 443
    || inbound.streamSettings?.security !== 'reality'
    || !inbound.streamSettings.realitySettings?.privateKey
    || !inbound.settings?.clients?.length
    || !inbound.settings.clients.every((client: any) => typeof client.id === 'string' && client.id.length > 0)) {
    throw new Error('Expected the existing VLESS/REALITY TCP 443 service and all client identities.');
  }
  return bundle;
}
