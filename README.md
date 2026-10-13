# AA Digital World

The storefront is hosted on GitHub Pages. Customers browse the catalog and ask about products on WhatsApp at **+234 802 581 6245**.

## Update products

Open `public/admin.html` to edit products and photos, then download `catalog.json`. Replace `public/catalog.json` in the repository and push to `master` to publish the changes. Read [`public/admin-setup.html`](public/admin-setup.html) for the steps.

This GitHub Pages setup has no private admin login or automatic write access. The editor only prepares a catalog file; a GitHub commit publishes it. The `worker/` folder contains an optional Cloudflare API implementation and is not used by the current Pages-only catalog.

## GitHub Pages

The site files live in `public/`. The GitHub Actions workflow deploys that folder on pushes to `master`. In the repository, select **Settings → Pages → GitHub Actions** as the build source.
