import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as gitSyncModule from '../server/git-sync.mjs';

const execFileAsync = promisify(execFile);
const { syncMetadataGit } = gitSyncModule;
const REDIRECT_ENV_KEYS = new Set([
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

function sanitizedTestGitEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      REDIRECT_ENV_KEYS.has(key)
      || /^GIT_CONFIG_(?:KEY|VALUE)_/.test(key)
    ) delete env[key];
  }
  env.GIT_CONFIG_GLOBAL = os.devNull;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', [
    '-c', `core.hooksPath=${os.devNull}`,
    '-c', 'commit.gpgSign=false',
    '-C', cwd,
    ...args,
  ], {
    encoding: 'utf8',
    env: sanitizedTestGitEnv(),
  });
  return stdout.trim();
}

async function bareGit(gitDir, ...args) {
  const { stdout } = await execFileAsync('git', [
    '-c', `core.hooksPath=${os.devNull}`,
    '-c', 'commit.gpgSign=false',
    `--git-dir=${gitDir}`,
    ...args,
  ], {
    encoding: 'utf8',
    env: sanitizedTestGitEnv(),
  });
  return stdout.trim();
}

async function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-git-sync-'));
  const work = path.join(root, 'work');
  const remote = path.join(root, 'remote.git');
  await mkdir(work);
  await git(root, 'init', '--bare', '--template=', '--initial-branch=main', remote);
  await git(root, 'init', '--template=', '--initial-branch=main', work);
  await git(work, 'config', 'user.name', 'Fixture User');
  await git(work, 'config', 'user.email', 'fixture@example.com');
  await write(work, 'data/skills.json', '{"version":1}\n');
  await write(work, 'notes.txt', 'base notes\n');
  await write(work, 'draft.txt', 'base draft\n');
  await git(work, 'add', '.');
  await git(work, 'commit', '-m', 'initial');
  await git(work, 'remote', 'add', 'origin', remote);
  await git(work, 'push', '-u', 'origin', 'main');
  const baseSha = await git(work, 'rev-parse', 'HEAD');

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  return { root, work, remote, baseSha };
}

function syncWith(syncFunction, work) {
  return syncFunction({
    projectRoot: work,
    gitName: 'SkillHub Bot',
    gitEmail: 'skills-bot@users.noreply.github.com',
    commitMessage: 'auto-sync: metadata test',
  });
}

function sync(work) {
  return syncWith(syncMetadataGit, work);
}

test('exposes a sync factory for isolated process execution', () => {
  assert.equal(typeof gitSyncModule.createMetadataGitSync, 'function');
});

test('commits only data/skills.json while preserving unrelated staged and unstaged work', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  await write(fixture.work, 'notes.txt', 'staged user notes\n');
  await git(fixture.work, 'add', 'notes.txt');
  await write(fixture.work, 'draft.txt', 'unstaged user draft\n');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, true);
  assert.equal(await git(fixture.work, 'diff', '--cached', '--name-only'), 'notes.txt');
  assert.equal(await git(fixture.work, 'diff', '--name-only'), 'draft.txt');
  const remoteHead = await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main');
  assert.equal(remoteHead, result.commit);
  assert.equal(
    await bareGit(fixture.remote, 'diff-tree', '--no-commit-id', '--name-only', '-r', remoteHead),
    'data/skills.json',
  );
  assert.equal(await bareGit(fixture.remote, 'show', 'main:notes.txt'), 'base notes');
  assert.equal(await bareGit(fixture.remote, 'show', 'main:draft.txt'), 'base draft');
});

test('refuses an unrelated local commit ahead without moving the remote', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'notes.txt', 'committed user notes\n');
  await git(fixture.work, 'add', 'notes.txt');
  await git(fixture.work, 'commit', '-m', 'user: unrelated local work');
  const userCommit = await git(fixture.work, 'rev-parse', 'HEAD');
  const remoteBefore = await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, false);
  assert.match(result.reason, /unsafe-ahead/);
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), userCommit);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), remoteBefore);
  assert.equal(await git(fixture.work, 'status', '--short', '--', 'data/skills.json'), 'M data/skills.json');
});

test('pushes a metadata-only ahead commit from a prior failed push with the new metadata commit', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  await git(fixture.work, 'add', 'data/skills.json');
  await git(fixture.work, 'commit', '-m', 'auto-sync: prior metadata update');
  await write(fixture.work, 'data/skills.json', '{"version":3}\n');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, true);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), result.commit);
  assert.equal(
    await bareGit(fixture.remote, 'rev-list', '--count', `${fixture.baseSha}..refs/heads/main`),
    '2',
  );
  assert.equal(await bareGit(fixture.remote, 'show', 'main:data/skills.json'), '{"version":3}');
  const pushedPaths = (await bareGit(
    fixture.remote,
    'log', '--format=', '--name-only', `${fixture.baseSha}..refs/heads/main`,
  )).split('\n').filter(Boolean);
  assert.deepEqual(pushedPaths, ['data/skills.json', 'data/skills.json']);
});

test('retries a clean metadata-only ahead commit without creating an empty commit', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  await git(fixture.work, 'add', 'data/skills.json');
  await git(fixture.work, 'commit', '-m', 'auto-sync: prior failed metadata push');
  const intendedCommit = await git(fixture.work, 'rev-parse', 'HEAD');
  assert.equal(await git(fixture.work, 'status', '--short'), '');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, true);
  assert.equal(result.commit, intendedCommit);
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), intendedCommit);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), intendedCommit);
  assert.equal(
    await bareGit(fixture.remote, 'rev-list', '--count', `${fixture.baseSha}..refs/heads/main`),
    '1',
  );
});

test('returns no-change without committing or pushing when metadata is unchanged', async (t) => {
  const fixture = await createFixture(t);
  const localBefore = await git(fixture.work, 'rev-parse', 'HEAD');
  const remoteBefore = await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main');

  const result = await sync(fixture.work);

  assert.deepEqual(result, { pushed: false, reason: 'no-change' });
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), localBefore);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), remoteBefore);
});

test('fails safely before committing when the current branch has no upstream', async (t) => {
  const fixture = await createFixture(t);
  await git(fixture.work, 'branch', '--unset-upstream');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const localBefore = await git(fixture.work, 'rev-parse', 'HEAD');

  const result = await sync(fixture.work);

  assert.deepEqual(result, { pushed: false, reason: 'no-upstream' });
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), localBefore);
  assert.equal(await git(fixture.work, 'status', '--short', '--', 'data/skills.json'), 'M data/skills.json');
});

test('does not recreate an upstream branch deleted before sync', async (t) => {
  const fixture = await createFixture(t);
  await bareGit(fixture.remote, 'update-ref', '-d', 'refs/heads/main');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const localBefore = await git(fixture.work, 'rev-parse', 'HEAD');

  const result = await sync(fixture.work);

  assert.deepEqual(result, { pushed: false, reason: 'remote-missing' });
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), localBefore);
  await assert.rejects(
    bareGit(fixture.remote, 'show-ref', '--verify', '--quiet', 'refs/heads/main'),
  );
});

test('reports remote-missing when the configured remote and tracking branches are both absent', async (t) => {
  const fixture = await createFixture(t);
  await bareGit(fixture.remote, 'update-ref', '-d', 'refs/heads/main');
  await git(fixture.work, 'update-ref', '-d', 'refs/remotes/origin/main');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const localBefore = await git(fixture.work, 'rev-parse', 'HEAD');

  const result = await sync(fixture.work);

  assert.deepEqual(result, { pushed: false, reason: 'remote-missing' });
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), localBefore);
  await assert.rejects(
    bareGit(fixture.remote, 'show-ref', '--verify', '--quiet', 'refs/heads/main'),
  );
});

test('fetches and refuses before committing when the local branch is behind upstream', async (t) => {
  const fixture = await createFixture(t);
  const peer = path.join(fixture.root, 'peer');
  await git(fixture.root, 'clone', '--template=', fixture.remote, peer);
  await git(peer, 'config', 'user.name', 'Peer User');
  await git(peer, 'config', 'user.email', 'peer@example.com');
  await write(peer, 'remote-only.txt', 'remote work\n');
  await git(peer, 'add', 'remote-only.txt');
  await git(peer, 'commit', '-m', 'peer: remote work');
  await git(peer, 'push', 'origin', 'main');
  await git(fixture.work, 'fetch', '--prune', 'origin');
  const remoteHead = await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const localBefore = await git(fixture.work, 'rev-parse', 'HEAD');

  const result = await sync(fixture.work);

  assert.deepEqual(result, { pushed: false, reason: 'behind-upstream' });
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), localBefore);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), remoteHead);
  assert.equal(await git(fixture.work, 'status', '--short', '--', 'data/skills.json'), 'M data/skills.json');
});

test('inspects every merge parent so an ahead merge cannot hide unrelated paths', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'notes.txt', 'upstream notes\n');
  await git(fixture.work, 'add', 'notes.txt');
  await git(fixture.work, 'commit', '-m', 'upstream: notes');
  await git(fixture.work, 'push', 'origin', 'main');
  const upstreamHead = await git(fixture.work, 'rev-parse', 'HEAD');
  const upstreamTree = await git(fixture.work, 'rev-parse', 'HEAD^{tree}');
  const mergeCommit = await git(
    fixture.work,
    'commit-tree', upstreamTree,
    '-p', upstreamHead,
    '-p', fixture.baseSha,
    '-m', 'merge with hidden non-metadata path',
  );
  await git(fixture.work, 'update-ref', 'refs/heads/main', mergeCommit, upstreamHead);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, false);
  assert.match(result.reason, /unsafe-ahead: .* changes notes\.txt/);
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), mergeCommit);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), upstreamHead);
  assert.equal(await git(fixture.work, 'status', '--short', '--', 'data/skills.json'), 'M data/skills.json');
});

test('ignores replacement refs that disguise an unrelated ahead commit as metadata-only', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'notes.txt', 'unrelated committed notes\n');
  await git(fixture.work, 'add', 'notes.txt');
  await git(fixture.work, 'commit', '-m', 'user: unrelated ahead commit');
  const unrelatedCommit = await git(fixture.work, 'rev-parse', 'HEAD');

  await git(fixture.work, 'checkout', '--detach', fixture.baseSha);
  await write(fixture.work, 'data/skills.json', '{"version":1.5}\n');
  await git(fixture.work, 'add', 'data/skills.json');
  await git(fixture.work, 'commit', '-m', 'replacement metadata-only commit');
  const replacementCommit = await git(fixture.work, 'rev-parse', 'HEAD');
  await git(fixture.work, 'checkout', 'main');
  await git(fixture.work, 'replace', unrelatedCommit, replacementCommit);

  assert.equal(
    await git(
      fixture.work,
      'diff-tree', '--no-commit-id', '--name-only', '-r', unrelatedCommit,
    ),
    'data/skills.json',
  );
  assert.equal(
    await git(
      fixture.work,
      '--no-replace-objects',
      'diff-tree', '--no-commit-id', '--name-only', '-r', unrelatedCommit,
    ),
    'notes.txt',
  );
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const remoteBefore = await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, false);
  assert.match(result.reason, /unsafe-ahead: .* changes notes\.txt/);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), remoteBefore);
});

test('disables a malicious post-commit hook and pushes the exact metadata blob', async (t) => {
  const fixture = await createFixture(t);
  const hookPath = path.join(fixture.work, '.git', 'hooks', 'post-commit');
  const markerPath = path.join(fixture.root, 'hook-ran');
  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, `#!/bin/sh
set -eu
head="$(git rev-parse HEAD)"
git update-ref refs/heads/main "${fixture.baseSha}" "$head"
printf 'ran\\n' > "${markerPath}"
`);
  await chmod(hookPath, 0o755);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, true);
  await assert.rejects(access(markerPath));
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), result.commit);
  assert.equal(await bareGit(fixture.remote, 'show', 'main:data/skills.json'), '{"version":2}');
});

test('disables repository hooks while fetch updates remote-tracking refs', async (t) => {
  const fixture = await createFixture(t);
  const peer = path.join(fixture.root, 'peer-hook-fetch');
  await git(fixture.root, 'clone', '--template=', fixture.remote, peer);
  await git(peer, 'config', 'user.name', 'Peer User');
  await git(peer, 'config', 'user.email', 'peer@example.com');
  await write(peer, 'remote-hook-update.txt', 'peer update\n');
  await git(peer, 'add', 'remote-hook-update.txt');
  await git(peer, 'commit', '-m', 'peer: update for fetch hook');
  await git(peer, 'push', 'origin', 'main');

  const hookPath = path.join(fixture.work, '.git', 'hooks', 'reference-transaction');
  const markerPath = path.join(fixture.root, 'fetch-hook-ran');
  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, `#!/bin/sh
printf 'ran\\n' > "${markerPath}"
exit 0
`);
  await chmod(hookPath, 0o755);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');

  const result = await sync(fixture.work);

  assert.deepEqual(result, { pushed: false, reason: 'remote-changed' });
  await assert.rejects(access(markerPath));
});

test('sanitizes repository and index redirection variables before every Git command', async (t) => {
  const fixture = await createFixture(t);
  const decoy = path.join(fixture.root, 'decoy');
  await mkdir(decoy);
  await git(fixture.root, 'init', '--template=', '--initial-branch=main', decoy);
  await git(decoy, 'config', 'user.name', 'Decoy User');
  await git(decoy, 'config', 'user.email', 'decoy@example.com');
  await write(decoy, 'data/skills.json', '{"version":99}\n');
  await git(decoy, 'add', '.');
  await git(decoy, 'commit', '-m', 'decoy initial');
  const decoyHead = await git(decoy, 'rev-parse', 'HEAD');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');

  const contaminated = {
    GIT_DIR: path.join(decoy, '.git'),
    GIT_WORK_TREE: decoy,
    GIT_INDEX_FILE: path.join(decoy, '.git', 'index'),
  };
  const previous = new Map(Object.keys(contaminated).map((key) => [key, process.env[key]]));
  Object.assign(process.env, contaminated);
  let result;
  try {
    result = await sync(fixture.work);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(result.pushed, true);
  assert.equal(await bareGit(fixture.remote, 'show', 'main:data/skills.json'), '{"version":2}');
  assert.equal(await git(decoy, 'rev-parse', 'HEAD'), decoyHead);
  assert.equal(await readFile(path.join(decoy, 'data/skills.json'), 'utf8'), '{"version":99}\n');
});

test('removes every Git config override/count variable from subprocess environments', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const contaminated = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'alias.status',
    GIT_CONFIG_VALUE_0: '!false',
    GIT_CONFIG_KEY_SURPRISE: 'user.name',
    GIT_CONFIG_VALUE_SURPRISE: 'Contaminated User',
    GIT_CONFIG_GLOBAL: path.join(fixture.root, 'malicious-global-config'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_PARAMETERS: "'user.name=Contaminated User'",
  };
  const previous = new Map(Object.keys(contaminated).map((key) => [key, process.env[key]]));
  Object.assign(process.env, contaminated);
  const leaked = new Set();
  const isolatedSync = gitSyncModule.createMetadataGitSync({
    async runProcess(file, args, options) {
      for (const key of Object.keys(options.env)) {
        if (
          key === 'GIT_CONFIG_COUNT'
          || key === 'GIT_CONFIG_GLOBAL'
          || key === 'GIT_CONFIG_NOSYSTEM'
          || key === 'GIT_CONFIG_PARAMETERS'
          || /^GIT_CONFIG_(?:KEY|VALUE)_/.test(key)
        ) leaked.add(key);
      }
      return execFileAsync(file, args, options);
    },
  });
  let result;
  try {
    result = await syncWith(isolatedSync, fixture.work);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(result.pushed, true);
  assert.deepEqual([...leaked], []);
});

test('forces replacement-safe and literal-pathspec controls on every Git subprocess', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const contaminated = {
    GIT_REPLACE_REF_BASE: 'refs/malicious-replacements',
    GIT_NO_REPLACE_OBJECTS: '0',
    GIT_LITERAL_PATHSPECS: '0',
    GIT_GLOB_PATHSPECS: '1',
    GIT_NOGLOB_PATHSPECS: '1',
    GIT_ICASE_PATHSPECS: '1',
  };
  const previous = new Map(Object.keys(contaminated).map((key) => [key, process.env[key]]));
  Object.assign(process.env, contaminated);
  const unsafeInvocations = [];
  const isolatedSync = gitSyncModule.createMetadataGitSync({
    async runProcess(file, args, options) {
      if (
        !args.includes('--no-replace-objects')
        || options.env.GIT_NO_REPLACE_OBJECTS !== '1'
        || options.env.GIT_LITERAL_PATHSPECS !== '1'
        || options.env.GIT_REPLACE_REF_BASE !== undefined
        || options.env.GIT_GLOB_PATHSPECS !== undefined
        || options.env.GIT_NOGLOB_PATHSPECS !== undefined
        || options.env.GIT_ICASE_PATHSPECS !== undefined
      ) unsafeInvocations.push(args);
      return execFileAsync(file, args, options);
    },
  });
  let result;
  try {
    result = await syncWith(isolatedSync, fixture.work);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(result.pushed, true);
  assert.deepEqual(unsafeInvocations, []);
});

test('refuses when the exact upstream OID changes between the two fetch stages', async (t) => {
  const fixture = await createFixture(t);
  const peer = path.join(fixture.root, 'peer-between-fetches');
  await git(fixture.root, 'clone', '--template=', fixture.remote, peer);
  await git(peer, 'config', 'user.name', 'Peer User');
  await git(peer, 'config', 'user.email', 'peer@example.com');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  let fetchCount = 0;
  const isolatedSync = gitSyncModule.createMetadataGitSync({
    async runProcess(file, args, options) {
      if (file === 'git' && args.includes('fetch') && ++fetchCount === 2) {
        await write(peer, 'remote-between-fetches.txt', 'peer update\n');
        await git(peer, 'add', 'remote-between-fetches.txt');
        await git(peer, 'commit', '-m', 'peer: update between fetches');
        await git(peer, 'push', 'origin', 'main');
      }
      return execFileAsync(file, args, options);
    },
  });

  const result = await syncWith(isolatedSync, fixture.work);

  assert.deepEqual(result, { pushed: false, reason: 'remote-changed' });
  assert.equal(fetchCount, 2);
  assert.equal(
    await bareGit(fixture.remote, 'show', 'main:remote-between-fetches.txt'),
    'peer update',
  );
});

test('uses an exact lease so a remote rewind after the final fetch cannot be overwritten', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'data/skills.json', '{"version":1.5}\n');
  await git(fixture.work, 'add', 'data/skills.json');
  await git(fixture.work, 'commit', '-m', 'upstream metadata baseline');
  await git(fixture.work, 'push', 'origin', 'main');
  const expectedOid = await git(fixture.work, 'rev-parse', 'HEAD');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  let pushArgs;
  const isolatedSync = gitSyncModule.createMetadataGitSync({
    async runProcess(file, args, options) {
      if (file === 'git' && args.includes('push')) {
        pushArgs = args;
        await bareGit(
          fixture.remote,
          'update-ref', 'refs/heads/main', fixture.baseSha, expectedOid,
        );
      }
      return execFileAsync(file, args, options);
    },
  });

  const result = await syncWith(isolatedSync, fixture.work);

  assert.equal(result.pushed, false);
  assert.ok(pushArgs.includes(`--force-with-lease=refs/heads/main:${expectedOid}`));
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), fixture.baseSha);
});

test('refuses a remote rewind detected by comparing pre-fetch and fetched tracking OIDs', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'data/skills.json', '{"version":1.5}\n');
  await git(fixture.work, 'add', 'data/skills.json');
  await git(fixture.work, 'commit', '-m', 'previously pushed metadata');
  await git(fixture.work, 'push', 'origin', 'main');
  const trackedBeforeFetch = await git(fixture.work, 'rev-parse', 'refs/remotes/origin/main');
  await bareGit(
    fixture.remote,
    'update-ref', 'refs/heads/main', fixture.baseSha, trackedBeforeFetch,
  );
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const localBefore = await git(fixture.work, 'rev-parse', 'HEAD');

  const result = await sync(fixture.work);

  assert.deepEqual(result, { pushed: false, reason: 'remote-changed' });
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), localBefore);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), fixture.baseSha);
});

test('serializes overlapping syncs per resolved project root without blocking another root', async (t) => {
  const firstFixture = await createFixture(t);
  const otherFixture = await createFixture(t);
  await write(firstFixture.work, 'data/skills.json', '{"version":2}\n');
  await write(otherFixture.work, 'data/skills.json', '{"version":2}\n');
  const firstRoot = await realpath(firstFixture.work);
  const otherRoot = await realpath(otherFixture.work);

  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let signalFirstEntered;
  const firstEntered = new Promise((resolve) => { signalFirstEntered = resolve; });
  let signalOtherEntered;
  const otherEntered = new Promise((resolve) => { signalOtherEntered = resolve; });
  const statusCalls = new Map();
  const isolatedSync = gitSyncModule.createMetadataGitSync({
    async runProcess(file, args, options) {
      if (file === 'git' && args.includes('status')) {
        const root = await realpath(args[1]);
        const count = (statusCalls.get(root) || 0) + 1;
        statusCalls.set(root, count);
        if (root === firstRoot && count === 1) {
          signalFirstEntered();
          await firstGate;
        }
        if (root === otherRoot) signalOtherEntered();
      }
      return execFileAsync(file, args, options);
    },
  });

  const first = syncWith(isolatedSync, firstFixture.work);
  await firstEntered;
  const overlapping = syncWith(isolatedSync, firstFixture.work);
  const unrelated = syncWith(isolatedSync, otherFixture.work);
  const otherRanBeforeRelease = await Promise.race([
    otherEntered.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 150)),
  ]);
  const sameRootCallsBeforeRelease = statusCalls.get(firstRoot);
  releaseFirst();
  await Promise.all([first, overlapping, unrelated]);

  assert.equal(sameRootCallsBeforeRelease, 1);
  assert.equal(otherRanBeforeRelease, true);
});

test('applies the configured timeout to every Git subprocess', async (t) => {
  const fixture = await createFixture(t);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const observedTimeouts = new Set();
  const isolatedSync = gitSyncModule.createMetadataGitSync({
    async runProcess(file, args, options) {
      observedTimeouts.add(options.timeout);
      return execFileAsync(file, args, options);
    },
  });

  const result = await isolatedSync({
    projectRoot: fixture.work,
    gitName: 'SkillHub Bot',
    gitEmail: 'skills-bot@users.noreply.github.com',
    commitMessage: 'auto-sync: metadata test',
    timeout: 4321,
  });

  assert.equal(result.pushed, true);
  assert.deepEqual([...observedTimeouts], [4321]);
});

test('refuses an ahead commit that has no metadata path change', async (t) => {
  const fixture = await createFixture(t);
  await git(fixture.work, 'commit', '--allow-empty', '-m', 'user: empty checkpoint');
  const localBefore = await git(fixture.work, 'rev-parse', 'HEAD');
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, false);
  assert.match(result.reason, /unsafe-ahead/);
  assert.equal(await git(fixture.work, 'rev-parse', 'HEAD'), localBefore);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), fixture.baseSha);
});
