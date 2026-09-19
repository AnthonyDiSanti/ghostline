import { describe, expect, it } from 'vitest';
import { upstreamCommandEnvironment, upstreamDownloadCommand } from '../lib/upstream-download.js';

describe('authenticated upstream metadata reads', () => {
  it.each([
    '/repos/XTLS/Xray-core/releases/latest',
    '/repos/XTLS/Xray-core/commits/v26.3.27',
    '/repos/amnezia-vpn/amneziawg-tools/releases/latest',
    '/repos/amnezia-vpn/amneziawg-go/releases?per_page=1',
    '/repos/amnezia-vpn/amneziawg-go/tags?per_page=100&page=2',
  ])('routes a public metadata request through an explicit gh GET: %s', path => {
    expect(upstreamDownloadCommand(`https://api.github.com${path}`)).toEqual({
      executable: 'gh', args: ['api', '--hostname', 'github.com', '--method', 'GET', path],
    });
  });
  it.each([
    `https://codeload.github.com/amnezia-vpn/amneziawg-go/tar.gz/${'a'.repeat(40)}`,
    `https://codeload.github.com/amnezia-vpn/amneziawg-tools/tar.gz/${'b'.repeat(40)}`,
    `https://raw.githubusercontent.com/amnezia-vpn/amneziawg-go/${'a'.repeat(40)}/.github/workflows/build-if-tag.yml`,
  ])('keeps public file downloads anonymous: %s', url => {
    const request = upstreamDownloadCommand(url);
    expect(request.executable).toBe('curl');
    expect(request.args).toContain('--disable');
    expect(request.args).toContain('--proto-redir');
    expect(request.args.at(-1)).toBe(url);
    expect(request.args.slice(0, -1).some(arg => /token|authorization|header|user/i.test(arg))).toBe(false);
  });
  it.each([
    'https://api.github.com/repos/private/project/releases/latest',
    'https://api.github.com/user',
    'https://api.github.com/repos/XTLS/Xray-core/issues',
    'https://api.github.com/repos/XTLS/Xray-core/releases/latest?unexpected=1',
    'https://api.github.com.attacker.test/repos/XTLS/Xray-core/releases/latest',
    'https://operator:credential@api.github.com/repos/XTLS/Xray-core/releases/latest',
    'http://api.github.com/repos/XTLS/Xray-core/releases/latest',
    'https://api.github.com:8443/repos/XTLS/Xray-core/releases/latest',
    'https://api.github.com/repos/XTLS/Xray-core/releases/latest#fragment',
    'https://raw.githubusercontent.com/owner/repo/main/private-file',
    'https://codeload.github.com/amnezia-vpn/amneziawg-go/tar.gz/main',
  ])('rejects requests outside the approved metadata/source boundary: %s', url => {
    expect(() => upstreamDownloadCommand(url)).toThrow('Unexpected upstream');
  });
  it('disables inherited credential debug logging and prompts without changing the parent environment', () => {
    const original = { GH_DEBUG: 'api', DEBUG: '1', GH_PROMPT_DISABLED: '0', GH_TOKEN: 'synthetic-token', HTTPS_PROXY: 'https://proxy.example' };
    const result = upstreamCommandEnvironment(original);
    expect(result.GH_DEBUG).toBeUndefined(); expect(result.DEBUG).toBeUndefined();
    expect(result.GH_PROMPT_DISABLED).toBe('1');
    expect(result.GH_TOKEN).toBe(original.GH_TOKEN); expect(result.HTTPS_PROXY).toBe(original.HTTPS_PROXY);
    expect(original.GH_DEBUG).toBe('api'); expect(original.GH_PROMPT_DISABLED).toBe('0');
  });
});
