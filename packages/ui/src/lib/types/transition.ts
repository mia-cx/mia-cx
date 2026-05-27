import type { EasingFunction } from 'svelte/transition';

export type TransitionParams = object & {
	delay?: number;
	speed?: number;
	duration?: number | ((len: number) => number);
	easing?: EasingFunction;
	start?: number;
	amount?: number;
	x?: number | string;
	y?: number | string;
	opacity?: number;
	axis?: 'x' | 'y';
};
