import { expect, test } from '@playwright/test';

const projects = [
	'https://github.com/vesta-cx/vesta',
	'https://github.com/mia-cx/maal',
	'https://github.com/mia-cx/honeybot',
	'https://github.com/mia-riezebos/patch',
	'https://github.com/mia-cx/ditherette',
	'https://github.com/mia-riezebos/novel-audio-codec-experiment'
];

test('shared header exposes the requested navigation', async ({ page }) => {
	await page.goto('/');

	const header = page.getByRole('banner');
	await expect(header.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
	await expect(header.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog');
	await expect(header.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
	await expect(header.getByRole('link', { name: 'Music' })).toHaveAttribute('href', 'https://ffm.bio/patch');
	await expect(header.getByRole('link', { name: 'About' })).toHaveCount(0);

	const footer = page.getByRole('contentinfo');
	await expect(footer.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog');
	await expect(footer.getByRole('link', { name: 'Music' })).toHaveAttribute('href', 'https://ffm.bio/patch');
	await expect(footer.locator('a[href="mailto:hello@mia.cx"]')).toHaveCount(2);
	await expect(page.getByRole('link', { name: 'About' })).toHaveCount(0);
});

test('shared header fits a mobile viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	await expect(page.getByRole('banner').getByRole('link', { name: 'Music' })).toBeInViewport();
	const hasHorizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth
	);
	expect(hasHorizontalOverflow).toBe(false);
});

test('projects page renders the handpicked public repositories', async ({ page }) => {
	await page.goto('/projects');
	await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();

	for (const href of projects) {
		await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
	}

	const projectList = page.getByTestId('project-list');
	await expect(projectList).not.toHaveClass(/grid|rounded/);
	await expect(projectList.locator('li').first()).not.toHaveClass(/rounded/);
	expect(
		await projectList
			.locator('li')
			.nth(1)
			.evaluate((item) => getComputedStyle(item).borderTopWidth)
	).not.toBe('0px');
});

test('blog page renders an under-construction placeholder', async ({ page }) => {
	await page.goto('/blog');
	await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible();
	await expect(page.getByText(/under construction/i)).toBeVisible();
});

test('contact page renders the existing contact methods', async ({ page }) => {
	await page.goto('/contact');
	const main = page.getByRole('main');
	await expect(main.getByRole('heading', { level: 1, name: 'Contact' })).toBeVisible();
	await expect(main.locator('a[href="mailto:hello@mia.cx"]')).toBeVisible();
	await expect(main.locator('a[href="https://wa.me/message/K6JIESWVSFVBN1"]')).toBeVisible();
	await expect(main.locator('a[href="https://discord.com/users/209048057441026049"]')).toContainText(
		'@patchstep'
	);
});

test('about redirects to the home page', async ({ page }) => {
	await page.goto('/about');
	await expect(page).toHaveURL('/');
});

test('pages expose concise titles and descriptions', async ({ page }) => {
	const pages = [
		['/', 'Home | mia.cx'],
		['/projects', 'Projects | mia.cx'],
		['/blog', 'Blog | mia.cx'],
		['/contact', 'Contact | mia.cx']
	];

	for (const [route, title] of pages) {
		await page.goto(route);
		await expect(page).toHaveTitle(title);
		await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S+/);
	}
});

test('footer uses the work number and accessible social labels', async ({ page }) => {
	await page.goto('/');
	const footer = page.getByRole('contentinfo');
	const workPhone = '+31 31 72 250 05';
	const workPhoneHref = `tel:${workPhone.replace(/\s/g, '')}`;

	await expect(footer.locator(`a[href="${workPhoneHref}"]`)).toContainText(workPhone);
	await expect(footer.getByText('+31 6 40 36 27 94')).toHaveCount(0);
	await expect(footer.getByText(`© ${new Date().getFullYear()} mia.cx`)).toBeVisible();
	await expect(footer.getByRole('link', { name: 'LinkedIn' })).toBeVisible();
	await expect(footer.getByRole('link', { name: 'GitHub' })).toBeVisible();
	await expect(footer.getByRole('link', { name: 'Twitter' })).toBeVisible();
});

test('unknown routes use the shared layout and custom error page', async ({ page }) => {
	const response = await page.goto('/this-page-does-not-exist');

	expect(response?.status()).toBe(404);
	await expect(page.getByRole('banner')).toBeVisible();
	await expect(page.getByRole('main').getByRole('heading', { name: '404: Page not found' })).toBeVisible();
	await expect(page.getByRole('main').getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
	await expect(page.getByRole('contentinfo')).toBeVisible();
});
