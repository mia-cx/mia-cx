export interface AdaptiveResolutionOptions {
    minScale?: number;
    quantum?: number;
    warmupMs?: number;
    trialWarmupMs?: number;
    downSustainMs?: number;
    upSustainMs?: number;
    overloadedFrameMs?: number;
    targetMs?: number;
    headroomMs?: number;
    assumedFixedMs?: number;
    maxDownRatio?: number;
    maxUpRatio?: number;
}

type Observation = { scale: number; ms: number };

/** Predictive estimate-test-refine controller for a fixed + pixelCost * scale² workload. */
export class AdaptiveResolutionController {
    readonly minScale: number;
    readonly quantum: number;
    private readonly config: Required<AdaptiveResolutionOptions>;
    private scale: number;
    private ceiling: number;
    private warmupUntil = 0;
    private overloadedMs = 0;
    private headroomMs = 0;
    private lastGpuAt?: number;
    private observations: Observation[] = [];

    constructor(ceiling: number, options: AdaptiveResolutionOptions = {}) {
        this.config = {
            minScale: options.minScale ?? 0.25,
            quantum: options.quantum ?? 0.025,
            warmupMs: options.warmupMs ?? 250,
            trialWarmupMs: options.trialWarmupMs ?? 200,
            downSustainMs: options.downSustainMs ?? 150,
            upSustainMs: options.upSustainMs ?? 2_000,
            overloadedFrameMs: options.overloadedFrameMs ?? 18,
            targetMs: options.targetMs ?? 14.75,
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

    setCeiling(ceiling: number, nowMs: number) {
        this.ceiling = Math.max(this.minScale, ceiling);
        this.scale = Math.min(this.scale, this.ceiling);
        this.reset(nowMs);
        return this.scale;
    }

    reset(nowMs: number) {
        this.overloadedMs = 0;
        this.headroomMs = 0;
        this.observations = [];
        this.lastGpuAt = undefined;
        this.warmupUntil = nowMs + this.config.warmupMs;
    }

    /** rAF detects missed frames. GPU time, when supplied, also exposes headroom hidden by vsync. */
    sample(frameMs: number, nowMs: number, active = true, gpuMs?: number): number | undefined {
        if (!active || !Number.isFinite(frameMs) || frameMs <= 0) {
            this.reset(nowMs);
            return undefined;
        }
        if (nowMs < this.warmupUntil) return undefined;

        const hasGpu = Number.isFinite(gpuMs) && gpuMs! > 0;
        const predictionMs = hasGpu ? gpuMs! : frameMs;
        // rAF remains authoritative for missed-vsync overload; GPU can refine a trial before a frame is missed.
        const overloaded =
            frameMs > this.config.overloadedFrameMs ||
            predictionMs > this.config.overloadedFrameMs ||
            (hasGpu && predictionMs > this.config.targetMs + 0.75);
        const headroom = hasGpu && predictionMs < this.config.headroomMs && frameMs <= this.config.overloadedFrameMs;
        if (hasGpu || overloaded) this.record(predictionMs);
        if (overloaded) {
            this.overloadedMs += frameMs;
            this.headroomMs = 0;
        } else if (headroom) {
            this.headroomMs += Math.min(1_000, Math.max(16.67, nowMs - (this.lastGpuAt ?? nowMs)));
            this.overloadedMs = 0;
        } else {
            this.overloadedMs = 0;
            this.headroomMs = 0;
        }
        if (hasGpu) this.lastGpuAt = nowMs;

        if (overloaded && this.overloadedMs >= this.config.downSustainMs && this.scale > this.minScale)
            return this.move(this.predict(predictionMs, false), nowMs);
        if (headroom && this.headroomMs >= this.config.upSustainMs && this.scale < this.ceiling)
            return this.move(this.predict(predictionMs, true), nowMs);
        return undefined;
    }

    /** Add an asynchronously read GPU timestamp sample. */
    sampleGpu(gpuMs: number, nowMs: number, active = true): number | undefined {
        return this.sample(16.67, nowMs, active, gpuMs);
    }

    private record(ms: number) {
        const existing = this.observations.find((o) => Math.abs(o.scale - this.scale) < this.quantum / 2);
        if (existing) existing.ms = existing.ms * 0.5 + ms * 0.5;
        else this.observations.push({ scale: this.scale, ms });
        if (this.observations.length > 6) this.observations.shift();
    }

    private predict(ms: number, upward: boolean) {
        let candidate: number | undefined;
        const distinct = this.observations.filter((o, i, all) => all.findIndex((p) => p.scale === o.scale) === i);
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

    private move(candidate: number, nowMs: number) {
        const bounded = Math.min(this.ceiling, Math.max(this.minScale, candidate));
        const next = Math.round(bounded / this.quantum) * this.quantum;
        this.overloadedMs = 0;
        this.headroomMs = 0;
        if (Math.abs(next - this.scale) < this.quantum * 0.75) return undefined;
        this.scale = Math.round(next * 1_000) / 1_000;
        this.warmupUntil = nowMs + this.config.trialWarmupMs;
        return this.scale;
    }
}
