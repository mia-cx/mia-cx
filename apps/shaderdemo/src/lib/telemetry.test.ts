import { describe, expect, it } from 'vitest';
import type { GpuTimingStats } from './renderer';
import { FrameTelemetry, GpuTelemetry } from './telemetry';

const gpu = (totalMs: number, baseMs = totalMs / 4): GpuTimingStats => ({
    totalMs,
    fieldMs: baseMs,
    colourMs: totalMs / 8,
    lightingMs: totalMs / 8,
    postMs: totalMs / 8,
    octavesMs: totalMs / 4,
    presentMs: totalMs / 8,
    baseMs,
    blurMs: totalMs / 4,
    octaveMs: totalMs / 4,
    displayMs: totalMs / 4,
    passes: [],
});

describe('rolling frame telemetry', () => {
    it('calculates FPS windows and RMS from rendered-frame intervals', () => {
        const telemetry = new FrameTelemetry();
        [0, 10, 30, 60].forEach((timestamp) => telemetry.recordRenderedFrame(timestamp));
        const summary = telemetry.summary(60);
        expect(summary.windows[500]).toEqual({ fps: 50, sampleCount: 3 });
        expect(summary.windows[2000]).toEqual({ fps: 50, sampleCount: 3 });
        expect(summary.rms2sMs).toBeCloseTo(Math.sqrt((100 + 400 + 900) / 3));
    });

    it('warms without NaN and excludes samples older than each real-time window', () => {
        const telemetry = new FrameTelemetry();
        telemetry.recordRenderedFrame(0);
        expect(telemetry.summary(0).windows[500]).toBeUndefined();
        telemetry.recordRenderedFrame(100);
        telemetry.recordRenderedFrame(1_900);
        const summary = telemetry.summary(2_000);
        expect(summary.windows[500]?.sampleCount).toBe(1);
        expect(summary.windows[2000]?.sampleCount).toBe(2);
        expect(summary.windows[10000]?.sampleCount).toBe(2);
    });

    it('reset prevents a paused gap from becoming a frame interval', () => {
        const telemetry = new FrameTelemetry();
        telemetry.recordRenderedFrame(0);
        telemetry.recordRenderedFrame(16);
        telemetry.reset();
        telemetry.recordRenderedFrame(10_000);
        expect(telemetry.summary(10_000).rms2sMs).toBeUndefined();
        telemetry.recordRenderedFrame(10_020);
        expect(telemetry.summary(10_020).rms2sMs).toBe(20);
    });

    it('stays bounded under high frame rates', () => {
        const telemetry = new FrameTelemetry();
        for (let timestamp = 0; timestamp < 20_000; timestamp++) telemetry.recordRenderedFrame(timestamp);
        expect(telemetry.sampleCount).toBeLessThanOrEqual(1_800);
    });
});

describe('rolling GPU telemetry', () => {
    it('means every semantic field and computes five-second total RMS', () => {
        const telemetry = new GpuTelemetry();
        telemetry.record(0, gpu(10, 1));
        telemetry.record(1_000, gpu(20, 3));
        const summary = telemetry.summary(1_000);
        expect(summary.windows[1000]).toMatchObject({ totalMs: 15, fieldMs: 2, octavesMs: 3.75 });
        expect(summary.windows[5000]).toMatchObject({ totalMs: 15, fieldMs: 2 });
        expect(summary.rms5sMs).toBeCloseTo(Math.sqrt(250));
    });

    it('shows available warm-up windows and prunes old samples', () => {
        const telemetry = new GpuTelemetry();
        telemetry.record(0, gpu(10));
        telemetry.record(29_500, gpu(30));
        const summary = telemetry.summary(30_000);
        expect(summary.windows[1000]?.totalMs).toBe(30);
        expect(summary.windows[5000]?.totalMs).toBe(30);
        expect(summary.windows[30000]?.totalMs).toBe(20);
        expect(telemetry.summary(30_001).windows[30000]?.totalMs).toBe(30);
    });

    it('averages passes over five seconds in the latest execution order', () => {
        const telemetry = new GpuTelemetry();
        telemetry.record(0, {
            ...gpu(10),
            passes: [
                { label: 'base', ms: 2 },
                { label: 'display', ms: 1 },
            ],
        });
        telemetry.record(1_000, {
            ...gpu(20),
            passes: [
                { label: 'base', ms: 4 },
                { label: 'lighting:god-rays', ms: 6 },
                { label: 'display', ms: 3 },
            ],
        });
        expect(telemetry.summary(1_000).perPass5s).toEqual([
            { label: 'base', ms: 3 },
            { label: 'lighting:god-rays', ms: 6 },
            { label: 'display', ms: 2 },
        ]);
    });
});
