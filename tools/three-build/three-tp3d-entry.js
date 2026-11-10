// Source for assets/tp3d/vendor/three-tp3d.min.js
// A classic (non-module) build of Three.js r170 containing only what the
// TalentPro 3D layer uses (hero network now, contact globe in Phase 6).
// Exposed as window.TP3D_THREE so it never clashes with another plugin's THREE.
//
// Rebuild:
//   npm install three@0.170.0 esbuild@0.24.0
//   npx esbuild three-tp3d-entry.js --bundle --minify --format=iife --target=es2018 \
//     --legal-comments=eof --outfile=three-tp3d.min.js
import {
	REVISION,
	ColorManagement,
	LinearSRGBColorSpace,
	SRGBColorSpace,
	WebGLRenderer,
	Scene,
	PerspectiveCamera,
	Group,
	Object3D,
	BufferGeometry,
	BufferAttribute,
	Float32BufferAttribute,
	DynamicDrawUsage,
	Points,
	LineSegments,
	Line,
	Mesh,
	SphereGeometry,
	TubeGeometry,
	QuadraticBezierCurve3,
	CubicBezierCurve3,
	ShaderMaterial,
	MeshBasicMaterial,
	LineBasicMaterial,
	PointsMaterial,
	CanvasTexture,
	TextureLoader,
	Color,
	Vector2,
	Vector3,
	Raycaster,
	MathUtils,
	CustomBlending,
	AdditiveBlending,
	NormalBlending,
	OneFactor,
	SrcAlphaFactor,
	BackSide,
	FrontSide,
	DoubleSide
} from 'three';

window.TP3D_THREE = {
	REVISION, ColorManagement, LinearSRGBColorSpace, SRGBColorSpace,
	WebGLRenderer, Scene, PerspectiveCamera, Group, Object3D,
	BufferGeometry, BufferAttribute, Float32BufferAttribute, DynamicDrawUsage,
	Points, LineSegments, Line, Mesh, SphereGeometry, TubeGeometry,
	QuadraticBezierCurve3, CubicBezierCurve3,
	ShaderMaterial, MeshBasicMaterial, LineBasicMaterial, PointsMaterial,
	CanvasTexture, TextureLoader, Color, Vector2, Vector3, Raycaster, MathUtils,
	CustomBlending, AdditiveBlending, NormalBlending, OneFactor, SrcAlphaFactor,
	BackSide, FrontSide, DoubleSide
};
