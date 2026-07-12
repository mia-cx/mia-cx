import { describe, expect, it } from 'vitest';
import { PRESENT_SHADER_SOURCE } from './renderer';

describe('native-resolution present anti-aliasing', () => {
    it('uses source texel dimensions, edge luma, and preserves flat pixels', () => {
        expect(PRESENT_SHADER_SOURCE).toContain('textureDimensions(src)');
        expect(PRESENT_SHADER_SOURCE).toContain('fn luma');
        expect(PRESENT_SHADER_SOURCE).toContain('if(range<');
        expect(PRESENT_SHADER_SOURCE).toContain('return vec4f(rgbM,1.)');
        expect(PRESENT_SHADER_SOURCE.match(/textureSample\(src/g)?.length).toBeGreaterThanOrEqual(9);
    });
});
