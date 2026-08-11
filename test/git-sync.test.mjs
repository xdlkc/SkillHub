import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncMetadataGit } from '../server/git-sync.mjs';

const execFileAsync = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
  });
  return stdout.trim();
}

async function bareGit(gitDir, ...args) {
  const { stdout } = await execFileAsync('git', [`--git-dir=${gitDir}`, ...args], {
    encoding: 'utf8',
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
  await git(root, 'init', '--bare', '--initial-branch=main', remote);
  await git(root, 'init', '--initial-branch=main', work);
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

function sync(work) {
  return syncMetadataGit({
    projectRoot: work,
    gitName: 'SKILLS-INDEX Bot',
    gitEmail: 'skills-bot@users.noreply.github.com',
    commitMessage: 'auto-sync: metadata test',
  });
}

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

test('fetches and refuses before committing when the local branch is behind upstream', async (t) => {
  const fixture = await createFixture(t);
  const peer = path.join(fixture.root, 'peer');
  await git(fixture.root, 'clone', fixture.remote, peer);
  await git(peer, 'config', 'user.name', 'Peer User');
  await git(peer, 'config', 'user.email', 'peer@example.com');
  await write(peer, 'remote-only.txt', 'remote work\n');
  await git(peer, 'add', 'remote-only.txt');
  await git(peer, 'commit', '-m', 'peer: remote work');
  await git(peer, 'push', 'origin', 'main');
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

test('rechecks ahead history after committing and refuses concurrent unrelated HEAD movement', async (t) => {
  const fixture = await createFixture(t);
  const hookPath = path.join(fixture.work, '.git', 'hooks', 'post-commit');
  await writeFile(hookPath, `#!/bin/sh
set -eu
repo="$(git rev-parse --show-toplevel)"
head="$(git rev-parse HEAD)"
printf 'concurrent user work\\n' > "$repo/notes.txt"
git add notes.txt
tree="$(git write-tree)"
commit="$(printf 'concurrent user commit\\n' | git commit-tree "$tree" -p "$head")"
git update-ref refs/heads/main "$commit" "$head"
`);
  await chmod(hookPath, 0o755);
  await write(fixture.work, 'data/skills.json', '{"version":2}\n');
  const remoteBefore = await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main');

  const result = await sync(fixture.work);

  assert.equal(result.pushed, false);
  assert.match(result.reason, /unsafe-ahead: .* changes notes\.txt/);
  assert.notEqual(await git(fixture.work, 'rev-parse', 'HEAD'), remoteBefore);
  assert.equal(await bareGit(fixture.remote, 'rev-parse', 'refs/heads/main'), remoteBefore);
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
