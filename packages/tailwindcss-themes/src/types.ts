import type { Config, CustomThemeConfig, PluginCreator } from 'tailwindcss/types/config';

// https://stackoverflow.com/a/49725198
export type OR<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
	{
		[K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
	}[Keys];

export type ThisPluginTheme = OR<{
	selectors: string | string[];
	mediaQuery: string;
}> & {
	theme?: Partial<CustomThemeConfig> & { extend?: Partial<CustomThemeConfig> };
};

export interface ThisPluginOptions {
	baseSelector: string;
	fallback: string | boolean;
	themes?: {
		[key: string]: ThisPluginTheme;
	};
}

export type ThisPlugin = (options: Partial<ThisPluginOptions>) => {
	handler: PluginCreator;
	config?: Partial<Config>;
};
