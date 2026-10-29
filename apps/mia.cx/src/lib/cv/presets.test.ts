import { describe, expect, test } from 'vitest';
import { cv } from './content';
import { resolveCV } from './presets';

describe('role presets', () => {
    test.each([
        ['no value, as for a missing or unknown key', null],
        ['an empty value', ''],
        ['a value that is not JSON', 'Support Lead'],
        ['a preset without a title', '{"skills":[{"area":"Support","items":"TopDesk"}]}'],
        ['a blank title', '{"title":"  "}'],
        ['a title that is not text', '{"title":5}'],
        ['skills that are not a list', '{"title":"Support Lead","skills":"TopDesk"}'],
        ['an empty skills list', '{"title":"Support Lead","skills":[]}'],
        ['a malformed skill', '{"title":"Support Lead","skills":[{"area":"Support"}]}'],
    ])('falls back to the default CV for %s', (_, raw) => {
        expect(resolveCV(raw)).toEqual(cv);
    });

    test('a valid preset replaces the title and nothing else', () => {
        expect(resolveCV('{"title":"Support Lead"}')).toEqual({ ...cv, title: 'Support Lead' });
    });

    test('a preset with skills replaces the title and the skills', () => {
        const skills = [{ area: 'Support', items: 'TopDesk, Excel' }];
        expect(resolveCV(JSON.stringify({ title: 'Support Lead', skills, about: ['ignored'] }))).toEqual({
            ...cv,
            title: 'Support Lead',
            skills,
        });
    });
});
