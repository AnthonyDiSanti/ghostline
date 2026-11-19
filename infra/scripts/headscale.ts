import { runHeadscale } from '../lib/headscale-operator.js';

// The maintained CLI exposes explicit coordinator operations; it never accepts arbitrary host commands.
const [action, ...args] = process.argv.slice(2);
if (!['plan', 'qualify', 'deploy', 'status', 'verify', 'restart', 'replace-host', 'users', 'nodes', 'approve', 'delete-node', 'delete-user'].includes(action ?? '')
  || (action === 'users' ? args.length > 1 : action === 'approve' ? args.length !== 1 : action === 'deploy' ? args.length > 1 || (args.length === 1 && args[0] !== '--refresh') : ['delete-node', 'delete-user'].includes(action ?? '') ? args.length !== 1 || !/^\d+$/.test(args[0]!) : args.length !== 0)) {
  throw new Error('Usage: npm run headscale <plan|qualify|deploy [--refresh]|status|verify|restart|replace-host|users [name]|nodes|approve user-name (registration ID on stdin)|delete-node id|delete-user id>');
}

async function readApprovalId() {
  // Require a pipe so the terminal cannot echo the ID. Accept one bounded line without exposing malformed input.
  if (process.stdin.isTTY) throw new Error('Supply the registration ID on stdin without terminal echo.');
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 130) throw new Error('Invalid private enrollment input.');
  }
  return input.replace(/\r?\n$/, '');
}

try {
  const approvalId = action === 'approve' ? await readApprovalId() : undefined;
  console.log(JSON.stringify(await runHeadscale(action!, args, approvalId), null, 2));
}
catch (error) { console.error(error instanceof Error ? error.message : 'Coordinator operation failed.'); process.exitCode = 1; }
