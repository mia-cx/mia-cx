import { describe, expect, test, vi } from 'vitest';
import { cv } from '$lib/cv/content';
import { load } from './+page.server';

const presets = { 'support-lead': JSON.stringify({ title: 'Support Lead' }) };
const kv = { get: vi.fn(async (key: string) => presets[key as keyof typeof presets] ?? null) };
const visit = (query: string) =>
    load({ url: new URL(`https://mia.cx/cv${query}`), platform: { env: { CV_PRESETS: kv } } } as never) as Promise<{
        cv: typeof cv;
        theme: string;
        role: string | null;
    }>;

describe('/cv', () => {
    test('a role key looks its preset up in KV', async () => {
        const page = await visit('?role=support-lead&theme=colour');
        expect(page).toMatchObject({ role: 'support-lead', theme: 'colour', cv: { ...cv, title: 'Support Lead' } });
    });

    test('an unknown role gives the default CV in Print', async () => {
        expect(await visit('?role=astronaut')).toMatchObject({ cv, theme: 'print' });
    });

    test('a failed KV read gives the default CV', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        kv.get.mockRejectedValueOnce(new Error('KV GET failed: 500'));
        expect(await visit('?role=support-lead')).toMatchObject({ cv });
    });

    test('a key that is not a role key is never looked up', async () => {
        kv.get.mockClear();
        expect(await visit('?role=../../etc')).toMatchObject({ cv, role: null });
        expect(kv.get).not.toHaveBeenCalled();
    });
});
