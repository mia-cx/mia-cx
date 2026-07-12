export interface AdaptiveResolutionOptions {
    minScale?: number;
    step?: number;
    warmupMs?: number;
    downSustainMs?: number;
    upSustainMs?: number;
    downCooldownMs?: number;
    upCooldownMs?: number;
    overloadedFrameMs?: number;
    headroomFrameMs?: number;
}

/**
 * Deterministic adaptive-resolution controller. The caller owns render targets;
 * this class only returns a new, quantised scale when a meaningful change is due.
 */
export class AdaptiveResolutionController {
    readonly minScale: number;
    readonly step: number;
    private readonly config: Required<AdaptiveResolutionOptions>;
    private scale: number;
    private ceiling: number;
    private warmupUntil = 0;
    private cooldownUntil = 0;
    private overloadedMs = 0;
    private headroomMs = 0;

    constructor(ceiling: number, options: AdaptiveResolutionOptions = {}) {
        this.config = {
            minScale: options.minScale ?? 0.25,
            step: options.step ?? 0.05,
            warmupMs: options.warmupMs ?? 1_000,
            downSustainMs: options.downSustainMs ?? 500,
            upSustainMs: options.upSustainMs ?? 3_000,
            downCooldownMs: options.downCooldownMs ?? 1_500,
            upCooldownMs: options.upCooldownMs ?? 4_000,
            overloadedFrameMs: options.overloadedFrameMs ?? 18,
            headroomFrameMs: options.headroomFrameMs ?? 14.5,
        };
        this.minScale = this.config.minScale;
        this.step = this.config.step;
        this.ceiling = Math.max(this.minScale, ceiling);
        this.scale = this.ceiling;
    }

    get effectiveScale() {
        return this.scale;
    }

    setCeiling(ceiling: number, nowMs: number) {
        this.ceiling = Math.max(this.minScale, ceiling);
        const next = Math.min(this.scale, this.ceiling);
        this.reset(nowMs);
        if (next !== this.scale) this.scale = next;
        return this.scale;
    }

    reset(nowMs: number) {
        this.overloadedMs = 0;
        this.headroomMs = 0;
        this.warmupUntil = nowMs + this.config.warmupMs;
        this.cooldownUntil = this.warmupUntil;
    }

    sample(frameMs: number, nowMs: number, active = true): number | undefined {
        if (!active || !Number.isFinite(frameMs) || frameMs <= 0) {
            this.reset(nowMs);
            return undefined;
        }
        if (nowMs < this.warmupUntil) return undefined;
        if (frameMs > this.config.overloadedFrameMs) {
            this.overloadedMs += frameMs;
            this.headroomMs = 0;
        } else if (frameMs < this.config.headroomFrameMs) {
            this.headroomMs += frameMs;
            this.overloadedMs = 0;
        } else {
            this.overloadedMs = 0;
            this.headroomMs = 0;
        }
        if (nowMs < this.cooldownUntil) return undefined;
        let next = this.scale;
        let cooldown = 0;
        if (this.overloadedMs >= this.config.downSustainMs && this.scale > this.minScale) {
            next = Math.max(this.minScale, this.scale - this.step);
            cooldown = this.config.downCooldownMs;
        } else if (this.headroomMs >= this.config.upSustainMs && this.scale < this.ceiling) {
            next = Math.min(this.ceiling, this.scale + this.step);
            cooldown = this.config.upCooldownMs;
        }
        if (next === this.scale) return undefined;
        this.scale = Math.round(next * 1_000) / 1_000;
        this.overloadedMs = 0;
        this.headroomMs = 0;
        this.cooldownUntil = nowMs + cooldown;
        return this.scale;
    }
}
