# AA Digital World

The storefront is hosted on GitHub Pages. Customers browse the catalog and ask about any product on WhatsApp at **+234 802 581 6245**.

## Catalog administration

The admin page is `public/admin.html`. It supports product photos, names, descriptions, prices, quantities, availability, editing and publishing. Product records are stored in Cloudflare D1 and photos in Cloudflare R2; `worker/` contains the API. See [`public/admin-setup.html`](public/admin-setup.html) for one-time Cloudflare setup.

The admin cannot accept uploads until a Cloudflare account is connected, the D1 database and R2 bucket are created, the Worker is deployed, and its `workers.dev` URL is set in `public/admin-config.js`. Keep `ADMIN_PASSWORD` and `SESSION_SECRET` in Wrangler secrets only. R2 has a free usage allowance, and usage beyond it is billed.

## Publish on GitHub Pages

The site files live in `public/`. The GitHub Actions workflow deploys that folder on pushes to `master`. In the repository, select **Settings → Pages → GitHub Actions** as the build source. The live catalog currently stays usable from its bundled listings until the Worker is connected.
