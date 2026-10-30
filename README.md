# FrameCrest — Visual Studio website

A responsive, editorial-style portfolio website for FrameCrest, built with plain HTML, CSS and vanilla JavaScript. It has no build tools, framework dependencies or paid libraries.

## Website files
- `index.html` — homepage and studio introduction
- `portfolio.html` — selected work gallery
- `services.html` — service descriptions and workflow
- `about.html` — studio approach and values
- `contact.html` — enquiry form and WhatsApp contact
- `styles.css` — responsive layouts and visual styling
- `script.js` — mobile navigation, WhatsApp and Instagram configuration, and contact form handling
- `assets/favicon.svg` — browser tab icon

## Deploy with Cloudflare Pages
1. In Cloudflare, open **Workers & Pages** and select **Create**.
2. Choose **Pages** and connect to Git.
3. Select the `johnwayne254/framecrest-website` repository and the `main` branch.
4. Choose **None** as the framework preset.
5. Leave the build command empty.
6. Set the build output directory to `.` (the repository root).
7. Deploy. Cloudflare will provide a temporary `pages.dev` address for testing.

## Required pre-launch configuration
1. **WhatsApp:** In `script.js`, set `whatsappNumber` to the studio's full international phone number using digits only (for example, a Kenyan number starts with `254`, without a plus sign). The floating WhatsApp button stays hidden until a valid number is added.
2. **Contact form:** Create a form at [Formspree](https://formspree.io/), copy its endpoint and set `formspreeEndpoint` in `script.js`. Test a submission and confirm the destination email.
3. **Instagram:** Set `instagramUrl` in `script.js` to the real studio profile URL.
4. **Portfolio photos:** Replace the Unsplash demonstration images in `index.html` with photographs owned by or licensed to FrameCrest. Current photos are illustrative placeholders, not examples of FrameCrest client work.
5. **Business details:** Confirm that the service list and descriptions match the services actually offered. Add a real business email and any location or service-area details when available.
6. **Privacy:** Add a privacy notice before collecting visitor information through the contact form.

## Contact form status
The form UI and submission handler are included. The form does not transmit personal information until a real Formspree endpoint is added. This prevents enquiries from appearing to send when no receiving service is configured.

## Domain
The intended domain is `framecrest.media`. Connect it in Cloudflare Pages after the preview site has been checked. Update the registrar nameservers only when ready to move DNS management to Cloudflare.