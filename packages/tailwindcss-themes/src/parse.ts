import parser, { type Node, type Root, type Selectors } from 'postcss-selector-parser';

export const parse = (selector: Selectors | never) => {
	let container: Root;

	const processor = parser((_container) => {
		container = _container;
	});

	processor.processSync(selector, { lossless: false });

	return container!;
};

export const unparse = (node: Node) => node.toString();

export const prepend = (selector: Selectors, parent: Selectors) => {
	if (!parent) return selector;

	const parts = parse(selector).split(
		(node) => node.type === 'selector' || node.type === 'combinator'
	);

	const _parts = parts.map((part) => unparse(part[0] as Node)).flat();

	return _parts.map((part) => `${parent}${part.trim()}`).join(', ');
};
