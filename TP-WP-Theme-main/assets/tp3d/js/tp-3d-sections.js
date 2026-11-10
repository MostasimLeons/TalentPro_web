/*!
 * TalentPro 3D layer – Phase 2: glass cards, tilt, scroll-in (classic script)
 *
 *   1. "What Drives" slides : glass panel behind each slide's text, scroll-in,
 *                              soft panel fade on slide change. The theme's video
 *                              and slide switching are untouched (read-only observer).
 *   2. Service cards        : glass edge, 3D tilt + cursor reflection, staggered rise.
 *   3. Numbered cards       : same glass edge + tilt (the theme already reveals them).
 *   4. Six Areas grid       : premium card layer, gentle resting tilt toward the
 *                              centre, cursor reflection, staggered scroll-in (Phase 3).
 *   5. Case Studies         : premium cards + 3D coverflow on >= 768px (Phase 4).
 *
 * Tilt uses the CSS `rotate` property and scroll-in uses `transform`/`opacity`,
 * so neither collides with the theme's hover lift (`translate`) or its reveals.
 * GSAP + ScrollTrigger are injected after page load (never on reduced motion).
 * Status: <html data-tp3d-sections="…">.  Debug: add ?tp3d=debug to the URL.
 */
(function () {
	'use strict';

	var DEBUG = /[?&]tp3d=debug\b/.test(location.search);
	var root = document.documentElement;
	var currentScript = document.currentScript;
	var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
	var fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');

	function log() {
		if (DEBUG && window.console) {
			console.log.apply(console, ['[TP3D sections]'].concat([].slice.call(arguments)));
		}
	}

	function status(s) {
		root.setAttribute('data-tp3d-sections', s);
		log('status →', s);
	}

	function vendorUrl(key, file) {
		var cfg = window.TP3D || {};
		if (cfg[key]) return cfg[key];
		// Fallback if an optimiser stripped the inline config: derive from our own URL.
		var src = (currentScript && currentScript.src) || '';
		return src ? src.replace(/\/js\/[^\/]*$/, '/vendor/' + file) : '';
	}

	function loadScript(url) {
		return new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = url;
			s.async = false;
			s.setAttribute('data-no-optimize', '1');
			s.setAttribute('data-cfasync', 'false');
			s.onload = resolve;
			s.onerror = function () { reject(new Error('failed: ' + url)); };
			document.head.appendChild(s);
		});
	}

	function loadGsap() {
		if (window.gsap && window.ScrollTrigger) return Promise.resolve();
		var g = window.gsap ? Promise.resolve() : loadScript(vendorUrl('gsapUrl', 'gsap.min.js'));
		return g.then(function () {
			return window.ScrollTrigger ? null : loadScript(vendorUrl('stUrl', 'ScrollTrigger.min.js'));
		}).then(function () {
			window.gsap.registerPlugin(window.ScrollTrigger);
		});
	}

	function afterLoad(fn) {
		var run = function () {
			(window.requestIdleCallback || function (f) { return setTimeout(f, 200); })(fn, { timeout: 1500 });
		};
		if (document.readyState === 'complete') run();
		else window.addEventListener('load', run, { once: true });
	}

	/** true when the element is still below the fold (safe to hide and animate in) */
	function belowFold(el) {
		return el.getBoundingClientRect().top > window.innerHeight * 0.92;
	}

	/* ==================================================================
	   1. WHAT DRIVES – glass panels
	   ================================================================== */
	var range = document.createRange();

	function isDesktop() {
		return window.innerWidth >= 1024;
	}

	function cssPx(name, fallback) {
		var v = parseFloat(getComputedStyle(root).getPropertyValue(name));
		return isNaN(v) ? fallback : v;
	}

	/** [vertical, horizontal] card padding; set per breakpoint in tp-3d-sections.css */
	function panelPad() {
		return [cssPx('--tp-card-pad-y', 40), cssPx('--tp-card-pad-x', 40)];
	}

	function sizePanel(text, panel) {
		var tr = text.getBoundingClientRect();
		var minL = Infinity, maxR = -Infinity, minT = Infinity, maxB = -Infinity;

		for (var i = 0; i < text.children.length; i++) {
			var el = text.children[i];
			if (el === panel || !el.offsetParent) continue;            // skip panel + hidden nodes
			// vertical: layout offsets (immune to the theme's translate animations)
			minT = Math.min(minT, el.offsetTop);
			maxB = Math.max(maxB, el.offsetTop + el.offsetHeight);
			// horizontal: real text extent (block children are stretched wider than
			// their text, so measure each visible text run instead of the boxes)
			var rects = [];
			if (el.tagName === 'A' || el.tagName === 'BUTTON') {
				rects.push(el.getBoundingClientRect());
			} else {
				var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
				for (var n = walker.nextNode(); n; n = walker.nextNode()) {
					if (!n.nodeValue.trim()) continue;
					range.selectNodeContents(n);
					rects.push(range.getBoundingClientRect());
				}
			}
			rects.forEach(function (r) {
				if (!r.width) return;
				minL = Math.min(minL, r.left - tr.left);
				maxR = Math.max(maxR, r.right - tr.left);
			});
		}
		if (!isFinite(minL) || !isFinite(minT)) return;

		var p = panelPad();
		if (isDesktop()) {
			// desktop: anchored to the text's left edge, width = --tp-card-width (CSS)
			panel.style.left = (minL - p[1]).toFixed(1) + 'px';
			panel.style.width = '';
		} else {
			// tablet/phone: full slide width minus the gutter (text is inset by CSS)
			var gutter = cssPx('--tp-card-gutter', 16);
			var slide = text.offsetParent || text.parentElement;
			panel.style.left = (gutter - text.offsetLeft).toFixed(1) + 'px';
			panel.style.width = Math.max(0, slide.clientWidth - gutter * 2).toFixed(1) + 'px';
		}
		panel.style.top = (minT - p[0]).toFixed(1) + 'px';
		panel.style.height = (maxB - minT + p[0] * 2).toFixed(1) + 'px';
		panel.classList.add('is-sized');
	}

	/**
	 * Autoplay progress line on the active 01/02/03 button (CSS animation).
	 * Kept in step with the theme's timer, read-only: the theme pauses autoplay
	 * while focus is inside the carousel and restarts its 6s timer on every
	 * button click, so the line is hidden/restarted at the same moments.
	 */
	function setupProgress(carousel) {
		if (reduceMQ.matches) return;          // the theme has no autoplay then
		var on = function () { carousel.classList.add('tp3d-progress'); };
		var restart = function () {
			carousel.classList.remove('tp3d-progress');
			void carousel.offsetWidth;            // reflow so the animation starts over
			if (!carousel.contains(document.activeElement)) on();
		};
		on();
		carousel.addEventListener('focusin', function () { carousel.classList.remove('tp3d-progress'); });
		carousel.addEventListener('focusout', function (e) {
			if (!carousel.contains(e.relatedTarget)) restart();
		});
		carousel.addEventListener('click', function (e) {
			if (e.target.closest('.wd-step, .wd-dot, .wd-prev, .wd-next')) setTimeout(restart, 0);
		});
	}

	function setupWhatDrives() {
		var carousel = document.querySelector('.wd-carousel');
		if (!carousel) return null;

		var slides = [].slice.call(carousel.querySelectorAll('.wd-slide'));
		var pairs = [];

		carousel.classList.add('tp3d-wd');
		slides.forEach(function (slide) {
			var text = slide.querySelector('.wd-text');
			if (!text) return;
			var panel = document.createElement('div');
			panel.className = 'tp3d-wd-glass';
			panel.setAttribute('aria-hidden', 'true');
			text.appendChild(panel); // last child: the theme's :nth-child delays are unchanged
			pairs.push({ slide: slide, text: text, panel: panel });
		});

		var resizeAll = function () {
			pairs.forEach(function (p) { sizePanel(p.text, p.panel); });
		};
		resizeAll();
		if (document.fonts && document.fonts.ready) document.fonts.ready.then(resizeAll);
		if ('ResizeObserver' in window) {
			var ro = new ResizeObserver(function () { resizeAll(); });
			pairs.forEach(function (p) { ro.observe(p.text); });
		} else {
			window.addEventListener('resize', resizeAll);
		}

		setupProgress(carousel);
		log('what-drives panels:', pairs.length);
		return { carousel: carousel, pairs: pairs };
	}

	function animateWhatDrives(wd) {
		var gsap = window.gsap;

		// Scroll-in (once), only if the carousel has not been seen yet.
		if (belowFold(wd.carousel)) {
			var tl = gsap.timeline({
				scrollTrigger: { trigger: wd.carousel, start: 'top 78%', once: true }
			});
			tl.from(wd.pairs.map(function (p) { return p.panel; }), {
				opacity: 0, y: 46, scale: 0.97, transformOrigin: '0% 50%',
				duration: 1.1, ease: 'power3.out', clearProps: 'transform,opacity'
			}, 0).from(wd.pairs.map(function (p) { return p.text; }), {
				opacity: 0, y: 30, duration: 1.0, ease: 'power3.out', clearProps: 'transform,opacity'
			}, 0.12);
		}

		// Slide change: gentle panel fade. Read-only: we only observe data-active.
		var mo = new MutationObserver(function (list) {
			list.forEach(function (m) {
				if (m.target.getAttribute('data-active') !== 'true') return;
				wd.pairs.forEach(function (p) {
					if (p.slide !== m.target) return;
					gsap.fromTo(p.panel, { opacity: 0, y: 16 }, {
						opacity: 1, y: 0, duration: 0.5, delay: 0.05, ease: 'power3.out',
						clearProps: 'transform,opacity', overwrite: true
					});
				});
			});
		});
		wd.pairs.forEach(function (p) {
			mo.observe(p.slide, { attributes: true, attributeFilter: ['data-active'] });
		});
	}

	/* ==================================================================
	   2 + 3. CARDS – glass edge, tilt, reflection
	   ================================================================== */
	function tiltMax() {
		var v = parseFloat(getComputedStyle(root).getPropertyValue('--tp-tilt-max'));
		return isNaN(v) ? 7 : v;
	}

	function decorateCard(card, kind) {
		card.classList.add('tp3d-card', kind);
		if (card.parentElement) card.parentElement.classList.add('tp3d-tilt-group');

		var fx = document.createElement('span');
		fx.className = 'tp3d-card__fx';
		fx.setAttribute('aria-hidden', 'true');
		var glare = document.createElement('span');
		glare.className = 'tp3d-card__glare';
		fx.appendChild(glare);
		card.appendChild(fx);

		var rect = null, max = 7;
		var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;

		function frame() {
			cx += (tx - cx) * 0.14;
			cy += (ty - cy) * 0.14;
			var ang = Math.sqrt(cx * cx + cy * cy);
			card.style.rotate = ang < 0.02 ? '' : cx.toFixed(3) + ' ' + cy.toFixed(3) + ' 0 ' + ang.toFixed(3) + 'deg';
			if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) {
				raf = requestAnimationFrame(frame);
			} else {
				raf = 0;
				if (!tx && !ty) card.style.rotate = '';
			}
		}
		function kick() { if (!raf) raf = requestAnimationFrame(frame); }

		function allowed(e) {
			return fineMQ.matches && !reduceMQ.matches && (!e.pointerType || e.pointerType === 'mouse');
		}

		card.addEventListener('pointerenter', function (e) {
			if (!allowed(e)) return;
			rect = card.getBoundingClientRect();
			max = tiltMax();
			card.classList.add('is-tilting');
		});
		card.addEventListener('pointermove', function (e) {
			if (!rect || !allowed(e)) return;
			var x = e.clientX - rect.left, y = e.clientY - rect.top;
			var px = x / rect.width - 0.5, py = y / rect.height - 0.5;
			tx = -py * 2 * max;          // rotate around X (top/bottom)
			ty = px * 2 * max;           // rotate around Y (left/right)
			var a = Math.sqrt(tx * tx + ty * ty);
			if (a > max) { tx *= max / a; ty *= max / a; } // corners never exceed --tp-tilt-max
			glare.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
			kick();
		});
		card.addEventListener('pointerleave', function () {
			rect = null;
			tx = ty = 0;
			card.classList.remove('is-tilting');
			kick();
		});
	}

	function setupCards() {
		var svc = [].slice.call(document.querySelectorAll('[data-reveal="bloom"].hover-lift'));
		var ns = [].slice.call(document.querySelectorAll('[data-ns-item]'));
		svc.forEach(function (c) { decorateCard(c, 'tp3d-svc'); });
		ns.forEach(function (c) { decorateCard(c, 'tp3d-ns'); });
		log('service cards:', svc.length, '| numbered cards:', ns.length);
		return { svc: svc, ns: ns };
	}

	function animateCards(cards) {
		// Service cards: staggered fade-and-rise. The numbered cards already have the
		// theme's own staggered reveal, so they are left alone here.
		if (!cards.svc.length || !belowFold(cards.svc[0])) return;
		window.gsap.from(cards.svc, {
			opacity: 0, y: 56, duration: 1.0, ease: 'power3.out', stagger: 0.14,
			clearProps: 'transform,opacity',
			scrollTrigger: { trigger: cards.svc[0].parentElement, start: 'top 85%', once: true }
		});
	}

	/* ==================================================================
	   4. SIX AREAS – resting tilt toward the centre, cursor reflection,
	      staggered scroll-in. Hover lift/glow itself is pure CSS.
	   ================================================================== */
	function cssNum(name, fallback) {
		var v = parseFloat(getComputedStyle(root).getPropertyValue(name));
		return isNaN(v) ? fallback : v;
	}

	/** page position from layout offsets (ignores transforms and tilt) */
	function layoutPos(el) {
		var x = 0, y = 0;
		for (; el; el = el.offsetParent) { x += el.offsetLeft; y += el.offsetTop; }
		return [x, y];
	}

	function setupSixAreas() {
		var tiles = [].slice.call(document.querySelectorAll('a[data-reveal="tile"]'));
		if (!tiles.length) return null;

		// smallest ancestor holding every card = the grid
		var grid = tiles[0].parentElement;
		while (grid && !tiles.every(function (t) { return grid.contains(t); })) grid = grid.parentElement;
		if (!grid) return null;
		grid.classList.add('tp3d-sa-grid');

		tiles.forEach(function (t) {
			t.classList.add('tp3d-sa');
			for (var p = t.parentElement; p && p !== grid; p = p.parentElement) p.classList.add('tp3d-sa-wrap');

			// Decorative layer, inserted BEFORE the text block so the theme's
			// `>:last-child` (text) reveal selectors still match the same element.
			var fx = document.createElement('span');
			fx.className = 'tp3d-sa__fx';
			fx.setAttribute('aria-hidden', 'true');
			var glare = document.createElement('span');
			glare.className = 'tp3d-sa__glare';
			fx.appendChild(glare);
			t.insertBefore(fx, t.lastElementChild);

			// Cursor reflection (mouse only)
			var rect = null;
			t.addEventListener('pointerenter', function (e) {
				if (!fineMQ.matches || reduceMQ.matches || (e.pointerType && e.pointerType !== 'mouse')) return;
				rect = t.getBoundingClientRect();
				t.classList.add('is-lit');
			});
			t.addEventListener('pointermove', function (e) {
				if (!rect) return;
				glare.style.transform = 'translate3d(' + (e.clientX - rect.left).toFixed(1) + 'px,' +
					(e.clientY - rect.top).toFixed(1) + 'px,0)';
			});
			t.addEventListener('pointerleave', function () {
				rect = null;
				t.classList.remove('is-lit');
			});
		});

		// Resting tilt: each card turns a little toward the grid centre.
		// Uses layout offsets (unaffected by transforms) – no layout reads in a loop
		// of writes, and only on load/resize.
		function place() {
			var on = fineMQ.matches && !reduceMQ.matches && window.innerWidth >= 768;
			grid.classList.toggle('tp3d-sa-3d', on);
			if (!on) return;
			var max = cssNum('--tp-grid-tilt', 2.5);
			var g = layoutPos(grid);
			var gx = g[0] + grid.offsetWidth / 2, gy = g[1] + grid.offsetHeight / 2;
			var vals = tiles.map(function (t) {
				var p = layoutPos(t);
				var nx = (p[0] + t.offsetWidth / 2 - gx) / (grid.offsetWidth / 2);
				var ny = (p[1] + t.offsetHeight / 2 - gy) / (grid.offsetHeight / 2);
				var rx = ny * max * 0.7;             // top row looks down, bottom row looks up
				var ry = -nx * max;                  // left column looks right, right looks left
				var a = Math.sqrt(rx * rx + ry * ry);
				return a < 0.01 ? [0, 1, 0] : [rx / a, ry / a, a];
			});
			// every card leans by 75–100% of --tp-grid-tilt (outer cards the most)
			var top = Math.max.apply(null, vals.map(function (v) { return v[2]; })) || 1;
			vals.forEach(function (v) { if (v[2]) v[2] = max * (0.75 + 0.25 * v[2] / top); });
			tiles.forEach(function (t, i) {
				t.style.setProperty('--tp-sa-ax', vals[i][0].toFixed(3));
				t.style.setProperty('--tp-sa-ay', vals[i][1].toFixed(3));
				t.style.setProperty('--tp-sa-angle', vals[i][2].toFixed(2) + 'deg');
			});
		}
		place();
		var rt;
		window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(place, 150); });
		if (fineMQ.addEventListener) fineMQ.addEventListener('change', place);
		if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);

		// Visual reading order: left → right, top → bottom.
		var ordered = tiles.slice().sort(function (a, b) {
			var pa = layoutPos(a), pb = layoutPos(b);
			return Math.abs(pa[1] - pb[1]) > 8 ? pa[1] - pb[1] : pa[0] - pb[0];
		});
		// Line the theme's own photo-wipe delay up with the same order.
		ordered.forEach(function (t, i) { t.style.setProperty('--reveal-delay', (i * 110) + 'ms'); });

		log('six areas cards:', tiles.length);
		return { grid: grid, tiles: ordered };
	}

	function animateSixAreas(sa) {
		var gsap = window.gsap;
		var hidden = sa.tiles.filter(belowFold);   // never hide a card already on screen
		if (!hidden.length) return;
		gsap.set(hidden, { opacity: 0, y: 44 });
		window.ScrollTrigger.batch(hidden, {
			start: 'top 90%',
			once: true,
			onEnter: function (batch) {
				batch.sort(function (a, b) { return sa.tiles.indexOf(a) - sa.tiles.indexOf(b); });
				gsap.to(batch, {
					opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.11,
					clearProps: 'transform,opacity'
				});
			}
		});
	}

	/* ==================================================================
	   5. CASE STUDIES – 3D coverflow (>= 768px)
	   The theme's own slider (app.js) only works on phones (scroll-snap).
	   From 768px up this turns the stacked cards into a coverflow. All
	   positions are CSS (tp-3d-sections.css, section 5) driven by two custom
	   properties per card; this code only decides which card is active.
	   Read-only towards the theme: its dots/counter are updated the same way
	   app.js does, and if app.js changes the active dot we follow it.
	   ================================================================== */
	var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

	function setupCases() {
		var carousel = document.querySelector('[data-support-carousel]');
		if (!carousel) return null;
		var track = carousel.querySelector('[data-support-track]');
		var cards = [].slice.call(carousel.querySelectorAll('[data-support-card]'));
		var dots = [].slice.call(carousel.querySelectorAll('[data-support-dot]'));
		var count = carousel.querySelector('[data-support-count]');
		if (!track || cards.length < 2) return null;

		var n = cards.length, active = 0, on = false, syncing = false;
		var wideMQ = window.matchMedia('(min-width: 768px)');

		// Accessibility: name the region (no visible text changes)
		carousel.setAttribute('role', 'region');
		carousel.setAttribute('aria-roledescription', 'carousel');
		if (!carousel.hasAttribute('aria-label')) carousel.setAttribute('aria-label', 'Case studies');

		// Arrow buttons, placed around the theme's dots + counter row
		var controls = dots.length ? dots[0].parentElement.parentElement : null;
		var prev = document.createElement('button');
		var next = document.createElement('button');
		[[prev, 'Previous case study', 'tp3d-cf-arrow--prev'], [next, 'Next case study', 'tp3d-cf-arrow--next']].forEach(function (b) {
			b[0].type = 'button';
			b[0].className = 'tp3d-cf-arrow ' + b[2];
			b[0].setAttribute('aria-label', b[1]);
			b[0].innerHTML = ARROW;
		});
		prev.querySelector('svg').style.transform = 'scaleX(-1)';
		if (controls) {
			controls.insertBefore(prev, controls.firstChild);
			controls.appendChild(next);
		}

		// Per-card reflection layer + remembered tabindex of the card's links
		cards.forEach(function (c) {
			var fx = document.createElement('span');
			fx.className = 'tp3d-cf-glare';
			fx.setAttribute('aria-hidden', 'true');
			fx.appendChild(document.createElement('span'));
			c.appendChild(fx);
		});

		function offset(i, pos) {
			var d = i - pos;
			if (d > n / 2) d -= n;
			if (d < -n / 2) d += n;
			return d;
		}

		function paint(pos) {
			cards.forEach(function (c, i) {
				var d = offset(i, pos);
				c.style.setProperty('--cf-d', d.toFixed(4));
				c.style.setProperty('--cf-ad', Math.abs(d).toFixed(4));
				c.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
			});
		}

		function setTabbable(card, yes) {
			card.querySelectorAll('a, button, [tabindex]').forEach(function (el) {
				if (yes) {
					if (el.hasAttribute('data-tp3d-tab')) {
						var t = el.getAttribute('data-tp3d-tab');
						if (t === '') el.removeAttribute('tabindex'); else el.setAttribute('tabindex', t);
						el.removeAttribute('data-tp3d-tab');
					}
				} else if (!el.hasAttribute('data-tp3d-tab')) {
					el.setAttribute('data-tp3d-tab', el.getAttribute('tabindex') || '');
					el.setAttribute('tabindex', '-1');
				}
			});
		}

		function updateA11y() {
			cards.forEach(function (c, i) {
				var cur = !on || i === active;
				c.classList.toggle('is-active', on && i === active);
				if (on) {
					c.setAttribute('aria-roledescription', 'slide');
					c.setAttribute('aria-label', (i + 1) + ' of ' + n);
				}
				if (cur) c.removeAttribute('aria-hidden'); else c.setAttribute('aria-hidden', 'true');
				setTabbable(c, cur);
			});
		}

		// Same updates app.js makes on phones (dots + "01 / 03" counter)
		function updateThemeUi() {
			syncing = true;
			dots.forEach(function (d, i) { d.setAttribute('data-active', i === active ? 'true' : 'false'); });
			if (count) count.textContent = String(active + 1).padStart(2, '0');
			syncing = false;
		}

		function go(i) {
			active = ((i % n) + n) % n;
			if (!on) return;
			paint(active);
			updateA11y();
			updateThemeUi();
		}

		function enable() {
			if (on) return;
			on = true;
			carousel.classList.add('tp3d-cf');
			carousel.classList.toggle('tp3d-cf--fade', reduceMQ.matches);
			if (controls) controls.classList.add('tp3d-cf-controls');
			cards.forEach(function (c) { c.classList.add('tp3d-cf-card'); });
			go(active);
		}

		function disable() {
			if (!on) return;
			on = false;
			carousel.classList.remove('tp3d-cf', 'tp3d-cf--fade', 'is-dragging');
			if (controls) controls.classList.remove('tp3d-cf-controls');
			cards.forEach(function (c) {
				c.classList.remove('tp3d-cf-card', 'is-active', 'is-lit');
				c.style.removeProperty('--cf-d');
				c.style.removeProperty('--cf-ad');
				c.style.zIndex = '';
				c.style.rotate = '';
				c.removeAttribute('aria-roledescription');
				c.removeAttribute('aria-label');
			});
			updateA11y();
			// hand the phone slider back to the theme in a consistent state
			track.scrollLeft = 0;
			active = 0;
			updateThemeUi();
		}

		function mode() { if (wideMQ.matches) enable(); else disable(); }
		if (wideMQ.addEventListener) wideMQ.addEventListener('change', mode);
		else if (wideMQ.addListener) wideMQ.addListener(mode);
		mode();

		// Controls
		prev.addEventListener('click', function () { go(active - 1); });
		next.addEventListener('click', function () { go(active + 1); });
		// Dots: app.js also handles the click (it scrolls the phone track);
		// on wide screens we move the coverflow.
		dots.forEach(function (d, i) { d.addEventListener('click', function () { if (on) go(i); }); });
		// If app.js changes the active dot itself, follow it.
		if ('MutationObserver' in window) {
			var mo = new MutationObserver(function () {
				if (!on || syncing) return;
				for (var i = 0; i < dots.length; i++) {
					if (dots[i].getAttribute('data-active') === 'true' && i !== active) { go(i); break; }
				}
			});
			dots.forEach(function (d) { mo.observe(d, { attributes: true, attributeFilter: ['data-active'] }); });
		}

		// Keyboard: left/right arrows anywhere inside the carousel
		carousel.addEventListener('keydown', function (e) {
			if (!on || e.altKey || e.ctrlKey || e.metaKey) return;
			if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1); }
			else if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
		});

		// Click on a side card brings it to the front (its links stay inactive)
		track.addEventListener('click', function (e) {
			if (!on) return;
			if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; return; }
			var c = e.target.closest('[data-support-card]');
			if (!c) return;
			var i = cards.indexOf(c);
			if (i !== active) { e.preventDefault(); e.stopPropagation(); go(i); }
		}, true);

		// Swipe (touch/pen) and drag (mouse) on wide screens
		var startX = 0, startY = 0, dragging = false, pid = null, suppressClick = false, width = 1;
		track.addEventListener('pointerdown', function (e) {
			if (!on || (e.pointerType === 'mouse' && e.button !== 0)) return;
			pid = e.pointerId;
			startX = e.clientX;
			startY = e.clientY;
			dragging = false;
			var c = cards[active];
			width = c.offsetWidth * (parseFloat(getComputedStyle(root).getPropertyValue('--tp-cover-spread')) || 0.64);
		});
		track.addEventListener('pointermove', function (e) {
			if (!on || e.pointerId !== pid) return;
			var dx = e.clientX - startX, dy = e.clientY - startY;
			if (!dragging) {
				if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
				dragging = true;
				carousel.classList.add('is-dragging');
				try { track.setPointerCapture(pid); } catch (err) { /* ignore */ }
			}
			if (!reduceMQ.matches) paint(active - Math.max(-1, Math.min(1, dx / width)));
		});
		function endDrag(e) {
			if (e.pointerId !== pid) return;
			pid = null;
			if (!dragging) return;
			dragging = false;
			suppressClick = true;
			setTimeout(function () { suppressClick = false; }, 50);
			carousel.classList.remove('is-dragging');
			var dx = e.clientX - startX;
			if (Math.abs(dx) > Math.min(90, width * 0.18)) go(active + (dx < 0 ? 1 : -1));
			else paint(active);
		}
		track.addEventListener('pointerup', endDrag);
		track.addEventListener('pointercancel', endDrag);
		track.addEventListener('dragstart', function (e) { if (on) e.preventDefault(); });

		// Active card: subtle cursor tilt + reflection (mouse only)
		var rect = null, tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, tiltCard = null;
		function frame() {
			cx += (tx - cx) * 0.14;
			cy += (ty - cy) * 0.14;
			var ang = Math.sqrt(cx * cx + cy * cy);
			if (tiltCard) tiltCard.style.rotate = ang < 0.02 ? '' : cx.toFixed(3) + ' ' + cy.toFixed(3) + ' 0 ' + ang.toFixed(3) + 'deg';
			if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) raf = requestAnimationFrame(frame);
			else { raf = 0; if (!tx && !ty && tiltCard) { tiltCard.style.rotate = ''; tiltCard = null; } }
		}
		function kick() { if (!raf) raf = requestAnimationFrame(frame); }
		cards.forEach(function (c) {
			var glare = c.querySelector('.tp3d-cf-glare > span');
			c.addEventListener('pointerenter', function (e) {
				if (!on || !c.classList.contains('is-active') || !fineMQ.matches || reduceMQ.matches || e.pointerType !== 'mouse') return;
				if (tiltCard && tiltCard !== c) tiltCard.style.rotate = '';
				tiltCard = c;
				rect = c.getBoundingClientRect();
				c.classList.add('is-lit');
			});
			c.addEventListener('pointermove', function (e) {
				if (!rect || tiltCard !== c || dragging) return;
				var x = e.clientX - rect.left, y = e.clientY - rect.top;
				var max = cssNum('--tp-cover-tilt', 5);
				tx = -(y / rect.height - 0.5) * 2 * max;
				ty = (x / rect.width - 0.5) * 2 * max;
				var a = Math.sqrt(tx * tx + ty * ty);
				if (a > max) { tx *= max / a; ty *= max / a; }
				glare.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
				kick();
			});
			c.addEventListener('pointerleave', function () {
				if (tiltCard !== c) return;
				rect = null;
				tx = ty = 0;
				c.classList.remove('is-lit');
				kick();
			});
		});
		// a slide change ends any tilt on the card that just left the centre
		carousel.addEventListener('click', function () {
			if (tiltCard && !tiltCard.classList.contains('is-active')) { rect = null; tx = ty = 0; tiltCard.classList.remove('is-lit'); kick(); }
		});

		log('case studies coverflow:', n, 'cards');
		return { carousel: carousel };
	}

	/* ==================================================================
	   Boot
	   ================================================================== */
	function init() {
		var wd = setupWhatDrives();
		var cards = setupCards();
		var sa = setupSixAreas();
		var cs = setupCases();

		if (!wd && !sa && !cs && !cards.svc.length && !cards.ns.length) {
			status('skipped:no-sections');
			return;
		}
		if (reduceMQ.matches) {
			status('static(prefers-reduced-motion)'); // glass styling only, no motion
			return;
		}

		status('running:loading-gsap');
		afterLoad(function () {
			loadGsap().then(function () {
				if (wd) animateWhatDrives(wd);
				animateCards(cards);
				if (sa) animateSixAreas(sa);
				window.ScrollTrigger.refresh();
				log('GSAP', window.gsap.version, 'ready');
				status(fineMQ.matches ? 'running' : 'running(touch: no tilt)');
			}).catch(function (err) {
				if (window.console) console.warn('[TP3D sections] GSAP unavailable, cards stay static:', err && err.message);
				status('running:no-gsap');
			});
		});
	}

	try {
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
		else init();
	} catch (err) {
		if (window.console) console.warn('[TP3D sections] init error:', err);
		status('skipped:init-error');
	}
})();
