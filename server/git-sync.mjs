import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import os from 'node:os';

const execFileAsync = promisify(execFile);
const METADATA_PATH = 'data/skills.json';
const syncTails = new Map();
const GIT_ENV_OVERRIDES = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_LITERAL_PATHSPECS',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
]);

function sanitizedGitEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      GIT_ENV_OVERRIDES.has(key)
      || /^GIT_CONFIG_(?:KEY|VALUE)_/.test(key)
    ) delete env[key];
  }
  env.GIT_NO_REPLACE_OBJECTS = '1';
  env.GIT_LITERAL_PATHSPECS = '1';
  return env;
}

function createGitRunner(runProcess, timeout) {
  return (projectRoot, args) => runProcess('git', [
    '-C', projectRoot,
    '-c', `core.hooksPath=${os.devNull}`,
    '-c', 'commit.gpgSign=false',
    '-c', 'push.gpgSign=false',
    '--no-replace-objects',
    ...args,
  ], {
    encoding: 'utf8',
    timeout,
    env: sanitizedGitEnv(),
  });
}

async function optionalGit(git, projectRoot, args, allowedCodes = [1]) {
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

async function findUnsafeAhead(git, projectRoot, upstreamRef) {
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

async function isBehindUpstream(git, projectRoot, upstreamRef) {
  const counts = firstLine((await git(
    projectRoot,
    ['rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`],
  )).stdout).split(/\s+/);
  return Number(counts[1]) > 0;
}

async function isAncestor(git, projectRoot, ancestor, descendant) {
  try {
    await git(projectRoot, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

async function runMetadataGitSync({
  projectRoot,
  gitName,
  gitEmail,
  commitMessage,
  timeout = 60000,
}, runProcess) {
  const git = createGitRunner(runProcess, timeout);
  try {
    const metadataStatus = (await git(
      projectRoot,
      ['status', '--porcelain', '--', METADATA_PATH],
    )).stdout.trim();

    const branch = await optionalGit(git, projectRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const remote = branch
      ? await optionalGit(git, projectRoot, ['config', '--get', `branch.${branch}.remote`])
      : '';
    const mergeRef = branch
      ? await optionalGit(git, projectRoot, ['config', '--get', `branch.${branch}.merge`])
      : '';
    if (!branch || !remote || !mergeRef) {
      return { pushed: false, reason: 'no-upstream' };
    }
    const upstreamRef = await optionalGit(
      git,
      projectRoot,
      ['rev-parse', '--symbolic-full-name', '@{u}'],
      [1, 128],
    );
    if (!upstreamRef) return { pushed: false, reason: 'remote-missing' };
    const preFetchUpstreamOid = await optionalGit(
      git,
      projectRoot,
      ['rev-parse', '--verify', `${upstreamRef}^{commit}`],
      [1, 128],
    );
    if (!preFetchUpstreamOid) return { pushed: false, reason: 'remote-missing' };
    await git(projectRoot, ['fetch', '--prune', '--quiet', '--no-tags', '--', remote]);
    const expectedUpstreamOid = await optionalGit(
      git,
      projectRoot,
      ['rev-parse', '--verify', `${upstreamRef}^{commit}`],
      [1, 128],
    );
    if (!expectedUpstreamOid) return { pushed: false, reason: 'remote-missing' };
    if (expectedUpstreamOid !== preFetchUpstreamOid) {
      return { pushed: false, reason: 'remote-changed' };
    }
    if (await isBehindUpstream(git, projectRoot, expectedUpstreamOid)) {
      return { pushed: false, reason: 'behind-upstream' };
    }
    const unsafeAhead = await findUnsafeAhead(git, projectRoot, expectedUpstreamOid);
    if (unsafeAhead) return { pushed: false, reason: `unsafe-ahead: ${unsafeAhead}` };

    const preCommitHead = firstLine((await git(projectRoot, ['rev-parse', 'HEAD'])).stdout);
    let intendedCommit;
    if (!metadataStatus) {
      if (preCommitHead === expectedUpstreamOid) {
        return { pushed: false, reason: 'no-change' };
      }
      intendedCommit = preCommitHead;
    } else {
      const desiredMetadataBlob = firstLine((await git(
        projectRoot,
        ['hash-object', '--', METADATA_PATH],
      )).stdout);
      await git(projectRoot, [
        '-c', `user.name=${gitName}`,
        '-c', `user.email=${gitEmail}`,
        'commit', '--only', '-m', commitMessage, '--', METADATA_PATH,
      ]);
      const candidateHead = firstLine((await git(projectRoot, ['rev-parse', 'HEAD'])).stdout);
      const candidateParents = firstLine((await git(
        projectRoot,
        ['rev-list', '--parents', '-n', '1', candidateHead],
      )).stdout).split(/\s+/);
      const candidateMetadataBlob = await optionalGit(
        git,
        projectRoot,
        ['rev-parse', '--verify', `${candidateHead}:${METADATA_PATH}`],
        [1, 128],
      );
      if (
        candidateHead === preCommitHead
        || candidateParents.length !== 2
        || candidateParents[1] !== preCommitHead
        || candidateMetadataBlob !== desiredMetadataBlob
      ) {
        return { pushed: false, reason: 'commit-verification-failed' };
      }
      intendedCommit = candidateHead;
    }
    await git(projectRoot, ['fetch', '--prune', '--quiet', '--no-tags', '--', remote]);
    const finalUpstreamOid = await optionalGit(
      git,
      projectRoot,
      ['rev-parse', '--verify', `${upstreamRef}^{commit}`],
      [1, 128],
    );
    if (!finalUpstreamOid) return { pushed: false, reason: 'remote-missing' };
    if (finalUpstreamOid !== expectedUpstreamOid) {
      return { pushed: false, reason: 'remote-changed' };
    }
    const unsafeAfterCommit = await findUnsafeAhead(git, projectRoot, expectedUpstreamOid);
    if (unsafeAfterCommit) {
      return { pushed: false, reason: `unsafe-ahead: ${unsafeAfterCommit}` };
    }
    if (!await isAncestor(git, projectRoot, expectedUpstreamOid, intendedCommit)) {
      return { pushed: false, reason: 'upstream-not-ancestor' };
    }
    const checkedHead = firstLine((await git(projectRoot, ['rev-parse', 'HEAD'])).stdout);
    if (!await isAncestor(git, projectRoot, intendedCommit, checkedHead)) {
      return { pushed: false, reason: 'head-moved' };
    }
    const pushed = await git(
      projectRoot,
      [
        'push', '--porcelain',
        `--force-with-lease=${mergeRef}:${expectedUpstreamOid}`,
        '--', remote, `${intendedCommit}:${mergeRef}`,
      ],
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

async function serializeForRoot(projectRoot, operation) {
  const previous = syncTails.get(projectRoot) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  syncTails.set(projectRoot, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (syncTails.get(projectRoot) === current) syncTails.delete(projectRoot);
  }
}

export function createMetadataGitSync({ runProcess = execFileAsync } = {}) {
  return async (options) => {
    let resolvedProjectRoot;
    try {
      resolvedProjectRoot = await realpath(options.projectRoot);
    } catch (error) {
      return { pushed: false, reason: failureReason(error) };
    }
    return serializeForRoot(
      resolvedProjectRoot,
      () => runMetadataGitSync(
        { ...options, projectRoot: resolvedProjectRoot },
        runProcess,
      ),
    );
  };
}

export const syncMetadataGit = createMetadataGitSync();
