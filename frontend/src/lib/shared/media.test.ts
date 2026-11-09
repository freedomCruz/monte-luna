import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaUrl } from './media';

describe('mediaUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('joins a media key to the configured public base URL', () => {
    vi.stubEnv('PUBLIC_MEDIA_BASE_URL', 'https://media.example.test/');
    expect(mediaUrl('images/packaging-finca-el-mirador.webp')).toBe(
      'https://media.example.test/images/packaging-finca-el-mirador.webp',
    );
  });

  it('accepts a base without trailing slash and a key with leading slash', () => {
    vi.stubEnv('PUBLIC_MEDIA_BASE_URL', 'https://media.example.test');
    expect(mediaUrl('/images/photo-coffee-cherries.jpg')).toBe(
      'https://media.example.test/images/photo-coffee-cherries.jpg',
    );
  });

  it('falls back to same-origin paths when no base is configured', () => {
    vi.stubEnv('PUBLIC_MEDIA_BASE_URL', '');
    expect(mediaUrl('images/photo-coffee-cherries.jpg')).toBe('/images/photo-coffee-cherries.jpg');
  });
});
