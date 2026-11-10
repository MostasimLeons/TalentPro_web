/*!
 * TalentPro 3D layer – Phase 1: Hero  (v2, classic scripts only)
 *
 * - Mouse depth parallax: photo, glow and a 3-depth node network move by
 *   different amounts.
 * - Scroll parallax on the background.
 * - Three.js glowing node network (classic build, window.TP3D_THREE),
 *   desktop/tablet only, injected after page load.
 *
 * No ES modules, no dependency on GSAP. Never touches text, links or content:
 * it only adds classes plus aria-hidden decoration inside the hero's existing
 * aria-hidden background layer.
 *
 * Debug:  add ?tp3d=debug to the URL → console logs every step.
 * Status: <html data-tp3d="..."> always shows running / skipped:<reason>.
 */
(function () {
	'use strict';

	var doc = document;
	var root = doc.documentElement;
	var cfg = window.TP3D || {};
	var DEBUG = /[?&]tp3d=debug\b/.test(location.search);
	var thisScript = doc.currentScript;

	var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
	var mqMobile = window.matchMedia('(max-width: 767px)');
	var mqTablet = window.matchMedia('(max-width: 1024px)');
	var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');

	function log() {
		if (!DEBUG || !window.console) return;
		var args = Array.prototype.slice.call(arguments);
		args.unshift('%c[TP3D]', 'color:#00ADEE;font-weight:bold');
		console.log.apply(console, args);
	}

	function status(s) {
		root.setAttribute('data-tp3d', s);
		log('status →', s);
	}

	/* ------------------------------------------------------------------ */
	/* Helpers                                                              */
	/* ------------------------------------------------------------------ */
	function findHero() {
		// 1) The animated hero headline is unique to the hero section.
		var h1 = doc.querySelector('[data-hero-lines]');
		var section = h1 && h1.closest('section');
		// 2) Fallback: the hero background image (also works if a lazy-load
		//    plugin rewrote src → data-src).
		if (!section) {
			var anyImg = doc.querySelector('img[src*="hero-bg"], img[data-src*="hero-bg"], img[data-lazy-src*="hero-bg"]');
			section = anyImg && anyImg.closest('section');
		}
		if (!section) return null;

		var bg = null;
		for (var i = 0; i < section.children.length; i++) {
			var c = section.children[i];
			if (c.getAttribute('aria-hidden') === 'true' && c.querySelector('img')) { bg = c; break; }
		}
		if (!bg) return null;
		return { section: section, bg: bg, img: bg.querySelector('img') };
	}

	function webglInfo() {
		try {
			var c = doc.createElement('canvas');
			var gl = c.getContext('webgl2') || c.getContext('webgl');
			return gl ? (gl instanceof window.WebGL2RenderingContext ? 'webgl2' : 'webgl1') : '';
		} catch (e) { return ''; }
	}

	function threeUrl() {
		if (cfg.threeUrl) return cfg.threeUrl;
		// Fallback when an optimiser dropped the inline config.
		if (thisScript && /tp-3d-hero\.js/.test(thisScript.src)) {
			return thisScript.src.replace(/js\/tp-3d-hero\.js.*$/, 'vendor/three-tp3d.min.js?ver=r170');
		}
		return '';
	}

	function loadThree(cb) {
		if (window.TP3D_THREE) return cb(null, window.TP3D_THREE);
		var url = threeUrl();
		if (!url) return cb(new Error('Three.js URL unknown (window.TP3D missing)'));
		log('loading Three.js (classic build):', url);
		var s = doc.createElement('script');
		s.src = url;
		s.async = true;
		s.setAttribute('data-no-optimize', '1');
		s.setAttribute('data-no-defer', '1');
		s.setAttribute('data-cfasync', 'false');
		s.onload = function () {
			window.TP3D_THREE ? cb(null, window.TP3D_THREE) : cb(new Error('Three.js loaded but TP3D_THREE missing'));
		};
		s.onerror = function () { cb(new Error('Three.js failed to load (404?) ' + url)); };
		doc.head.appendChild(s);
	}

	function cssVar(name, fallback) {
		var v = getComputedStyle(root).getPropertyValue(name).trim();
		return v || fallback;
	}

	function hexToRgb(hex, fallback) {
		var m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
		if (!m) return fallback;
		var n = parseInt(m[1], 16);
		return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
	}

	function lerp(a, b, t) { return a + (b - a) * t; }

	/* ------------------------------------------------------------------ */
	/* Main                                                                 */
	/* ------------------------------------------------------------------ */
	function init() {
		log('script running. viewport', innerWidth + 'x' + innerHeight,
			'| reduced-motion:', mqReduce.matches, '| mobile:', mqMobile.matches,
			'| fine pointer:', mqFine.matches);

		if (mqReduce.matches) return status('skipped:prefers-reduced-motion');

		var hero = findHero();
		if (!hero) return status('skipped:hero-not-found');
		log('hero found', hero.section);

		hero.section.classList.add('tp3d-hero');
		hero.bg.classList.add('tp3d-hero__bg');
		if (hero.img) hero.img.classList.add('tp3d-hero__img');

		/* ---- Shared motion state ---- */
		var S = {
			visible: true,
			tx: 0, ty: 0,   // pointer target  (-1..1)
			px: 0, py: 0,   // eased pointer
			gx: 0, gy: 0,   // glow target (px)
			cgx: 0, cgy: 0, // eased glow
			scroll: 0,
			scene: null     // Three.js frame function when ready
		};

		var glow = null;
		if (mqFine.matches) {
			glow = doc.createElement('div');
			glow.className = 'tp3d-hero__glow';
			glow.setAttribute('aria-hidden', 'true');
			hero.bg.appendChild(glow);

			hero.section.addEventListener('pointermove', function (e) {
				var r = hero.section.getBoundingClientRect();
				S.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
				S.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
				S.gx = e.clientX - r.left;
				S.gy = e.clientY - r.top - S.scroll; // glow lives inside the shifted bg layer
				hero.section.classList.add('is-pointer');
				wake();
			}, { passive: true });

			hero.section.addEventListener('pointerleave', function () {
				S.tx = 0; S.ty = 0;
				hero.section.classList.remove('is-pointer');
				wake();
			});
		}

		window.addEventListener('scroll', wake, { passive: true });
		window.addEventListener('resize', wake, { passive: true });

		if ('IntersectionObserver' in window) {
			new IntersectionObserver(function (entries) {
				S.visible = entries[0].isIntersecting;
				log(S.visible ? 'hero visible → render' : 'hero off-screen → paused');
				wake();
			}).observe(hero.section);
		}
		doc.addEventListener('visibilitychange', wake);
		if (mqReduce.addEventListener) {
			mqReduce.addEventListener('change', function () {
				if (mqReduce.matches) { hero.bg.style.transform = ''; if (hero.img) hero.img.style.transform = ''; }
				wake();
			});
			mqMobile.addEventListener('change', wake);
		}

		/* ---- Single animation loop (parallax + optional 3D) ---- */
		var raf = 0;
		var last = performance.now();

		function active() {
			return S.visible && !doc.hidden && !mqReduce.matches;
		}

		function wake() {
			if (!raf && active()) raf = requestAnimationFrame(tick);
		}

		function tick(now) {
			raf = 0;
			if (!active()) return;
			var dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			var k = 1 - Math.pow(0.0025, dt); // frame-rate independent easing

			S.px = lerp(S.px, S.tx, k);
			S.py = lerp(S.py, S.ty, k);
			S.cgx = lerp(S.cgx, S.gx, k * 1.6);
			S.cgy = lerp(S.cgy, S.gy, k * 1.6);

			var h = hero.section.offsetHeight;
			S.scroll = Math.max(0, Math.min(window.scrollY || window.pageYOffset, h)) * 0.22;

			hero.bg.style.transform = 'translate3d(0,' + S.scroll.toFixed(1) + 'px,0)';
			if (hero.img && !mqMobile.matches) {
				hero.img.style.transform = 'translate3d(' + (-S.px * 24).toFixed(2) + 'px,' + (-S.py * 16).toFixed(2) + 'px,0) scale(1.1)';
			}
			if (glow) glow.style.transform = 'translate3d(' + S.cgx.toFixed(1) + 'px,' + S.cgy.toFixed(1) + 'px,0)';

			var moving = Math.abs(S.px - S.tx) > 0.001 || Math.abs(S.py - S.ty) > 0.001 ||
				Math.abs(S.cgx - S.gx) > 0.5 || Math.abs(S.cgy - S.gy) > 0.5;

			if (S.scene && !mqMobile.matches) {
				S.scene(now / 1000, S.px, S.py);
				raf = requestAnimationFrame(tick); // network drifts continuously while visible
			} else if (moving) {
				raf = requestAnimationFrame(tick);
			}
		}

		wake();

		/* ---- Three.js layer ---- */
		if (mqMobile.matches) return status('running:parallax-only(mobile)');
		var gl = webglInfo();
		if (!gl) return status('running:parallax-only(no-webgl)');
		var conn = navigator.connection || {};
		if (conn.saveData) return status('running:parallax-only(save-data)');

		status('running:loading-3d');
		var start = function () {
			loadThree(function (err, THREE) {
				if (err) {
					if (window.console) console.warn('[TP3D] 3D layer disabled:', err.message);
					return status('running:parallax-only(three-failed)');
				}
				try {
					S.scene = createScene(THREE, hero, gl);
					status('running');
					wake();
				} catch (e2) {
					if (window.console) console.warn('[TP3D] 3D layer disabled:', e2);
					status('running:parallax-only(scene-error)');
				}
			});
		};
		// After load so it never competes with the hero image (LCP).
		if (doc.readyState === 'complete') setTimeout(start, 150);
		else window.addEventListener('load', function () { setTimeout(start, 150); }, { once: true });
	}

	/* ------------------------------------------------------------------ */
	/* Glowing node network – 3 depth layers                                */
	/* ------------------------------------------------------------------ */
	function createScene(THREE, hero, glType) {
		var canvas = doc.createElement('canvas');
		canvas.className = 'tp3d-hero__canvas';
		canvas.setAttribute('aria-hidden', 'true');
		hero.bg.appendChild(canvas); // after the photo + overlay → above them, below the text

		THREE.ColorManagement.enabled = false;
		var renderer = new THREE.WebGLRenderer({
			canvas: canvas, alpha: true, antialias: false,
			powerPreference: 'low-power', premultipliedAlpha: true
		});
		renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
		renderer.setClearColor(0x000000, 0);

		var isTablet = mqTablet.matches;
		var COUNT = isTablet ? 60 : 96;
		var DUST = isTablet ? 120 : 260;
		var LINK = 2.5;
		var MAX_LINKS = COUNT * 10;
		var DPR = Math.min(window.devicePixelRatio || 1, isTablet ? 1.25 : 1.5);

		var WHITE = [1, 1, 1];
		var ACCENT = hexToRgb(cssVar('--tp-accent', '') || cssVar('--color-cta', ''), [0, 0.678, 0.933]);

		var scene = new THREE.Scene();
		var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
		camera.position.set(0, 0, 10);
		var group = new THREE.Group();
		scene.add(group);

		var blend = {
			transparent: true, depthWrite: false,
			blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor
		};

		function pointMaterial() {
			return new THREE.ShaderMaterial(Object.assign({
				uniforms: { uPR: { value: DPR } },
				vertexShader:
					'attribute vec3 aColor;attribute float aSize;uniform float uPR;varying vec3 vC;varying float vF;' +
					'void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;' +
					'gl_PointSize=aSize*uPR*(10.0/-mv.z);vC=aColor;vF=smoothstep(22.0,8.0,-mv.z);}',
				fragmentShader:
					'varying vec3 vC;varying float vF;void main(){float d=length(gl_PointCoord-0.5);' +
					'float core=smoothstep(0.5,0.0,d);float a=min(1.0,(pow(core,2.2)*1.6+0.5*core)*vF);' +
					'gl_FragColor=vec4(vC*a,a);}'
			}, blend));
		}

		// --- nodes: three depth bands (near / mid / far) for real parallax
		var nodes = [];
		for (var i = 0; i < COUNT; i++) {
			var band = i % 3; // 0 near, 1 mid, 2 far
			var accent = Math.random() < 0.18;
			nodes.push({
				nx: Math.random() * 2.3 - 1.15,
				ny: Math.random() * 2.3 - 1.15,
				z: band === 0 ? 1 + Math.random() * 2.5 : band === 1 ? -2 + Math.random() * 2.5 : -7 + Math.random() * 4,
				ph: Math.random() * 6.283, sp: 0.15 + Math.random() * 0.3, amp: 0.2 + Math.random() * 0.45,
				col: accent ? ACCENT : WHITE,
				size: (accent ? 15 : 8) + Math.random() * 6,
				x: 0, y: 0, zz: 0
			});
		}

		var pPos = new Float32Array(COUNT * 3), pCol = new Float32Array(COUNT * 3), pSize = new Float32Array(COUNT);
		nodes.forEach(function (n, k) {
			pCol.set(n.col, k * 3);
			pSize[k] = n.size;
		});
		var pGeo = new THREE.BufferGeometry();
		pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
		pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3));
		pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
		group.add(new THREE.Points(pGeo, pointMaterial()));

		// --- dust: tiny static far particles (depth cue)
		var dPos = new Float32Array(DUST * 3), dCol = new Float32Array(DUST * 3), dSize = new Float32Array(DUST);
		for (i = 0; i < DUST; i++) {
			dPos[i * 3] = (Math.random() * 2 - 1) * 16;
			dPos[i * 3 + 1] = (Math.random() * 2 - 1) * 10;
			dPos[i * 3 + 2] = -10 + Math.random() * 12;
			var c = Math.random() < 0.25 ? ACCENT : WHITE;
			var b = 0.35 + Math.random() * 0.4;
			dCol[i * 3] = c[0] * b; dCol[i * 3 + 1] = c[1] * b; dCol[i * 3 + 2] = c[2] * b;
			dSize[i] = 2 + Math.random() * 3;
		}
		var dGeo = new THREE.BufferGeometry();
		dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
		dGeo.setAttribute('aColor', new THREE.BufferAttribute(dCol, 3));
		dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
		var dust = new THREE.Points(dGeo, pointMaterial());
		scene.add(dust); // not in group → moves differently = extra depth

		// --- links
		var lPos = new Float32Array(MAX_LINKS * 6), lCol = new Float32Array(MAX_LINKS * 6);
		var lGeo = new THREE.BufferGeometry();
		lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage));
		lGeo.setAttribute('aColor', new THREE.BufferAttribute(lCol, 3).setUsage(THREE.DynamicDrawUsage));
		group.add(new THREE.LineSegments(lGeo, new THREE.ShaderMaterial(Object.assign({
			vertexShader: 'attribute vec3 aColor;varying vec3 vC;void main(){vC=aColor;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
			fragmentShader: 'varying vec3 vC;void main(){float a=max(max(vC.r,vC.g),vC.b);gl_FragColor=vec4(vC,a);}'
		}, blend))));

		// --- sizing
		var halfW = 1, halfH = 1;
		function resize() {
			var w = hero.bg.clientWidth || 1, h = hero.bg.clientHeight || 1;
			renderer.setPixelRatio(DPR);
			renderer.setSize(w, h, false);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
			halfW = halfH * camera.aspect;
			log('canvas size', w + 'x' + h, '(buffer ' + canvas.width + 'x' + canvas.height + ', DPR ' + DPR + ')');
		}
		resize();
		if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero.bg);
		else window.addEventListener('resize', resize);

		canvas.addEventListener('webglcontextlost', function (e) {
			e.preventDefault();
			canvas.style.display = 'none';
			status('running:parallax-only(context-lost)');
		});

		if (window.console && DEBUG) {
			console.log('%cTP 3D hero started', 'color:#00ADEE;font-weight:bold;font-size:13px');
			console.log('[TP3D] Three.js r' + THREE.REVISION + ' | ' + glType + ' | canvas ' +
				canvas.clientWidth + 'x' + canvas.clientHeight + ' | nodes ' + COUNT + ' | dust ' + DUST);
		}

		requestAnimationFrame(function () { canvas.classList.add('is-ready'); });

		// --- per-frame (called from the shared loop)
		return function frame(t, px, py) {
			// Camera follows the pointer → near nodes shift a lot, far ones little.
			camera.position.x = px * 1.6;
			camera.position.y = -py * 1.0;
			camera.lookAt(0, 0, -2);
			group.rotation.y = Math.sin(t * 0.06) * 0.1;
			group.rotation.x = Math.cos(t * 0.05) * 0.05;
			dust.rotation.z = t * 0.01;

			var i, j, n;
			for (i = 0; i < COUNT; i++) {
				n = nodes[i];
				var depthScale = (10 - n.z) / 10; // spread far nodes wider so they fill the frame
				n.x = n.nx * halfW * depthScale + Math.sin(t * n.sp + n.ph) * n.amp;
				n.y = n.ny * halfH * depthScale + Math.cos(t * n.sp * 0.8 + n.ph) * n.amp;
				n.zz = n.z + Math.sin(t * n.sp * 0.6 + n.ph * 1.3) * 0.4;
				pPos[i * 3] = n.x; pPos[i * 3 + 1] = n.y; pPos[i * 3 + 2] = n.zz;
			}
			pGeo.attributes.position.needsUpdate = true;

			var L = 0, a, b, dx, dy, dz, d, s, o, LL = LINK * LINK;
			for (i = 0; i < COUNT && L < MAX_LINKS; i++) {
				a = nodes[i];
				for (j = i + 1; j < COUNT && L < MAX_LINKS; j++) {
					b = nodes[j];
					dx = a.x - b.x; dy = a.y - b.y; dz = a.zz - b.zz;
					d = dx * dx + dy * dy + dz * dz;
					if (d > LL) continue;
					s = (1 - Math.sqrt(d) / LINK) * 0.7;
					o = L * 6;
					lPos[o] = a.x; lPos[o + 1] = a.y; lPos[o + 2] = a.zz;
					lPos[o + 3] = b.x; lPos[o + 4] = b.y; lPos[o + 5] = b.zz;
					lCol[o] = a.col[0] * s; lCol[o + 1] = a.col[1] * s; lCol[o + 2] = a.col[2] * s;
					lCol[o + 3] = b.col[0] * s; lCol[o + 4] = b.col[1] * s; lCol[o + 5] = b.col[2] * s;
					L++;
				}
			}
			lGeo.setDrawRange(0, L * 2);
			lGeo.attributes.position.needsUpdate = true;
			lGeo.attributes.aColor.needsUpdate = true;

			renderer.render(scene, camera);
		};
	}

	function safeInit() {
		try {
			init();
		} catch (e) {
			if (window.console) console.warn('[TP3D] init error:', e);
			status('skipped:init-error');
		}
	}

	if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', safeInit);
	else safeInit();
})();
