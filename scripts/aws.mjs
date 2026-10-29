import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));

// Credentials come from the AWS CLI's normal profile, environment or OIDC session.
// No keys are accepted as arguments or written into the project.
export function aws(args, { capture = false } = {}) {
  const result = spawnSync('aws', [...args, '--no-cli-pager'], {
    cwd: root,
    shell: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' },
  });
  if (result.error?.code === 'ENOENT') throw new Error('Install AWS CLI v2 and reopen your terminal.');
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(capture ? result.stderr.trim() : `AWS command failed (exit ${result.status}). See the message above.`);
  }
  return capture ? result.stdout.trim() : undefined;
}

export function awsJson(args) {
  const output = aws([...args, '--output', 'json'], { capture: true });
  // Some CloudFront list operations return no body when the account has no resources.
  return output ? JSON.parse(output) : {};
}
