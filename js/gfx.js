// The look of the game: a gradient sky with a sun, soft bloom so bright things
// glow, crisp shadows that follow the action, and the little 3D portraits used
// on the racer select screen.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------- sky ------------------------- */

// A huge inside-out sphere painted with a horizon-to-zenith gradient and a
// glowing sun. It follows the camera, so you can never drive out from under it.
export function createSky(scene) {
  const uniforms = {
    top: { value: new THREE.Color(0x6fb7ee) },
    horizon: { value: new THREE.Color(0xcfe9f7) },
    sunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    dark: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 sunDir;
      uniform float dark;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.42));
        // A soft warm glow around the sun, then the disc itself
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.85, 0.6) * pow(s, 10.0) * 0.22;
        col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9985, 0.9993, s) * 2.2;
        col = mix(col, vec3(0.012, 0.014, 0.03), dark);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);

  return {
    mesh,
    setTheme(theme, sunDir) {
      uniforms.top.value.set(theme.sky ?? 0x6fb7ee);
      uniforms.horizon.value.set(theme.horizon ?? 0xcfe9f7);
      uniforms.sunDir.value.copy(sunDir);
    },
    setDark(d) { uniforms.dark.value = d; },
    follow(camera) { mesh.position.copy(camera.position); },
  };
}

/* ------------------------- bloom ------------------------- */

// Wraps the renderer in a small post-processing chain: draw the scene, bloom
// anything brighter than white (boost pads, sparks, flames, neon), then output.
// On phones (or if anything is unsupported) it falls back to plain rendering.
export function createPost(renderer, scene, camera, enabled) {
  const post = {
    bloom: false,
    composer: null,
    render() {
      if (this.bloom) this.composer.render();
      else renderer.render(scene, camera);
    },
    setSize(w, h) { if (this.composer) this.composer.setSize(w, h); },
    // Switch the bloom off for good (used when the framerate is struggling)
    disable() { this.bloom = false; },
  };
  if (!enabled || !renderer.capabilities.isWebGL2) return post;

  try {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4, // keep edges smooth: the canvas' own antialiasing is bypassed
    });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.55, 1.0));
    composer.addPass(new OutputPass());
    post.composer = composer;
    post.bloom = true;
  } catch (err) {
    console.warn('Bloom unavailable, using plain rendering', err);
  }
  return post;
}

/* ------------------------- racer portraits ------------------------- */

const portraitCache = new Map();

// Render a little 3D portrait of each racer for the select screen. Uses a
// throwaway mini renderer, and caches the images so it only happens once.
export function renderPortraits(defs, buildModel) {
  const missing = defs.filter((d) => !portraitCache.has(d.key));
  if (missing.length) {
    try {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      r.setSize(size, size, false);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.5));
      const key = new THREE.DirectionalLight(0xfff3d0, 2.2);
      key.position.set(3, 6, 5);
      scene.add(key);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.set(3.6, 2.9, 5.6);
      cam.lookAt(0, 1.05, 0);
      for (const def of missing) {
        const model = buildModel(def);
        model.group.rotation.y = 0.25;
        scene.add(model.group);
        r.render(scene, cam);
        portraitCache.set(def.key, canvas.toDataURL('image/png'));
        scene.remove(model.group);
        model.group.traverse((o) => {
          if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
        });
      }
      r.dispose();
      r.forceContextLoss();
    } catch (err) {
      console.warn('Portraits unavailable', err);
    }
  }
  return portraitCache;
}
