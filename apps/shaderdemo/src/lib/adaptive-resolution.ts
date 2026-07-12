export interface AdaptiveResolutionOptions {
    /** Initial scale used before the device has demonstrated headroom. */
    initialScale?: number;
    minScale?: number;
    quantum?: number;
    maxWindowFrames?: number;
    /** Upper edge of the processing-time hysteresis band. */
    targetMs?: number;
    /** Lower edge of the processing-time hysteresis band. */
    headroomMs?: number;
    assumedFixedMs?: number;
    maxDownRatio?: number;
    maxUpRatio?: number;
    severeMs?: number;
    severeSamples?: number;
}

type Observation = { scale: number; ms: number };
type GpuSample = { scale: number; ms: number };

const nearestRankP99 = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.99) - 1)];
};

/** Predictive controller for a fixed + pixelCost * scale² GPU workload. */
export class AdaptiveResolutionController {
    readonly minScale: number;
    readonly quantum: number;
    private readonly config: Required<AdaptiveResolutionOptions>;
    private scale: number;
    private ceiling: number;
    private windowFrames = 1;
    private gpuSamples: GpuSample[] = [];
    private observations: Observation[] = [];
    private severeCount = 0;

    constructor(ceiling: number, options: AdaptiveResolutionOptions = {}) {
        this.config = {
            minScale: options.minScale ?? 0.125,
            initialScale: options.initialScale ?? ceiling,
            quantum: options.quantum ?? 0.025,
            maxWindowFrames: options.maxWindowFrames ?? 512,
            targetMs: options.targetMs ?? 1000 / 90,
            headroomMs: options.headroomMs ?? 9.5,
            assumedFixedMs: options.assumedFixedMs ?? 1.5,
            maxDownRatio: options.maxDownRatio ?? 0.55,
            maxUpRatio: options.maxUpRatio ?? 1.3,
            severeMs: options.severeMs ?? 50,
            severeSamples: options.severeSamples ?? 2,
        };
        this.minScale = this.config.minScale;
        this.quantum = this.config.quantum;
        this.ceiling = Math.max(this.minScale, ceiling);
        this.scale = Math.min(this.ceiling, Math.max(this.minScale, this.config.initialScale));
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
        this.gpuSamples = [];
        this.observations = [];
        this.severeCount = 0;
    }

    /**
     * Legacy rAF input. It deliberately cannot advance or influence GPU adaptation: rAF deltas include
     * compositor/vsync waiting and are not processing measurements.
     */
    sample(_frameMs: number, nowMs = 0, active = true, _gpuMs?: number): undefined {
        if (!active) this.reset(nowMs);
        return undefined;
    }

    /** Add one asynchronously read total-GPU-frame timestamp, attributed to the scale which rendered it. */
    sampleGpu(gpuMs: number, nowMs = 0, active = true, sampledScale = this.scale): number | undefined {
        if (!active) {
            this.reset(nowMs);
            return undefined;
        }
        if (!Number.isFinite(gpuMs) || gpuMs <= 0 || !Number.isFinite(sampledScale)) return undefined;

        // Do not wait for an exponentially growing p99 window when a browser is already in distress.
        // Two consecutive severe samples are enough to shed most of the pixel workload immediately.
        this.severeCount = gpuMs >= this.config.severeMs ? this.severeCount + 1 : 0;
        if (this.severeCount >= this.config.severeSamples && sampledScale === this.scale) {
            this.severeCount = 0;
            this.gpuSamples = [];
            return this.move(Math.max(this.minScale, this.scale * 0.35));
        }

        // Results already in flight when a scale changed remain useful as model observations, but must not
        // contaminate or advance the consecutive processing window for the new scale.
        if (Math.abs(sampledScale - this.scale) >= this.quantum / 2) {
            this.record(sampledScale, gpuMs);
            return undefined;
        }

        this.gpuSamples.push({ scale: sampledScale, ms: gpuMs });
        if (this.gpuSamples.length < this.windowFrames) return undefined;

        const p99 = nearestRankP99(this.gpuSamples.map((sample) => sample.ms));
        this.gpuSamples = [];
        this.windowFrames = Math.min(this.config.maxWindowFrames, this.windowFrames * 2);
        this.record(this.scale, p99);

        if (p99 > this.config.targetMs && this.scale > this.minScale) return this.move(this.predict(p99, false));
        if (p99 < this.config.headroomMs && this.scale < this.ceiling) return this.move(this.predict(p99, true));
        return undefined;
    }

    private record(scale: number, ms: number) {
        const existing = this.observations.find(
            (observation) => Math.abs(observation.scale - scale) < this.quantum / 2,
        );
        if (existing) existing.ms = ms;
        else this.observations.push({ scale, ms });
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
        let next = Math.round(bounded / this.quantum) * this.quantum;
        if (bounded === this.minScale) next = this.minScale;
        if (bounded === this.ceiling) next = this.ceiling;
        if (Math.abs(next - this.scale) < this.quantum * 0.75) return undefined;
        this.scale = Math.round(next * 1_000) / 1_000;
        return this.scale;
    }
}
