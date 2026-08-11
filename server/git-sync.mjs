import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const METADATA_PATH = 'data/skills.json';

async function git(projectRoot, args, options = {}) {
  return execFileAsync('git', ['-C', projectRoot, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

async function optionalGit(projectRoot, args, allowedCodes = [1]) {
  try {
    return firstLine((await git(projectRoot, args)).stdout);
  } catch (error) {
    if (allowedCodes.includes(error?.code)) return '';
    throw error;
  }
}

function firstLine(value) {
  return String(value || '').trim().split('\n')[0];
}

function failureReason(error) {
  return firstLine(error?.stderr) || firstLine(error?.stdout) || firstLine(error?.message) || 'git operation failed';
}

async function findUnsafeAhead(projectRoot, upstreamRef) {
  const output = (await git(projectRoot, ['rev-list', '--reverse', `${upstreamRef}..HEAD`])).stdout.trim();
  const commits = output ? output.split('\n') : [];
  for (const commit of commits) {
    const changed = (await git(projectRoot, [
      'diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-m', '--no-renames', '-z', commit,
    ])).stdout;
    const paths = changed.split('\0').filter(Boolean);
    if (paths.length === 0) return `${commit} has no metadata change`;
    const unsafePath = paths.find((changedPath) => changedPath !== METADATA_PATH);
    if (unsafePath) return `${commit} changes ${unsafePath}`;
  }
  return '';
}

async function isBehindUpstream(projectRoot, upstreamRef) {
  const counts = firstLine((await git(
    projectRoot,
    ['rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`],
  )).stdout).split(/\s+/);
  return Number(counts[1]) > 0;
}

async function isAncestor(projectRoot, ancestor, descendant) {
  try {
    await git(projectRoot, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

export async function syncMetadataGit({
  projectRoot,
  gitName,
  gitEmail,
  commitMessage,
  timeout = 60000,
}) {
  try {
    const metadataStatus = (await git(
      projectRoot,
      ['status', '--porcelain', '--', METADATA_PATH],
    )).stdout.trim();
    if (!metadataStatus) return { pushed: false, reason: 'no-change' };

    const branch = await optionalGit(projectRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const remote = branch
      ? await optionalGit(projectRoot, ['config', '--get', `branch.${branch}.remote`])
      : '';
    const mergeRef = branch
      ? await optionalGit(projectRoot, ['config', '--get', `branch.${branch}.merge`])
      : '';
    if (!branch || !remote || !mergeRef) {
      return { pushed: false, reason: 'no-upstream' };
    }
    const upstreamRef = await optionalGit(
      projectRoot,
      ['rev-parse', '--symbolic-full-name', '@{u}'],
      [1, 128],
    );
    if (!upstreamRef) return { pushed: false, reason: 'no-upstream' };
    await git(projectRoot, ['fetch', '--quiet', '--no-tags', '--', remote], { timeout });
    if (await isBehindUpstream(projectRoot, upstreamRef)) {
      return { pushed: false, reason: 'behind-upstream' };
    }
    const unsafeAhead = await findUnsafeAhead(projectRoot, upstreamRef);
    if (unsafeAhead) return { pushed: false, reason: `unsafe-ahead: ${unsafeAhead}` };

    await git(projectRoot, [
      '-c', `user.name=${gitName}`,
      '-c', `user.email=${gitEmail}`,
      'commit', '--only', '-m', commitMessage, '--', METADATA_PATH,
    ]);
    const intendedCommit = firstLine((await git(projectRoot, ['rev-parse', 'HEAD'])).stdout);
    await git(projectRoot, ['fetch', '--quiet', '--no-tags', '--', remote], { timeout });
    if (await isBehindUpstream(projectRoot, upstreamRef)) {
      return { pushed: false, reason: 'behind-upstream' };
    }
    const unsafeAfterCommit = await findUnsafeAhead(projectRoot, upstreamRef);
    if (unsafeAfterCommit) {
      return { pushed: false, reason: `unsafe-ahead: ${unsafeAfterCommit}` };
    }
    const checkedHead = firstLine((await git(projectRoot, ['rev-parse', 'HEAD'])).stdout);
    if (!await isAncestor(projectRoot, intendedCommit, checkedHead)) {
      return { pushed: false, reason: 'head-moved' };
    }
    const pushed = await git(
      projectRoot,
      ['push', '--porcelain', '--', remote, `${intendedCommit}:${mergeRef}`],
      { timeout },
    );

    return {
      pushed: true,
      commit: intendedCommit,
      output: firstLine(pushed.stdout) || firstLine(pushed.stderr),
    };
  } catch (error) {
    return { pushed: false, reason: failureReason(error) };
  }
}
