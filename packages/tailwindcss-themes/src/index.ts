// This plugin is based on the tailwindcss-theme-variants plugin by @JNavith (https://github.com/JNavith/tailwindcss-theme-variants)
// It has been modified to work with the new TailwindCSS v3 plugin system & darkMode variant.

import plugin from 'tailwindcss/plugin';
import { prepend } from './parse';
import type { ThisPlugin, ThisPluginOptions, ThisPluginTheme } from './types';

const thisPlugin: ThisPlugin = plugin.withOptions((options: Partial<ThisPluginOptions>) => {
	// destructure the options & get an arry of all the themes
	const { fallback = false } = options;
	const themes = Object.entries(options.themes ?? {});

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const anySelectors = themes.some(([_key, { selectors }]) => selectors);
	const baseSelector = options.baseSelector ?? (anySelectors ? ':root' : '');

	// if no themes are provided, throw an error
	if (themes.length === 0) {
		const error = new Error(
			'[tailwindcss-themes] No themes provided. Without any themes, the plugin cannot generate any utilities or variants. Please provide a theme under the `themes` key the plugin options like so: `{ themes: { light: { selector: ".light" } } }`'
		);

		console.error(error);
		throw error;
	}

	let fallbackTheme: string | undefined;

	// define the fallback theme if one is provided
	if (fallback) {
		// if the fallback is a string, get the theme with that name
		if (typeof fallback === 'string') {
			const maybeFallbackTheme = themes.find(([key]) => {
				return key === fallback;
			});

			// if the theme is not found, throw an error
			if (!maybeFallbackTheme) {
				const error = new Error(
					`[tailwindcss-themes] No theme found with the provided fallback value. Please provide a theme with the specified fallback value (${fallback}) under the \`themes\` key the plugin options like so: \`{ themes: { ${fallback}: { selector: ".${fallback}" } } }\``
				);

				console.error(error);
				throw error;
			}

			fallbackTheme = maybeFallbackTheme[0];
		} else {
			// if the fallback is a boolean, set the fallback theme to the first available theme
			fallbackTheme = themes[0]![0];
		}

		// if there is only one theme, there is no need to add a fallback, warn the user.
		if (themes.length === 1) {
			let message = `[tailwindcss-themes] The \`${fallbackTheme}\` was selected as the fallback theme, but it is the only theme available, so it will always be active. Fix this by adding another theme to \`themes\`, disabling \`fallback\`, or setting a \`baseSelector\` in this plugin's options.`;

			if (baseSelector !== '') {
				message = `[tailwindcss-themes] The \`${fallbackTheme}\` was selected as the fallback theme, but it is the only theme available, so it will always be active as long as \`${baseSelector}\` exists. This is an unusual pattern. If you didn't mean to do this, you can fix this by adding another theme to \`themes\`, disabling \`fallback\`, or changing \`baseSelector\` to \`""\`, and setting this theme's \`selector\` to the current value of \`baseSelector\` in this plugin's options.`;
			} else {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				message += anySelectors
					? `\n[tailwindcss-themes] The \`${fallbackTheme}\` was selected as the fallback theme, but you specified \`baseSelector: ""\`, even though there are themes that require a selector to activate. This will result in confusing and erroneous behaviour. This can be fixed by disabling \`fallback\` or setting a \`baseSelector\` in this plugin's options.`
					: '';
			}

			console.warn(
				message + '\n[tailwindcss-themes] --- (there is no way to silence these warnings) ---'
			);
		}
	}

	// return the plugin
	return ({ addUtilities, matchUtilities, addVariant, matchVariant }) => {
		const _themes = themes.map((theme) => {
			const [_, { selectors }] = theme;

			if (selectors) {
				theme[1].selectors = typeof selectors === 'string' ? [selectors] : selectors;
			}

			return theme;
		}) as [string, ThisPluginTheme & { selectors: string[] }][];

		// Add static variants for each theme
		_themes.forEach((theme) => {
			const definitions: Set<string> = new Set();

			console.debug('[tailwindcss-themes]');
			console.debug('[tailwindcss-themes] ================= Adding Variants =================');
			const [key, { selectors, mediaQuery }] = theme;

			console.debug('[tailwindcss-themes] Adding variants for theme', key);
			selectors ? console.debug('[tailwindcss-themes] selectors:', selectors) : null;
			mediaQuery ? console.debug('[tailwindcss-themes] mediaQuery:', mediaQuery) : null;

			if (fallback && key === fallbackTheme) {
				definitions.add(`:where(${baseSelector})&`);
				definitions.add(`:where(${baseSelector}) &`);
			} else {
				selectors?.forEach((selector) => {
					definitions.add(`${prepend(`:where(${selector})`, baseSelector)}&`);
					definitions.add(`${prepend(`:where(${selector})`, baseSelector)} &`);
				});
				mediaQuery
					? _themes.forEach((_theme) => {
							if (_theme == theme) return;

							const [key, { selectors }] = _theme;

							selectors?.forEach((selector) => {
								definitions.add(`${mediaQuery} { ${prepend(`:where(:not(${selector}))`, baseSelector)}& }`);
								definitions.add(
									`${mediaQuery} { ${prepend(`:where(:not(${selector}))`, baseSelector)} & }`
								);
							});
						})
					: null;
			}

			console.debug('[tailwindcss-themes] definitions:', definitions);

			addVariant(key, Array.from(definitions));
		});
	};
});

export default thisPlugin;

export * from './media-queries';
