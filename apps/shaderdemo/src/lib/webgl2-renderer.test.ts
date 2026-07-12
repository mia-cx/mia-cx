import { describe, expect, it } from 'vitest';
import { WEBGL2_FRAGMENT_SOURCE, WEBGL2_STARTUP_SCALE, WEBGL2_SUPPORTED_POST } from './webgl2-renderer';

describe('WebGL2 fallback', () => {
    it('starts conservatively and contains the canonical ordered scene stages', () => {
        expect(WEBGL2_STARTUP_SCALE).toBe(0.5);
        const main = WEBGL2_FRAGMENT_SOURCE.indexOf('void main()');
        const field = WEBGL2_FRAGMENT_SOURCE.indexOf('field(q', main);
        const colour = WEBGL2_FRAGMENT_SOURCE.indexOf('palette(', main);
        const post = WEBGL2_FRAGMENT_SOURCE.indexOf('float glow', main);
        expect(field).toBeLessThan(colour);
        expect(colour).toBeLessThan(post);
        expect(WEBGL2_FRAGMENT_SOURCE).toContain('chromatic/resolution.x');
    });

    it('declares only intentional canonical post support', () => {
        expect([...WEBGL2_SUPPORTED_POST]).toEqual(['glow', 'chromatic-aberration']);
        expect(WEBGL2_SUPPORTED_POST.has('datamosh')).toBe(false);
    });
});
