import { describe, expect, it } from 'vitest';
import { POST_KINDS } from './pipeline';
import { RGB_COLOUR_KINDS } from './colour-effects';
import {
    WEBGL2_FRAGMENT_SOURCE,
    WEBGL2_STARTUP_SCALE,
    WEBGL2_SUPPORTED_COLOUR,
    WEBGL2_SUPPORTED_POST,
} from './webgl2-renderer';
import * as shaders from './webgl2-shaders';

describe('WebGL2 parity backend', () => {
    it('uses the canonical translated multipass shader inventory', () => {
        expect(WEBGL2_STARTUP_SCALE).toBe(0.5);
        expect(WEBGL2_FRAGMENT_SOURCE).toBe(shaders.BASE);
        expect(Object.keys(shaders).sort()).toEqual(
            [
                'BASE',
                'BLOOM_BLUR',
                'BLOOM_EXTRACT',
                'BLUR',
                'COLOUR_EFFECT',
                'DISPLAY',
                'GOD_RAYS',
                'LUT',
                'MATERIALIZE',
                'OCTAVE',
                'POST_EFFECT',
                'PRESENT',
            ].sort(),
        );
        for (const source of Object.values(shaders)) {
            expect(source).toContain('#version 300 es');
            expect(source).toContain('void main()');
        }
    });

    it('covers every schema post effect and reports none unsupported', () => {
        expect([...WEBGL2_SUPPORTED_POST]).toEqual(POST_KINDS);
        expect(WEBGL2_SUPPORTED_POST.size).toBe(25);
    });

    it('covers adjustments, grade, every RGB effect, and LUT', () => {
        expect([...WEBGL2_SUPPORTED_COLOUR].sort()).toEqual(
            [...RGB_COLOUR_KINDS, 'curve', 'levels', 'hsl', 'colour-grade'].sort(),
        );
    });
});
