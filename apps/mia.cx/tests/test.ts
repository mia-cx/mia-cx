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
    await expect(page.locator('main .prose p').first()).toBeVisible();
});

test('a project keeps its URL and its filename as its title', async ({ page }) => {
    await page.goto('/work/hypertrance-eu');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('hypertrance.eu');
});

test('blog lists posts newest first', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog');
    const posts = page.locator('main ul a');
    await expect(posts).toHaveCount(6);
    await expect(posts.first()).toHaveAttribute('href', '/blog/the-quiet-cost-of-carelessness');
    await expect(page.getByRole('link', { name: /My Approach to Mastering/ })).toHaveAttribute(
        'href',
        '/blog/my-approach-to-mastering',
    );
});

test('a post renders its body from the vault', async ({ page }) => {
    await page.goto('/blog/my-approach-to-mastering');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Approach to Mastering');
    await expect(page.getByText('8 September 2023')).toBeVisible();
    await page.locator('main .prose').getByRole('link', { name: 'Stereo Imaging', exact: true }).first().click();
    await expect(page).toHaveURL(/#stereo-imaging$/);
    await expect(page.locator('#stereo-imaging')).toBeInViewport();
});

test('a post vendored from elsewhere links to where it first appeared', async ({ page }) => {
    await page.goto('/blog/the-quiet-cost-of-carelessness');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Quiet Cost of Carelessness');
    await expect(page.getByRole('link', { name: /here/ })).toHaveAttribute('href', /linkedin\.com/);
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
