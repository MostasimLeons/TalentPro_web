/*!
 * TalentPro 3D layer – Phase 2: glass cards, tilt, scroll-in (classic script)
 *
 *   1. "What Drives" slides : glass panel behind each slide's text, scroll-in,
 *                              soft panel fade on slide change. The theme's video
 *                              and slide switching are untouched (read-only observer).
 *   2. Service cards        : glass edge, 3D tilt + cursor reflection, staggered rise.
 *   3. Numbered cards       : same glass edge + tilt (the theme already reveals them).
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
	   Boot
	   ================================================================== */
	function init() {
		var wd = setupWhatDrives();
		var cards = setupCards();

		if (!wd && !cards.svc.length && !cards.ns.length) {
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
