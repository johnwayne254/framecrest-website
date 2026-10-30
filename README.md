# FrameCrest — Visual Studio website

A responsive, editorial-style portfolio website for FrameCrest, built with plain HTML, CSS and vanilla JavaScript. It has no build tools, framework dependencies or paid libraries.

## Website files
- `index.html` — homepage and studio introduction
- `portfolio.html` — selected work gallery
- `services.html` — service descriptions and workflow
- `about.html` — studio approach and values
- `contact.html` — enquiry form and WhatsApp contact
- `styles.css` — responsive layouts, visual styling and accessibility states
- `config.js` — one place to add the studio's contact and social details
- `script.js` — mobile navigation, active-page state, form submission and gentle page reveals
- `assets/favicon.svg` — browser tab icon
- `robots.txt` and `sitemap.xml` — search engine discovery
- `404.html` — custom not-found page

## Deploy with Cloudflare Pages
1. In Cloudflare, open **Workers & Pages** and select **Create**.
2. Choose **Pages** and connect to Git.
3. Select the `johnwayne254/framecrest-website` repository and the `main` branch.
4. Choose **None** as the framework preset.
5. Set the build command to `exit 0` (this site has no compilation step).
6. Set the build output directory to `.` (the repository root).
7. Deploy. Cloudflare will provide a `pages.dev` address for testing. After each commit to the connected production branch, Cloudflare should rebuild and publish the latest version.

Every commit to the connected production branch triggers a fresh deployment.

## Required before public launch
Open `config.js` and fill these three settings:
1. **WhatsApp:** `whatsappNumber` — full international number with digits only, including the country code. Example format for Kenya: `2547XXXXXXXX`. Do not include a plus sign or spaces.
2. **Enquiry form:** `formspreeEndpoint` — create a form at [Formspree](https://formspree.io/) and paste its endpoint, normally shaped like `https://formspree.io/f/xxxxxxxx`. Confirm the recipient email and test a real submission. The form button stays disabled until this is configured.
3. **Instagram:** `instagramUrl` — the full FrameCrest profile URL. The footer link stays hidden until this is configured.

The endpoint is a public form identifier, not a password or secret key.

## Portfolio imagery
The current Unsplash images are temporary visual references, not commissioned FrameCrest projects. Replace them with photographs owned by FrameCrest or licensed for this use. Update each image's alt text so it describes the actual photo. The portfolio page deliberately labels the current gallery as illustrative.

## Content and legal checks
- Confirm the service list matches what FrameCrest actually offers.
- Add a privacy notice before enabling the enquiry form and collecting personal information.
- Check every image licence and any client permissions.
- Confirm the final business name, contact details and social profile before connecting the custom domain.

## Domain
The intended domain is `framecrest.media`. The sitemap uses this planned canonical domain. Connect it in Cloudflare Pages after the preview site has been approved and DNS is ready.
