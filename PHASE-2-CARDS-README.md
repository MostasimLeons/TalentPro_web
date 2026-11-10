# Phase 2 – Glass cards, tilt, scroll-in

No text, links, template markup, PHP logic, plugins or forms are changed. All new
elements are absolutely positioned overlays added by JS, so layout is identical
(measured CLS: 0.0000 across a full scroll at 1440px).

## What it does
| Section | Effect |
|---|---|
| **What Drives The Way We Build?** | Frosted glass panel behind each slide's text (blur, thin light edge, soft shadow), sized to hug the text. Slides rise in gently when the carousel scrolls into view. On each slide change the panel fades in softly. The video, autoplay, arrows, dots and 01/02/03 buttons are untouched (the script only *observes* `data-active`). |
| **Solve. Build. Operate.** | Light glass edge and top sheen, a subtle resting shadow, **3D tilt** that follows the mouse (capped at `--tp-tilt-max` = 7°, corners included) with a soft light reflection under the cursor. Staggered fade-and-rise on scroll-in (the theme's own colour "bloom" still plays). |
| **Building Something New…** (01/02/03) | Same glass edge, shadow, tilt and reflection (blue-tinted on these light cards). The theme's own staggered reveal is kept. **Number contrast fixed:** `#0077B6` → `#00669C`, now **5.2:1** on the gray end of the card and **6.2:1** on white (was ~4.0:1). |

- **Touch devices:** no tilt and no reflection. Scroll-in only.
- **Reduced motion:** the glass styling stays, with no tilt and no scroll-in. GSAP is not even downloaded.
- **Performance:**
  - GSAP and ScrollTrigger (about 45 KB gzipped) are injected after page load during idle time, front page only.
  - Animations use only `transform` / `opacity`, plus the CSS `rotate` property for the tilt.
  - Blur on phones is lowered to 6px.

## Tuning (top of `assets/tp3d/css/tp-3d-sections.css`)
```css
--tp-tilt-max: 7;            /* degrees; 0 = off, 6–8 subtle, 12+ strong        */
--tp-card-blur: 14px;        /* glass blur on the What Drives panel (desktop)    */
--tp-card-blur-mobile: 6px;  /* same on phones                                   */
--tp-card-border: 1px solid rgba(255,255,255,.22);  /* raise alpha = brighter edge */
--tp-glare-dark: .30;  --tp-glare-light: .22;       /* reflection strength         */
--tp-card-shadow: …;                                /* resting shadow              */
```

## Files changed
```
NEW      assets/tp3d/css/tp-3d-sections.css
NEW      assets/tp3d/js/tp-3d-sections.js
CHANGED  inc/tp-3d-enqueue.php        (+ GSAP URLs in window.TP3D, + Phase 2 enqueue)
already uploaded in Phase 1, now used:  assets/tp3d/vendor/gsap.min.js, ScrollTrigger.min.js
```

## Re-upload to staging (into `wp-content/themes/TP-WP-Theme-main/`)
1. `inc/tp-3d-enqueue.php` (overwrite)
2. `assets/tp3d/css/tp-3d-sections.css` (new)
3. `assets/tp3d/js/tp-3d-sections.js` (new)
4. Check that `assets/tp3d/vendor/gsap.min.js` and `ScrollTrigger.min.js` exist from Phase 1. Upload them if not.

`functions.php` needs no change.

## Test on staging
1. Purge the caching plugin, CDN and browser cache. Open `https://<staging>/?tp3d=debug` in a desktop window at least 768px wide, with OS "reduce motion" off. Open the Console. You should see
   `[TP3D sections] what-drives panels: 3`, `service cards: 3 | numbered cards: 3`, `GSAP 3.12.5 ready`,
   `status → running`. Without debug mode, `<html data-tp3d-sections="running">` shows the same.
2. Scroll down. The What Drives panel and text rise in, and the three service cards rise one after another. Click the arrows and dots: the video keeps playing, and the panel fades with each slide.
3. Hover the service and 01/02/03 cards. They tilt toward the cursor with a soft highlight and settle back on leave.
4. Phone, or DevTools device mode set to touch: no tilt, scroll-in only, no sideways scroll. Turn on OS "reduce motion": the status reads `static(prefers-reduced-motion)` and nothing moves.

| `data-tp3d-sections` | Meaning |
|---|---|
| *(missing)* | Script not loaded: check the upload path or optimizer settings |
| `running:loading-gsap` (stays) | GSAP delayed or blocked by an optimizer (see below) |
| `running:no-gsap` | `gsap.min.js` / `ScrollTrigger.min.js` returned 404. Cards are static but styled. |
| `running(touch: no tilt)` | Touch device, as intended |

**Optimizer exclusions:** the Phase 1 rules already match (`tp3d`, `/assets/tp3d/(.*).js`).
Add these classes to any "Remove unused CSS" safelist: `.tp3d-wd`, `.tp3d-wd-glass`,
`.is-sized`, `.tp3d-card`, `.tp3d-card__fx`, `.tp3d-card__glare`, `.tp3d-svc`, `.tp3d-ns`,
`.tp3d-tilt-group`, `.is-tilting`.

## Roll back
- **Phase 2 only:** delete `assets/tp3d/js/tp-3d-sections.js` and `assets/tp3d/css/tp-3d-sections.css`. The enqueue then points at missing files and does nothing, and Phase 1 keeps working.
- **Clean rollback:** re-upload the Phase 1 `inc/tp-3d-enqueue.php`. In git: `git show <phase-1-commit>:TP-WP-Theme-main/inc/tp-3d-enqueue.php`.
- **Everything:** comment out the `require` line in `functions.php`.
