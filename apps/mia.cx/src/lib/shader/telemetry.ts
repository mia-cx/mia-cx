import type { GpuTimingStats } from './renderer';

export const FRAME_WINDOWS_MS = [500, 2_000, 10_000] as const;
export const GPU_WINDOWS_MS = [1_000, 5_000, 30_000] as const;
export const INTERACTION_WINDOWS_MS = [1_000, 5_000, 30_000] as const;

export interface CursorInteractionSample {
    inputMs: number;
    rasterMs: number;
    decayMs: number;
    uploadSubmitMs: number;
    totalMs: number;
    pointCount: number;
    width: number;
    height: number;
}

export interface CursorInteractionRollingSummary {
    windows: Record<(typeof INTERACTION_WINDOWS_MS)[number], CursorInteractionSample | undefined>;
    rms5sMs?: number;
    latest?: Pick<CursorInteractionSample, 'pointCount' | 'width' | 'height'>;
}

export interface FrameWindowStats {
    fps: number;
    sampleCount: number;
}

export interface FrameRollingSummary {
    windows: Record<(typeof FRAME_WINDOWS_MS)[number], FrameWindowStats | undefined>;
    rms2sMs?: number;
}

export type GpuMeanStats = Pick<
    GpuTimingStats,
    'totalMs' | 'fieldMs' | 'colourMs' | 'postMs' | 'octavesMs' | 'presentMs' | 'cursorMs'
>;
export interface GpuRollingSummary {
    windows: Record<(typeof GPU_WINDOWS_MS)[number], GpuMeanStats | undefined>;
    rms5sMs?: number;
    perPass5s: Array<{ label: string; ms: number }>;
}

interface TimedValue<T> {
    timestampMs: number;
    value: T;
}

/** Bounded timestamp deque with incremental head pruning and occasional compaction. */
class TimeBuffer<T> {
    private values: TimedValue<T>[] = [];
    private head = 0;

    constructor(
        private readonly retentionMs: number,
        private readonly capacity: number,
    ) {}

    push(timestampMs: number, value: T) {
        this.values.push({ timestampMs, value });
        this.prune(timestampMs);
        while (this.values.length - this.head > this.capacity) this.head++;
        if (this.head > 256 && this.head * 2 > this.values.length) {
            this.values = this.values.slice(this.head);
            this.head = 0;
        }
    }

    prune(nowMs: number) {
        const cutoff = nowMs - this.retentionMs;
        while (this.head < this.values.length && this.values[this.head].timestampMs < cutoff) this.head++;
    }

    current(nowMs: number, windowMs: number) {
        const cutoff = nowMs - windowMs;
        const result: TimedValue<T>[] = [];
        for (let i = this.head; i < this.values.length; i++) {
            if (this.values[i].timestampMs >= cutoff && this.values[i].timestampMs <= nowMs)
                result.push(this.values[i]);
        }
        return result;
    }

    clear() {
        this.values = [];
        this.head = 0;
    }

    get size() {
        return this.values.length - this.head;
    }
}

export class FrameTelemetry {
    private intervals = new TimeBuffer<number>(10_000, 1_800);
    private previousTimestampMs: number | undefined;

    recordRenderedFrame(timestampMs: number) {
        if (this.previousTimestampMs !== undefined && timestampMs > this.previousTimestampMs) {
            this.intervals.push(timestampMs, timestampMs - this.previousTimestampMs);
        }
        this.previousTimestampMs = timestampMs;
    }

    reset() {
        this.previousTimestampMs = undefined;
        this.intervals.clear();
    }

    summary(nowMs: number): FrameRollingSummary {
        this.intervals.prune(nowMs);
        const windows = {} as FrameRollingSummary['windows'];
        for (const windowMs of FRAME_WINDOWS_MS) {
            const samples = this.intervals.current(nowMs, windowMs).map(({ value }) => value);
            const elapsed = samples.reduce((sum, value) => sum + value, 0);
            windows[windowMs] =
                samples.length && elapsed > 0
                    ? { fps: (samples.length * 1_000) / elapsed, sampleCount: samples.length }
                    : undefined;
        }
        const twoSecondSamples = this.intervals.current(nowMs, 2_000).map(({ value }) => value);
        return {
            windows,
            rms2sMs: twoSecondSamples.length
                ? Math.sqrt(twoSecondSamples.reduce((sum, value) => sum + value * value, 0) / twoSecondSamples.length)
                : undefined,
        };
    }

    get sampleCount() {
        return this.intervals.size;
    }
}

export class GpuTelemetry {
    private samples = new TimeBuffer<GpuTimingStats>(30_000, 128);

    record(timestampMs: number, stats: GpuTimingStats) {
        this.samples.push(timestampMs, stats);
    }

    summary(nowMs: number): GpuRollingSummary {
        this.samples.prune(nowMs);
        const windows = {} as GpuRollingSummary['windows'];
        for (const windowMs of GPU_WINDOWS_MS) {
            const samples = this.samples.current(nowMs, windowMs).map(({ value }) => value);
            if (samples.length) {
                const mean = (key: keyof GpuMeanStats) =>
                    samples.reduce((sum, sample) => sum + (sample[key] ?? 0), 0) / samples.length;
                windows[windowMs] = {
                    totalMs: mean('totalMs'),
                    fieldMs: mean('fieldMs'),
                    colourMs: mean('colourMs'),
                    postMs: mean('postMs'),
                    octavesMs: mean('octavesMs'),
                    presentMs: mean('presentMs'),
                    cursorMs: mean('cursorMs'),
                };
            }
        }
        const fiveSecondSamples = this.samples.current(nowMs, 5_000).map(({ value }) => value.totalMs);
        const fiveSecondStats = this.samples.current(nowMs, 5_000).map(({ value }) => value);
        const latestOrder = fiveSecondStats[fiveSecondStats.length - 1]?.passes.map(({ label }) => label) ?? [];
        const perPass5s = latestOrder.map((label) => {
            const timings = fiveSecondStats.flatMap((sample) =>
                sample.passes.filter((pass) => pass.label === label).map((pass) => pass.ms),
            );
            return { label, ms: timings.reduce((sum, value) => sum + value, 0) / timings.length };
        });
        return {
            windows,
            rms5sMs: fiveSecondSamples.length
                ? Math.sqrt(fiveSecondSamples.reduce((sum, value) => sum + value * value, 0) / fiveSecondSamples.length)
                : undefined,
            perPass5s,
        };
    }

    get sampleCount() {
        return this.samples.size;
    }
}

/** CPU wall-clock work performed by each cursor animation frame (including zero-work frames). */
export class CursorInteractionTelemetry {
    private samples = new TimeBuffer<CursorInteractionSample>(30_000, 1_800);

    record(timestampMs: number, sample: CursorInteractionSample) {
        this.samples.push(timestampMs, sample);
    }

    summary(nowMs: number): CursorInteractionRollingSummary {
        this.samples.prune(nowMs);
        const windows = {} as CursorInteractionRollingSummary['windows'];
        for (const windowMs of INTERACTION_WINDOWS_MS) {
            const samples = this.samples.current(nowMs, windowMs).map(({ value }) => value);
            if (samples.length) {
                const mean = (key: keyof CursorInteractionSample) =>
                    samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
                windows[windowMs] = {
                    inputMs: mean('inputMs'),
                    rasterMs: mean('rasterMs'),
                    decayMs: mean('decayMs'),
                    uploadSubmitMs: mean('uploadSubmitMs'),
                    totalMs: mean('totalMs'),
                    pointCount: mean('pointCount'),
                    width: mean('width'),
                    height: mean('height'),
                };
            }
        }
        const fiveSeconds = this.samples.current(nowMs, 5_000).map(({ value }) => value);
        const latest = fiveSeconds[fiveSeconds.length - 1];
        return {
            windows,
            rms5sMs: fiveSeconds.length
                ? Math.sqrt(fiveSeconds.reduce((sum, sample) => sum + sample.totalMs ** 2, 0) / fiveSeconds.length)
                : undefined,
            latest: latest ? { pointCount: latest.pointCount, width: latest.width, height: latest.height } : undefined,
        };
    }
}
