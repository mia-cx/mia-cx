import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReleaseMerge } from './release-merge.mjs';

const sha = 'a'.repeat(40);
const repository = 'mia-cx/mia-cx';
const release = {
	merged_at: '2026-10-29T00:00:00Z',
	merge_commit_sha: sha,
	base: { ref: 'main' },
	head: { ref: 'changeset-release/main', repo: { full_name: repository } }
};

test('only a merged release pull request from this repository deploys its own merge commit to production', () => {
	const cases = [
		['the merged release pull request', release, true],
		['an unmerged release pull request', { ...release, merged_at: null }, false],
		['a different merge commit', { ...release, merge_commit_sha: 'b'.repeat(40) }, false],
		[
			'a release branch from a fork',
			{ ...release, head: { ...release.head, repo: { full_name: 'fork/mia-cx' } } },
			false
		],
		[
			'an ordinary feature branch',
			{ ...release, head: { ...release.head, ref: 'feat/anything' } },
			false
		],
		['a release merged into another branch', { ...release, base: { ref: 'staging' } }, false]
	];
	for (const [name, pr, expected] of cases)
		assert.equal(isReleaseMerge([pr], { sha, repository }), expected, name);
});
