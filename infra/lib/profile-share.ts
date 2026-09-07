import { deflateSync } from 'node:zlib';
import QRCode from 'qrcode';

export function vpnLink(profile: string): string {
  // Amnezia's text importer accepts native config wrapped in Qt qCompress (BE length + zlib).
  const input = Buffer.from(profile, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(input.length);
  return `vpn://${Buffer.concat([length, deflateSync(input, { level: 8 })]).toString('base64url')}`;
}

export async function profileQr(profile: string): Promise<Buffer> {
  // The app's QR path recognizes native AWG text directly; do not publish credentials to a QR service.
  return QRCode.toBuffer(profile, { type: 'png', errorCorrectionLevel: 'L', scale: 6, margin: 4 });
}
