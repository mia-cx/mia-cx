import { describe, expect, test } from 'vitest';
import { cacheKey, digest, pdfDate, pdfFilename } from './pdf';

describe('/cv.pdf', () => {
    test('is named for the day it was made', () => {
        expect(pdfFilename(pdfDate(new Date('2026-10-29T23:30:00Z')))).toBe('MiaRiezebos_CV_2026-10-29.pdf');
    });

    test('caches one render per day, Theme, role and preset value', async () => {
        const base = {
            date: '2026-10-29',
            theme: 'print',
            role: 'support-lead',
            preset: await digest('{"title":"A"}'),
        };
        const key = (changes = {}) => cacheKey('https://mia.cx', { ...base, ...changes }).url;
        expect(key()).toBe(key());
        expect(key({ date: '2026-10-30' })).not.toBe(key());
        expect(key({ theme: 'colour' })).not.toBe(key());
        expect(key({ role: null })).not.toBe(key());
        // Editing a preset in KV makes the next download a fresh render.
        expect(key({ preset: await digest('{"title":"B"}') })).not.toBe(key());
    });
});
