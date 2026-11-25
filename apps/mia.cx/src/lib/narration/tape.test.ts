import { describe, expect, it } from 'vitest';
import { STEPS, timeStretch, travel, winding } from './tape';

const RATE = 48000;
const tone = (hz: number, seconds: number) =>
    Float32Array.from({ length: seconds * RATE }, (_, i) => Math.sin((2 * Math.PI * hz * i) / RATE));
/** A tone's frequency, from how often it crosses zero going up, away from the edges. */
const pitch = (data: Float32Array) => {
    const middle = data.subarray(RATE / 10, data.length - RATE / 10);
    let ups = 0;
    for (let i = 1; i < middle.length; i++) if (middle[i - 1] < 0 && middle[i] >= 0) ups++;
    return ups / (middle.length / RATE);
};

describe('time stretch', () => {
    it.each([1.5, 2, 2.5])('speeds a tone up %s× without moving its pitch', (factor) => {
        const [sped] = timeStretch([tone(220, 2)], factor, RATE);
        expect(sped.length).toBe(Math.ceil((2 * RATE) / factor));
        expect(pitch(sped)).toBeCloseTo(220, -1);
    });
});

describe('a wind', () => {
    it.each([
        ['clipped by the start of the tape', 2, 1.2],
        ['far past the straight line', 2, 12],
        ['barely moving', 1, 0.05],
    ])('%s ends at the reader’s speed and covers its distance', (_, speed, distance) => {
        const rates = winding(speed, speed, distance, 1.2);
        expect(rates[0]).toBeCloseTo(speed);
        expect(rates[STEPS]).toBeCloseTo(speed);
        expect(Math.min(...rates)).toBeGreaterThanOrEqual(0);
        expect(travel(rates, 1.2)).toBeCloseTo(distance, 1);
    });
});
