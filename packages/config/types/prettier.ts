import { Options } from "prettier";

export type Override = {
	files: string | string[];
	excludeFiles?: string | string[];
	options?: Options;
};
