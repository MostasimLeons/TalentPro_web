# Phase 1 – Hero (3D layer) · v2

Built from the live theme (TP-WP-Theme-main, Tailwind v4.3.3 build, Manrope font).
No text, links, template markup, PHP logic, plugins or forms are changed.

## What changed in v2
- **Classic scripts only.** No ES modules. Three.js is a custom classic build of r170
  (`three-tp3d.min.js`, exposed as `window.TP3D_THREE`): 489 KB minified, 128 KB gzipped.
- **The hero no longer depends on GSAP**, so there's one less file that can fail. GSAP
  stays in `vendor/` for Phase 2 but isn't loaded yet.
- **Sturdier hero lookup.** It finds the hero by `data-hero-lines` (the animated headline),
  not by the image URL, so lazy-load and CDN plugins that rewrite `src` can't break it.
- **Fallback if the inline config is stripped.** If an optimizer removes `window.TP3D`,
  the script works out the Three.js URL from its own location.
- **Stronger effect.** 96 nodes in near, mid and far depth bands, plus 260 dust particles.
  The camera follows the mouse, so near nodes shift much more than far ones.
  The photo moves ±24px, and a soft blue glow follows the cursor.
- **Debug mode and status flag** (see below).
- **New colors, sitewide**, via `tp-3d-colors.css`.

## Colors used
| Role | Old | New | Source |
|---|---|---|---|
| Buttons, links, accent text (`--color-cta`) | #dd523d | **#0077B6** | deeper step of the logo blue, so white text passes WCAG AA (your choice) |
| Button hover (`--color-cta-hover`) | #c8452f | #00669C | one step darker |
| Glows, hero nodes (`--tp-accent`) | – | **#00ADEE** | exact fill in `assets/images/talentpro-logo.svg` (you suggested ~#00A8E8) |
| Dark overlay / background (`--color-footer-bg`, hero overlay) | #062826 | **#101818** | your value |
| Footer bottom, marquee fade | #041d1b / #041c1a | #0B1111 | darker step of #101818 |
| Service card gradient top (inline style) | #0f5d59 | #1E2B2B | lighter step of #101818 |

The theme hard-codes the old colors in about 95 compiled rules, not only in variables.
`tools/color-override/build_color_override.py` generated an override file that copies
only those declarations with the new color. Re-run it if the theme's Tailwind CSS is
rebuilt. On the homepage I confirmed that no element is still painted coral or teal.

**Contrast** (homepage, measured in the browser):
- White on the #0077B6 buttons: **4.83:1** (passes AA). The old coral was 3.93:1.
- #0077B6 links and headings on white: **4.87:1** (passes AA).
- The small "01 / 02 / 03" step numbers sit on a light gray-to-white gradient card.
  At the gray end they measure about **4.0:1**, slightly under AA for 16px text.
  They were lower with coral (~3.3:1). This can be fixed in a later phase if you want.

## Files (upload into `wp-content/themes/TP-WP-Theme-main/`)
```
inc/tp-3d-enqueue.php                   loader (colors sitewide, hero on the front page only)
assets/tp3d/css/tp-3d-colors.css        color override (generated)
assets/tp3d/css/tp-3d-hero.css
assets/tp3d/js/tp-3d-hero.js
assets/tp3d/vendor/three-tp3d.min.js    Three.js r170, classic build
assets/tp3d/vendor/gsap.min.js          GSAP 3.12.5 (Phase 2, not loaded yet)
assets/tp3d/vendor/ScrollTrigger.min.js (Phase 2, not loaded yet)
```
**Delete** the old `assets/tp3d/vendor/three.module.min.js` from staging if you uploaded v1.

`functions.php` needs this one line at the very end (same as v1):
```php
require get_template_directory() . '/inc/tp-3d-enqueue.php'; // TP 3D redesign
```

## How to test the full effect on desktop
1. Use a desktop browser window **at least 768px wide**, with a mouse or trackpad.
2. Turn **off** "reduce motion" in the OS:
   - Windows: Settings → Accessibility → Visual effects → Animation effects **On**.
   - macOS: System Settings → Accessibility → Display → Reduce motion **Off**.
3. Turn off any data-saver or "Lite mode" setting in the browser.
4. Clear the cache in your caching plugin, CDN and browser, then open
   `https://<staging>/?tp3d=debug` and press F12 → Console. You should see:
   ```
   [TP3D] script running …
   [TP3D] hero found
   [TP3D] loading Three.js (classic build): …/three-tp3d.min.js
   TP 3D hero started
   [TP3D] Three.js r170 | webgl2 | canvas 1440x900 | nodes 96 | dust 260
   [TP3D] status → running
   ```
5. Move the mouse across the hero. The photo shifts slightly, and the blue and white
   network shifts more because it sits nearer. A blue glow follows the cursor.
6. Without debug mode, you can still check the `<html>` tag in DevTools → Elements:
   `data-tp3d="running"` means the full effect is on. Otherwise it gives the reason:

| `data-tp3d` value | Meaning / fix |
|---|---|
| *(missing)* | The script never ran: `require` line missing, wrong path, or delayed by an optimizer (see exclusions) |
| `skipped:prefers-reduced-motion` | OS "reduce motion" is on (step 2) |
| `skipped:hero-not-found` | Hero markup changed; send me the hero HTML |
| `running:parallax-only(mobile)` | Window narrower than 768px |
| `running:parallax-only(no-webgl)` | Browser hardware acceleration is off |
| `running:parallax-only(save-data)` | Data saver is on |
| `running:parallax-only(three-failed)` | `three-tp3d.min.js` returned 404; check the upload path |
| `running:loading-3d` (stays) | Three.js is being delayed by an optimizer (see exclusions) |

Mobile check: at phone width, the Network tab must **not** show `three-tp3d.min.js`.

## Caching / optimization plugin exclusions
The scripts already carry `data-no-optimize`, `data-no-defer`, `data-no-minify` and
`data-cfasync="false"`, which LiteSpeed and Cloudflare honor. For other plugins, add these:

- **WP Rocket**
  - File Optimization → *Excluded JavaScript Files*: `/wp-content/themes/TP-WP-Theme-main/assets/tp3d/(.*).js`
  - *Delay JavaScript execution* → Excluded: `tp-3d-hero`, `three-tp3d`, `window.TP3D`
  - *Load JavaScript deferred* → Excluded: `tp-3d-hero`
  - *Remove Unused CSS* → CSS safelist: `.tp3d-hero`, `.tp3d-hero__bg`, `.tp3d-hero__img`,
    `.tp3d-hero__canvas`, `.tp3d-hero__glow`, `.is-ready`, `.is-pointer`
- **LiteSpeed Cache**
  - Page Optimization → JS Settings → *JS Excludes*, *JS Deferred/Delayed Excludes*: `tp3d`
  - CSS Settings → *UCSS Selector Allowlist*: the same classes as above
- **Autoptimize**
  - JS → *Exclude scripts*: `tp3d, TP3D`
  - CSS: if "Remove unused CSS" (Critical CSS add-on) is on, allowlist the classes above.
- **SiteGround Optimizer**
  - Frontend → JavaScript → exclude from *Minify*, *Combine* and *Defer*: `tp3d-hero`
- **W3 Total Cache**
  - Minify → JS → *Never minify the following JS files*: `wp-content/themes/TP-WP-Theme-main/assets/tp3d/`
- **Cloudflare**
  - Rocket Loader is skipped automatically (`data-cfasync="false"`).

Why the CSS allowlist matters: these classes are added by JavaScript, so "unused CSS"
tools don't see them in the HTML and would strip the rules.

## Roll back
Comment out the `require` line in `functions.php`. The site, including the colors,
is then exactly as before. To remove everything, also delete `inc/tp-3d-enqueue.php`
and `assets/tp3d/`. To roll back only the colors, delete `assets/tp3d/css/tp-3d-colors.css`.
