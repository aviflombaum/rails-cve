# Social preview

`public/og/rails-cve-v1.jpg`: 1200 × 630 JPEG, shared across Open Graph and X summary_large_image metadata. The image URL is absolute and versioned. Page-specific titles, descriptions and canonical URLs are server-rendered. No JavaScript or authentication is required to retrieve the image.

Created using the built-in image-generation tool, then resized and JPEG-encoded with macOS sips. The final project asset is checked in at `public/og/rails-cve-v1.jpg`; no external local file is required.

## Generation prompt

Use case: ads-marketing. Create a finished premium social sharing Open Graph image for the existing developer tool Rails CVE at rails-cve.avi.nyc. Wide landscape exactly 1200 x 630 pixels (1.905:1 aspect ratio). This is a sophisticated Swiss editorial design meets tactile red railway signal sculpture. Warm ivory paper background #faf8f4 with extremely subtle grain. On the left, small black wordmark 'rails / cve.' with red slash, then huge beautifully typeset heavy modern sans-serif headline on three lines: 'Security updates.' in near-black, 'Right on track.' in Rails red #cf3028. Beneath, smaller dark readable text exactly 'Rails advisories. Signed webhooks. Agent-ready.' Bottom left small monospaced text 'rails-cve.avi.nyc'. Right third: striking original sculptural illustration of two parallel glossy red rails curving upward into a minimalist red railway signal with one lit red circular lamp, dimensional polished lacquer, soft warm studio shadows, subtle concentric signal waves embossed into ivory background. Rails and signal symbolize the security relay, not an actual train. Restrained palette red, warm cream, near-black only. Confident design, lots of negative space, exceptional typography, no gradients on text, no generic cybersecurity shields, no padlocks, no robots, no browser mockups, no extra text, no official Rails logo, no watermark. Keep ALL text fully visible within 65px safe margins. Text large and legible at thumbnail size; illustration supporting not overwhelming headline. The composition must fit 1200x630 with no cropping of headline.

## References

- https://ogp.me/ — Open Graph properties, image dimensions and alt text.
- https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image — large-image social card entry point.

## Deployment verification

Deployed 2026-09-22, Typecheck and all 14 existing tests passed. Live homepage, advisory detail and documentation HTML were fetched using a Twitterbot user agent and checked for correct canonical URLs, image metadata and large-image card configuration. The live image returns HTTP 200 with image/jpeg and matches the local file byte for byte (204,591 bytes). Actual platform previews may retain their own cached versions until they recrawl.
