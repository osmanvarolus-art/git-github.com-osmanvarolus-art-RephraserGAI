import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive } from '../codexThreads.ts';

test('env-style secrets are redacted, key name kept', () => {
  for (const line of ['DB_PASSWORD=hunter2', 'GEMINI_API_KEY=AIzaSyA1b2C3d4E5f6G7h8', 'GITHUB_TOKEN=abcdef123456', 'CLIENT_SECRET: "s3cr3t-value"']) {
    const out = redactSensitive(line);
    assert.match(out, /\[credential redacted\]/, line);
    assert.doesNotMatch(out, /hunter2|AIzaSy|abcdef123456|s3cr3t-value/, line);
  }
});

test('ordinary prose with Basic or Bearer is left alone', () => {
  assert.equal(redactSensitive('Basic setup is done'), 'Basic setup is done');
  assert.equal(redactSensitive('a basic idea'), 'a basic idea');
});

test('a real bearer token is redacted', () => {
  assert.match(redactSensitive('Authorization: Bearer abcdef0123456789abcdef'), /\[credential redacted\]/);
});
