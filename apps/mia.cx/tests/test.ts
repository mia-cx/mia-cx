import { expect, test } from '@playwright/test';

test('home introduces Mia with her portrait and a link to more about her', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('[data-section="hero"]');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mia Riezebos');
    await expect(hero.getByRole('img', { name: 'Portrait of Mia Riezebos' })).toBeVisible();
    await expect(hero.getByRole('link', { name: /Read more/ })).toHaveAttribute('href', '/about');
    await expect(page.getByLabel('Animated coloured noise field')).toBeAttached();
});

test('the +N button opens and closes the rest of the socials', async ({ page }) => {
    await page.goto('/');
    const trigger = page.locator('[data-section="hero"]').getByRole('button', { name: /more links/ });
    // The footer lists everything too, so scope to the hero's panel.
    const inPanel = page.locator('#hero-socials').getByRole('link').first();
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

test('work links through to a project page', async ({ page }) => {
    await page.goto('/work');
    const card = page.locator('main ul a[href^="/work/"]').first();
    const title = (await card.locator('.title').textContent())!.trim();
    await card.click();
    await expect(page).toHaveURL(/\/work\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
});

test('blog lists posts newest first', async ({ page }) => {
    await page.goto('/blog');
    const dates = await page.locator('main ul time').evaluateAll((times) => times.map((time) => time.dateTime));
    expect(dates.length).toBeGreaterThan(1);
    expect(dates).toEqual([...dates].sort().reverse());
});

test('a project post opens from /blog under its project, which lists it', async ({ page }) => {
    await page.goto('/blog');
    const post = page.locator('main ul a[href^="/work/"]').first();
    const href = (await post.getAttribute('href'))!;
    await post.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await page.locator('main a.back').click();
    await expect(page).toHaveURL(new RegExp(`${href.slice(0, href.lastIndexOf('/'))}$`));
    await expect(page.getByRole('region', { name: 'Posts' }).locator(`a[href="${href}"]`)).toBeVisible();
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
