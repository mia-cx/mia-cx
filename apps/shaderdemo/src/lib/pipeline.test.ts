import { describe, expect, it } from 'vitest';
import { defaultParameters } from './renderer';
import {
    colourSegments,
    createColour,
    createPost,
    migratePost,
    moveById,
    POST_KINDS,
    removeById,
    rendererStagePlan,
    toggleById,
} from './pipeline';

describe('ordered pipeline helpers', () => {
    it('moves, toggles, removes, and allocates stable occurrence IDs', () => {
        const p = defaultParameters();
        p.bloomEnabled = 1;
        p.bloomIntensity = 1;
        const items = migratePost(p);
        const moved = moveById(items, items[1].id, -1);
        expect(moved[0].type).toBe('bloom');
        expect(toggleById(moved, moved[0].id)[0].enabled).toBe(false);
        expect(removeById(moved, moved[0].id)).toHaveLength(POST_KINDS.length - 1);
        expect(createPost('bloom', [...items, createPost('bloom', items)]).id).toBe('post:bloom:2');
    });
    it('builds the exact enabled, non-neutral renderer order', () => {
        const p = defaultParameters();
        p.bloomIntensity = 1;
        p.sharpen = 0.2;
        const items = migratePost(p).map((x) => ({ ...x, enabled: x.type === 'bloom' || x.type === 'sharpen' }));
        expect(rendererStagePlan(items.reverse(), p).map((x) => x.kind)).toEqual(['sharpen', 'bloom']);
    });
    it('fuses only adjacent active vignette and film grain, preserving order and barriers', () => {
        const p = defaultParameters();
        p.vignetteAmount = p.filmGrainAmount = p.sharpen = 1;
        const item = (type: 'vignette' | 'film-grain' | 'sharpen', n: number) => ({
            id: `${type}-${n}`,
            type,
            enabled: true,
        });
        expect(rendererStagePlan([item('vignette', 1), item('film-grain', 1)], p)).toMatchObject([
            { kind: 'fused-vignette-film-grain', label: 'post:fused [vignette #1 + film-grain #1]' },
        ]);
        expect(rendererStagePlan([item('film-grain', 1), item('vignette', 1)], p)[0].kind).toBe(
            'fused-film-grain-vignette',
        );
        expect(
            rendererStagePlan([item('vignette', 1), item('sharpen', 1), item('film-grain', 1)], p).map((x) => x.kind),
        ).toEqual(['vignette', 'sharpen', 'film-grain']);
    });
    it('segments scalar runs without moving them across RGB materialization', () => {
        const stack = [
            createColour('curve', 'curve-a'),
            createColour('levels', 'levels-a'),
            createColour('posterize', 'posterize-a'),
            createColour('hsl', 'hsl-a'),
            createColour('channel-mixer', 'mixer-a'),
        ];
        expect(
            colourSegments(stack).map((segment) =>
                segment.type === 'scalar' ? segment.effects.map((effect) => effect.type) : segment.effect.type,
            ),
        ).toEqual([['curve', 'levels'], 'posterize', ['hsl'], 'channel-mixer']);
    });
});
