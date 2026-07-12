export interface AdaptiveResolutionOptions {
    minScale?: number;
    quantum?: number;
    maxWindowFrames?: number;
    targetMs?: number;
    /** A 60 Hz rAF is quantised to about 16.67 ms; values at or below this limit are not overload. */
    vsyncLockMs?: number;
    /** GPU time below this value has enough margin to attempt a larger render scale. */
    headroomMs?: number;
    assumedFixedMs?: number;
    maxDownRatio?: number;
    maxUpRatio?: number;
}

type Observation = { scale: number; ms: number };
type GpuSample = { scale: number; ms: number };

const nearestRankP99 = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.99) - 1)];
};

/** Predictive controller for a fixed + pixelCost * scale² workload. */
export class AdaptiveResolutionController {
    readonly minScale: number;
    readonly quantum: number;
    private readonly config: Required<AdaptiveResolutionOptions>;
    private scale: number;
    private ceiling: number;
    private windowFrames = 1;
    private frameSamples: number[] = [];
    private gpuSamples: GpuSample[] = [];
    private observations: Observation[] = [];

    constructor(ceiling: number, options: AdaptiveResolutionOptions = {}) {
        this.config = {
            minScale: options.minScale ?? 0.25,
            quantum: options.quantum ?? 0.025,
            maxWindowFrames: options.maxWindowFrames ?? 512,
            targetMs: options.targetMs ?? 15.5,
            vsyncLockMs: options.vsyncLockMs ?? 17.25,
            headroomMs: options.headroomMs ?? 13.5,
            assumedFixedMs: options.assumedFixedMs ?? 1.5,
            maxDownRatio: options.maxDownRatio ?? 0.55,
            maxUpRatio: options.maxUpRatio ?? 1.3,
        };
        this.minScale = this.config.minScale;
        this.quantum = this.config.quantum;
        this.ceiling = Math.max(this.minScale, ceiling);
        this.scale = this.ceiling;
    }

    get effectiveScale() {
        return this.scale;
    }

    /** Exposed for deterministic tests and diagnostics; it is not part of the UI. */
    get currentEvaluationWindow() {
        return this.windowFrames;
    }

    setCeiling(ceiling: number, nowMs = 0) {
        this.ceiling = Math.max(this.minScale, ceiling);
        this.scale = Math.min(this.scale, this.ceiling);
        this.reset(nowMs);
        return this.scale;
    }

    reset(_nowMs = 0) {
        this.windowFrames = 1;
        this.frameSamples = [];
        this.gpuSamples = [];
        this.observations = [];
    }

    /** Add one consecutive rendered-frame interval. The very first valid frame evaluates immediately. */
    sample(frameMs: number, nowMs = 0, active = true, gpuMs?: number): number | undefined {
        if (!active || !Number.isFinite(frameMs) || frameMs <= 0) {
            this.reset(nowMs);
            return undefined;
        }
        this.frameSamples.push(frameMs);
        if (Number.isFinite(gpuMs) && gpuMs! > 0) this.gpuSamples.push({ scale: this.scale, ms: gpuMs! });
        if (this.frameSamples.length < this.windowFrames) return undefined;

        const rafP99 = nearestRankP99(this.frameSamples);
        const currentGpu = this.gpuSamples.filter((sample) => Math.abs(sample.scale - this.scale) < this.quantum / 2);
        const gpuP99 = currentGpu.length ? nearestRankP99(currentGpu.map((sample) => sample.ms)) : undefined;
        this.frameSamples = [];
        this.gpuSamples = [];
        this.windowFrames = Math.min(this.config.maxWindowFrames, this.windowFrames * 2);

        // Missed refreshes are authoritative. At/near 16.67 ms is a successful vsync lock, not evidence
        // that reducing scale can reveal the 15–16 ms internal budget.
        if (rafP99 > this.config.vsyncLockMs) {
            const measured = Math.max(rafP99, gpuP99 ?? 0);
            this.record(measured);
            return this.move(this.predict(measured, false));
        }

        // Beneath vsync, only corrected GPU timestamps can prove otherwise-hidden headroom.
        if (gpuP99 !== undefined) {
            this.record(gpuP99);
            if (gpuP99 < this.config.headroomMs && this.scale < this.ceiling)
                return this.move(this.predict(gpuP99, true));
            if (gpuP99 > this.config.targetMs && this.scale > this.minScale)
                return this.move(this.predict(gpuP99, false));
        } else if (rafP99 < this.config.headroomMs && this.scale < this.ceiling) {
            this.record(rafP99);
            return this.move(this.predict(rafP99, true));
        }
        return undefined;
    }

    /** Add an asynchronously read corrected GPU timestamp without counting another rendered frame. */
    sampleGpu(gpuMs: number, nowMs = 0, active = true, sampledScale = this.scale): undefined {
        if (!active || !Number.isFinite(gpuMs) || gpuMs <= 0) {
            this.reset(nowMs);
            return undefined;
        }
        this.gpuSamples.push({ scale: sampledScale, ms: gpuMs });
        return undefined;
    }

    private record(ms: number) {
        const existing = this.observations.find(
            (observation) => Math.abs(observation.scale - this.scale) < this.quantum / 2,
        );
        if (existing) existing.ms = ms;
        else this.observations.push({ scale: this.scale, ms });
        if (this.observations.length > 8) this.observations.shift();
    }

    private predict(ms: number, upward: boolean) {
        let candidate: number | undefined;
        const distinct = this.observations.filter(
            (observation, index, all) => all.findIndex((other) => other.scale === observation.scale) === index,
        );
        if (distinct.length >= 2) {
            const a = distinct[distinct.length - 2];
            const b = distinct[distinct.length - 1];
            const pixelCost = (b.ms - a.ms) / (b.scale * b.scale - a.scale * a.scale);
            const fixedCost = b.ms - pixelCost * b.scale * b.scale;
            if (pixelCost > 0 && fixedCost >= 0 && fixedCost < this.config.targetMs)
                candidate = Math.sqrt((this.config.targetMs - fixedCost) / pixelCost);
        }
        if (candidate === undefined) {
            const fixed = Math.min(this.config.assumedFixedMs, this.config.targetMs - 0.1, ms * 0.5);
            candidate = this.scale * Math.sqrt((this.config.targetMs - fixed) / Math.max(0.1, ms - fixed));
        }
        const low = upward ? this.scale : this.scale * this.config.maxDownRatio;
        const high = upward ? this.scale * this.config.maxUpRatio : this.scale;
        return Math.min(high, Math.max(low, candidate));
    }

    private move(candidate: number) {
        const bounded = Math.min(this.ceiling, Math.max(this.minScale, candidate));
        const next = Math.round(bounded / this.quantum) * this.quantum;
        if (Math.abs(next - this.scale) < this.quantum * 0.75) return undefined;
        this.scale = Math.round(next * 1_000) / 1_000;
        return this.scale;
    }
}
