import { expect, test } from '@playwright/test';

test('on screen the CV stays hidden', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-print]')).toBeAttached();
    await expect(page.locator('[data-print]')).toBeHidden();
});

test.describe('in print', () => {
    test.beforeEach(({ page }) => page.emulateMedia({ media: 'print' }));

    test('a page that is not an Article prints the CV instead of itself', async ({ page }) => {
        await page.goto('/about');
        const cv = page.locator('[data-print]');
        await expect(cv.getByRole('heading', { level: 1 })).toHaveText('Mia Riezebos');
        await expect(cv.getByText('Product Engineer & Founder')).toBeVisible();
        await expect(cv.getByRole('heading', { name: 'Timeline' })).toBeVisible();
        await expect(cv.getByRole('heading', { name: 'Experience' })).toBeVisible();
        await expect(cv.getByRole('heading', { name: 'Selected work' })).toBeVisible();
        await expect(page.locator('main')).toBeHidden();
        await expect(page.locator('header[data-header]')).toBeHidden();
        await expect(page.getByRole('navigation', { name: 'Sitemap' })).toBeHidden();
    });

    test('an Article prints itself on its paper, with no CV and no site chrome', async ({ page }) => {
        for (const route of ['/work/vesta', '/textile/privacy']) {
            await page.goto(route);
            await expect(page.locator('main')).toBeVisible();
            await expect(page.locator('[data-print]')).toHaveCount(0);
            await expect(page.locator('[data-print-paper] img').first()).toBeVisible();
            await expect(page.locator('header[data-header]')).toBeHidden();
            await expect(page.getByRole('navigation', { name: 'Sitemap' })).toBeHidden();
        }
    });

    test('an index page prints the CV, then its Appendix', async ({ page }) => {
        await page.goto('/work');
        const sheets = page.locator('[data-print] [data-print-sheet]');
        const appendix = sheets.nth(2);
        await expect(appendix.getByRole('heading', { name: 'Work' })).toBeVisible();
        await expect(appendix.getByRole('link', { name: 'mia.cx/work/caelestis' })).toHaveAttribute(
            'href',
            'https://mia.cx/work/caelestis',
        );
    });
});

test('home and the footer offer the CV in both Themes', async ({ page }) => {
    await page.goto('/');
    for (const scope of [page.locator('[data-section="hero"]'), page.locator('footer')]) {
        await expect(scope.getByRole('link', { name: 'Download CV' })).toHaveAttribute('href', '/cv.pdf?theme=colour');
        const print = scope.getByRole('link', { name: 'Download print-friendly CV' });
        await expect(print).toHaveAttribute('href', '/cv.pdf?theme=print');
    }
    const print = page.locator('[data-section="hero"]').getByRole('link', { name: 'Download print-friendly CV' });
    await print.focus();
    await expect(print.getByText('Print-friendly')).toBeVisible();
});

test('on a role’s CV, every CV button downloads that role', async ({ page }) => {
    await page.goto('/cv?role=frontend');
    const links = page.getByRole('link', { name: 'Download CV' });
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
        await expect(link).toHaveAttribute('href', '/cv.pdf?theme=colour&role=frontend');
    }
});
