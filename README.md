# AA Digital World

AA Digital World is a static storefront with a protected catalog admin. The storefront and admin are hosted by Cloudflare Pages. Pages Functions provide the API and sign-in; an R2 bucket stores product photos and `catalog.json`. No D1 database or standalone Worker is required.

## Cloudflare Pages setup

The repository is configured for a Pages project with its root at the repository root and `public/` as the build output directory. There is no build command. The `functions/` directory contains the API routes, while `wrangler.toml` declares the R2 binding.

1. Connect this GitHub repository to Cloudflare Pages and set `master` as the production branch.
2. Create the R2 bucket `aa-digital-world-product-images` and bind it to the Pages project as `PRODUCT_IMAGES`.
3. Add encrypted Pages secrets named `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET`. Use a long random session secret and a strong admin password.
4. Deploy the Pages project. Its first catalog request seeds the R2 catalog from `public/catalog.json`.

The project can deploy through Cloudflare Pages Git integration or with `wrangler pages deploy public`. Keep credentials out of the repository. The admin uses an HttpOnly, Secure, same-site session cookie; the R2 binding remains server-side.

## Shop

Customers browse the public catalog and order by WhatsApp at **+234 802 581 6245**. The admin page is `/admin.html`.

## Catalog backups

After signing in to the admin page, use **Download backup** to save the current R2 catalog as a JSON file. **Restore backup** replaces the entire live catalog with that file, so confirm the product count and make a fresh backup before restoring. Product photos already stored in R2 are not included in the backup file; the catalog retains their image URLs.

The checked-in `public/catalog.json` is used only to seed an empty R2 bucket. Once the live catalog exists in R2, editing that starter file does not overwrite live products.

## Social sharing

The Open Graph and Twitter preview tags use the default `aa-digital-world.pages.dev` address. If the Pages project uses a custom domain, update those absolute URLs in `public/index.html` to that domain.
