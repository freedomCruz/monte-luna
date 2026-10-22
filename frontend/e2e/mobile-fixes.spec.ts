import { test, expect } from '@playwright/test';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

const widths = [320, 360, 375, 390];

test.describe('Mobile layout specs (S1, S2, S3)', () => {
  for (const width of widths) {
    test(`S1: Cart item quantity stepper and price do not overflow article container at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockAvailabilitiesRoute(page);

      // Add item to cart
      await page.goto('/productos/finca-el-mirador');
      const addBtn = page.getByRole('button', { name: /agregar al carrito/i });
      await addBtn.click();

      // Navigate to /carrito
      await page.goto('/carrito');
      const article = page.locator('main article').first();
      await expect(article).toBeVisible();

      const stepper = article.getByRole('group', { name: /cantidad/i });
      await expect(stepper).toBeVisible();

      const price = article.locator('span').filter({ hasText: /^\$/ }).last();
      await expect(price).toBeVisible();

      const articleBox = await article.boundingBox();
      const stepperBox = await stepper.boundingBox();
      const priceBox = await price.boundingBox();

      expect(articleBox).not.toBeNull();
      expect(stepperBox).not.toBeNull();
      expect(priceBox).not.toBeNull();

      if (articleBox && stepperBox && priceBox) {
        expect(stepperBox.x + stepperBox.width).toBeLessThanOrEqual(
          articleBox.x + articleBox.width
        );
        expect(stepperBox.x).toBeGreaterThanOrEqual(articleBox.x);
        expect(priceBox.x + priceBox.width).toBeLessThanOrEqual(
          articleBox.x + articleBox.width
        );
      }
    });

    test(`S1: Cart panel quantity stepper and price do not overflow article container at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockAvailabilitiesRoute(page);

      await page.goto('/productos/finca-el-mirador');
      const addBtn = page.getByRole('button', { name: /agregar al carrito/i });
      await addBtn.click();

      const panel = page.getByRole('dialog', { name: /tu carrito/i });
      await expect(panel).toBeVisible();

      const article = panel.locator('article').first();
      await expect(article).toBeVisible();

      const stepper = article.getByRole('group', { name: /cantidad/i });
      await expect(stepper).toBeVisible();

      const price = article.locator('span').filter({ hasText: /^\$/ }).last();
      await expect(price).toBeVisible();

      const articleBox = await article.boundingBox();
      const stepperBox = await stepper.boundingBox();
      const priceBox = await price.boundingBox();

      expect(articleBox).not.toBeNull();
      expect(stepperBox).not.toBeNull();
      expect(priceBox).not.toBeNull();

      if (articleBox && stepperBox && priceBox) {
        expect(stepperBox.x + stepperBox.width).toBeLessThanOrEqual(
          articleBox.x + articleBox.width
        );
        expect(stepperBox.x).toBeGreaterThanOrEqual(articleBox.x);
        expect(priceBox.x + priceBox.width).toBeLessThanOrEqual(
          articleBox.x + articleBox.width
        );
      }
    });

    test(`S1: Product detail quantity stepper does not overflow container at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockAvailabilitiesRoute(page);

      await page.goto('/productos/finca-el-mirador');
      const stepper = page.getByRole('group', { name: /cantidad/i });
      await expect(stepper).toBeVisible();

      const stepperBox = await stepper.boundingBox();
      expect(stepperBox).not.toBeNull();
      if (stepperBox) {
        expect(stepperBox.x + stepperBox.width).toBeLessThanOrEqual(width);
        expect(stepperBox.x).toBeGreaterThanOrEqual(0);
      }
    });

    for (const surface of ['page', 'panel'] as const) {
      test(`S2: Cart ${surface} line image does not overlap the line text at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await mockAvailabilitiesRoute(page);

        await page.goto('/productos/finca-el-mirador');
        await page.getByRole('button', { name: /agregar al carrito/i }).click();

        let article;
        if (surface === 'page') {
          await page.goto('/carrito');
          article = page.locator('main article').first();
        } else {
          const panel = page.getByRole('dialog', { name: /tu carrito/i });
          await expect(panel).toBeVisible();
          article = panel.locator('article').first();
        }
        await expect(article).toBeVisible();

        const image = article.locator('img').first();
        await expect(image).toBeVisible();
        await expect
          .poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))
          .toBe(true);
        const imageBox = await image.boundingBox();
        expect(imageBox).not.toBeNull();

        // Every text element of the line must lie outside the image's box: an absolutely
        // positioned image paints above in-flow text, so any intersection hides letters.
        const texts = article.locator('h2, h3, span, a, p').filter({ hasText: /\S/ });
        const count = await texts.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          const text = texts.nth(i);
          if (!(await text.isVisible())) continue;
          const box = await text.boundingBox();
          if (!box || !imageBox) continue;
          const overlaps =
            box.x < imageBox.x + imageBox.width &&
            imageBox.x < box.x + box.width &&
            box.y < imageBox.y + imageBox.height &&
            imageBox.y < box.y + box.height;
          expect(overlaps, `image overlaps "${(await text.innerText()).slice(0, 40)}"`).toBe(false);
        }
      });
    }

    test(`S2: Product card packaging image does not cover title or text at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockAvailabilitiesRoute(page);

      await page.goto('/');
      const card = page.locator('article[id^="inicio-"]').first();
      await expect(card).toBeVisible();
      await card.scrollIntoViewIfNeeded();

      const titleLink = card.locator('h3 a');
      await expect(titleLink).toBeVisible();
      const titleBox = await titleLink.boundingBox();
      expect(titleBox).not.toBeNull();

      if (titleBox) {
        // Hit-test center of the title text to verify it receives clicks and is not intercepted by an image or overlay
        const center = {
          x: titleBox.x + titleBox.width / 2,
          y: titleBox.y + titleBox.height / 2,
        };

        const targetTag = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return el ? el.tagName.toLowerCase() : null;
        }, center);

        // Center must be the anchor tag or inside the anchor tag
        expect(['a', 'h3']).toContain(targetTag);

        // Also test clicking the title directly without force
        await titleLink.click({ trial: true });
      }

      // Check description text as well
      const desc = card.locator('p').first();
      if (await desc.count() > 0) {
        const descBox = await desc.boundingBox();
        if (descBox) {
          const descCenter = {
            x: descBox.x + descBox.width / 2,
            y: descBox.y + descBox.height / 2,
          };
          const descTag = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return el ? el.tagName.toLowerCase() : null;
          }, descCenter);
          expect(['p', 'article']).toContain(descTag);
        }
      }
    });
  }
});
