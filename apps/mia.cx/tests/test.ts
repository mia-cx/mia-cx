import { expect, test } from '@playwright/test';

test('home introduces Mia next to the portrait', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('[data-section="hero"]');
    await expect(hero.getByText("I'm", { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mia Riezebos');
    await expect(hero.getByText('a designer, creative developer and music producer')).toBeVisible();
    await expect(hero.getByRole('link', { name: /Read more/ })).toHaveAttribute('href', '/about');
    await expect(hero.getByRole('img', { name: 'Portrait of Mia Riezebos' })).toBeVisible();
    await expect(hero.getByRole('link', { name: 'GitHub' })).toBeVisible();
    await expect(page.getByLabel('Animated coloured noise field')).toBeAttached();
});

test('the +N button opens and closes the rest of the socials', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('[data-section="hero"]');
    const trigger = hero.getByRole('button', { name: /more links/ });
    // The footer lists everything too, so scope to the hero's panel.
    const inPanel = page.locator('#hero-socials').getByRole('link', { name: 'Spotify' });
    await expect(inPanel).toBeHidden();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(inPanel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(inPanel).toBeHidden();
});

test('home lists featured work and ends with contact', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Featured work' })).toBeVisible();
    await expect(page.locator('#contact')).toBeAttached();
    await expect(page.getByRole('link', { name: 'hello@mia.cx' }).first()).toBeVisible();
});

test('the header carries no rule or progress bar', async ({ page }) => {
    await page.goto('/work');
    await expect(page.locator('header[data-header] .progress')).toHaveCount(0);
    await expect(page.locator('header[data-header] .rule')).toHaveCount(0);
});

test('work shows only the shortlist and points at Svartz', async ({ page }) => {
    await page.goto('/work');
    const titles = page.locator('main ul .title');
    await expect(titles).toHaveCount(12);
    await expect(titles.first()).toHaveText('FalseType');
    await expect(page.getByText('Honeybot', { exact: true })).toHaveCount(0);
    await expect(page.locator('main p.more').getByRole('link', { name: 'Svartz' })).toHaveAttribute(
        'href',
        'https://github.com/mia-cx/svartz',
    );
});

test('work links through to a project page', async ({ page }) => {
    await page.goto('/work');
    await page.getByRole('link', { name: /Vesta/ }).first().click();
    await expect(page).toHaveURL(/\/work\/vesta$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vesta');
});

test('blog is a coming-soon page linking to Svartz', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog');
    await expect(page.getByText('Coming soon')).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: 'Svartz' })).toHaveAttribute(
        'href',
        'https://github.com/mia-cx/svartz',
    );
});

test('every page carries the sticky header and the sitemap', async ({ page }) => {
    for (const route of ['/', '/work', '/blog', '/about']) {
        await page.goto(route);
        await expect(page.locator('header[data-header]')).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Sitemap' })).toBeVisible();
    }
});

test('the first-load entrance clears itself', async ({ page }) => {
    await page.goto('/');
    // Revealed when the first shader frame is on screen, when graphics fail, or after the failsafe.
    await expect(page.locator('html')).not.toHaveAttribute('data-boot', /.+/, { timeout: 16000 });
});
