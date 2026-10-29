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
