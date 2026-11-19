import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrganizerImages } from '../apps/web/src/organizer-images.ts';

test('el panel comparte una descarga y reemplaza la imagen tras guardar', async t => {
  const nativeFetch = globalThis.fetch;
  const fetch = t.mock.method(globalThis, 'fetch', async (..._args: Parameters<typeof globalThis.fetch>) => new Response('crest', {
    headers: { 'Content-Type': 'image/webp' },
  }));
  const images = createOrganizerImages();
  const path = '/api/v1/organizations/org/teams/team/shield';
  try {
    const [first, second] = await Promise.all([images.load(path), images.load(path)]);
    assert.ok(first);
    assert.equal(second, first);
    assert.equal(await images.load(path), first);
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(fetch.mock.calls[0].arguments[0], `${path}?size=128`);
    assert.equal(fetch.mock.calls[0].arguments[1]?.cache, 'no-store');

    images.invalidate(path);
    assert.equal(images.peek(path), undefined);
    await assert.rejects(nativeFetch(first));
    assert.notEqual(await images.load(path), first);
    assert.equal(fetch.mock.callCount(), 2);
  } finally {
    images.clear();
  }
});

test('cambiar de sesión descarta una imagen que aún se está descargando', async t => {
  let respond!: (response: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { respond = resolve; }));
  const images = createOrganizerImages();
  const path = '/api/v1/organizations/org/logo';
  const loading = images.load(path);
  images.clear();
  respond(new Response('logo', {headers: {'Content-Type': 'image/webp'}}));
  assert.equal(await loading, undefined);
  assert.equal(images.peek(path), undefined);
});
