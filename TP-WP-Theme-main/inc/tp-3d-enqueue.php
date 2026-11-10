<?php
/**
 * TalentPro 3D redesign – asset loader (design-only layer).
 *
 * Loads CSS/JS for the 3D/motion layer and the colour override. Contains NO
 * content or business logic. Rollback: comment out the require line in
 * functions.php. The site then renders exactly as before.
 *
 * All scripts are classic (non-module) scripts.
 *
 * @package TP-WP-Theme
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Cache-busting version based on file modification time.
 *
 * @param string $rel Path relative to the theme root.
 * @return string
 */
function tp3d_asset_ver( $rel ) {
	$path = get_template_directory() . '/' . $rel;
	return file_exists( $path ) ? (string) filemtime( $path ) : '1.0.0';
}

/**
 * Colour override – every page (buttons, links, footer must match sitewide).
 */
function tp3d_enqueue_colors() {
	$deps = wp_style_is( 'talentpro-tailwind', 'registered' ) ? array( 'talentpro-tailwind' ) : array();

	wp_enqueue_style(
		'tp3d-colors',
		get_template_directory_uri() . '/assets/tp3d/css/tp-3d-colors.css',
		$deps,
		tp3d_asset_ver( 'assets/tp3d/css/tp-3d-colors.css' )
	);
}
add_action( 'wp_enqueue_scripts', 'tp3d_enqueue_colors', 20 );

/**
 * Phase 1 – Hero (front page only).
 */
function tp3d_enqueue_hero_assets() {
	if ( ! is_front_page() ) {
		return;
	}

	$base = get_template_directory_uri() . '/assets/tp3d/';

	wp_enqueue_style(
		'tp3d-hero',
		$base . 'css/tp-3d-hero.css',
		array( 'tp3d-colors' ),
		tp3d_asset_ver( 'assets/tp3d/css/tp-3d-hero.css' )
	);

	// Plain footer script (no defer/async attribute, so optimisers have nothing to rewrite).
	wp_enqueue_script(
		'tp3d-hero',
		$base . 'js/tp-3d-hero.js',
		array(),
		tp3d_asset_ver( 'assets/tp3d/js/tp-3d-hero.js' ),
		true
	);

	// Three.js (classic build, window.TP3D_THREE) is NOT enqueued: the hero
	// script injects it after page load on desktop/tablet only, so phones and
	// Lighthouse mobile never download it.
	wp_add_inline_script(
		'tp3d-hero',
		'window.TP3D=' . wp_json_encode(
			array(
				'threeUrl' => $base . 'vendor/three-tp3d.min.js?ver=r170',
				'gsapUrl'  => $base . 'vendor/gsap.min.js?ver=3.12.5',
				'stUrl'    => $base . 'vendor/ScrollTrigger.min.js?ver=3.12.5',
			)
		) . ';',
		'before'
	);
}
add_action( 'wp_enqueue_scripts', 'tp3d_enqueue_hero_assets', 20 );

/**
 * Phase 2 – "What Drives" glass panels, service + numbered card tilt (front page only).
 * GSAP + ScrollTrigger are NOT enqueued: tp-3d-sections.js injects them after
 * page load (URLs from window.TP3D above), and never on reduced motion.
 */
function tp3d_enqueue_sections_assets() {
	if ( ! is_front_page() ) {
		return;
	}

	$base = get_template_directory_uri() . '/assets/tp3d/';

	wp_enqueue_style(
		'tp3d-sections',
		$base . 'css/tp-3d-sections.css',
		array( 'tp3d-colors' ),
		tp3d_asset_ver( 'assets/tp3d/css/tp-3d-sections.css' )
	);

	wp_enqueue_script(
		'tp3d-sections',
		$base . 'js/tp-3d-sections.js',
		array( 'tp3d-hero' ),
		tp3d_asset_ver( 'assets/tp3d/js/tp-3d-sections.js' ),
		true
	);
}
add_action( 'wp_enqueue_scripts', 'tp3d_enqueue_sections_assets', 20 );

/**
 * Mark the 3D scripts so common optimisation plugins leave them alone
 * (LiteSpeed: data-no-optimize / data-no-defer, Cloudflare Rocket Loader:
 * data-cfasync, WP Rocket / Autoptimize / SG Optimizer: see README exclusions).
 *
 * @param string $tag    Script tag.
 * @param string $handle Handle.
 * @return string
 */
function tp3d_script_attrs( $tag, $handle ) {
	if ( 0 === strpos( $handle, 'tp3d-' ) ) {
		$tag = str_replace( '<script ', '<script data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false" ', $tag );
	}
	return $tag;
}
add_filter( 'script_loader_tag', 'tp3d_script_attrs', 10, 2 );
