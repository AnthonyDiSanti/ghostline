const repositories = '(?:XTLS/Xray-core|amnezia-vpn/amneziawg-(?:go|tools))';
const metadata = new RegExp(`^/repos/${repositories}/(?:releases/latest|releases\\?per_page=1|tags\\?per_page=100&page=[1-9]\\d*|commits/v\\d+\\.\\d+\\.\\d+)$`);
const archive = new RegExp(`^/${repositories}/tar\\.gz/[a-f0-9]{40}$`);
const workflow = /^\/amnezia-vpn\/amneziawg-go\/[a-f0-9]{40}\/\.github\/workflows\/build-if-tag\.yml$/;

export function upstreamDownloadCommand(address: string): { executable: 'gh' | 'curl'; args: string[] } {
  // Authenticate only explicit GETs to the reviewed public upstream repositories. Do not let an
  // unexpected host, API route or ambient GH_HOST send the operator's credentials elsewhere.
  const url = new URL(address);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Unexpected upstream download URL.');
  const path = url.pathname + url.search;
  if (url.hostname === 'api.github.com' && metadata.test(path)) {
    return { executable: 'gh', args: ['api', '--hostname', 'github.com', '--method', 'GET', path] };
  }
  // Raw source/workflow downloads stay anonymous; no token is exported or forwarded to curl.
  if ((url.hostname === 'codeload.github.com' && archive.test(path))
    || (url.hostname === 'raw.githubusercontent.com' && workflow.test(path))) {
    return { executable: 'curl', args: ['--disable', '--fail', '--silent', '--show-error', '--location',
      '--proto', '=https', '--proto-redir', '=https', '--max-time', '90', address] };
  }
  throw new Error('Unexpected upstream download URL.');
}

export function upstreamCommandEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Keep authentication inside gh and suppress inherited HTTP debug logging or interactive login prompts.
  const result: NodeJS.ProcessEnv = { ...environment, GH_PROMPT_DISABLED: '1' };
  delete result.GH_DEBUG;
  delete result.DEBUG;
  return result;
}
