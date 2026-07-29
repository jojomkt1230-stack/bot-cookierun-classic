import * as THREE from 'three';

let scene, camera, renderer, earth, stars, particleSystem;
let mouseX = 0, mouseY = 0;
let animFrame;

export function initThreeJS() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 5;

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  // ── Create Earth Globe ──────────────────────────────────────────
  const earthGeometry = new THREE.SphereGeometry(1.5, 64, 64);
  
  // Create earth texture procedurally
  const earthCanvas = document.createElement('canvas');
  earthCanvas.width = 1024;
  earthCanvas.height = 512;
  const ctx = earthCanvas.getContext('2d');
  
  // Background ocean
  const oceanGrad = ctx.createLinearGradient(0, 0, 1024, 512);
  oceanGrad.addColorStop(0, '#020d2e');
  oceanGrad.addColorStop(0.5, '#041a50');
  oceanGrad.addColorStop(1, '#020d2e');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 1024, 512);
  
  // Add continent-like shapes with neon edges
  ctx.fillStyle = 'rgba(0, 50, 100, 0.6)';
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
  ctx.lineWidth = 2;
  
  // Random continent blobs
  const blobs = [
    [200, 180, 120, 80], [400, 150, 100, 70], [600, 200, 90, 60],
    [150, 300, 80, 60], [350, 280, 110, 75], [550, 320, 100, 65],
    [750, 180, 90, 60], [800, 300, 80, 50], [250, 380, 70, 50],
    [650, 380, 85, 55], [900, 250, 75, 55]
  ];
  
  blobs.forEach(([x, y, rx, ry]) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // City lights dots
  ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 512;
    const r = Math.random() * 1.5 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  
  const earthTexture = new THREE.CanvasTexture(earthCanvas);
  
  const earthMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,
    emissive: new THREE.Color(0x001030),
    emissiveIntensity: 0.3,
    shininess: 80,
  });
  
  earth = new THREE.Mesh(earthGeometry, earthMaterial);
  scene.add(earth);

  // ── Glowing Atmosphere ──────────────────────────────────────────
  const atmosphereGeometry = new THREE.SphereGeometry(1.58, 64, 64);
  const atmosphereMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(0x0044ff),
    emissive: new THREE.Color(0x002288),
    transparent: true,
    opacity: 0.12,
    side: THREE.FrontSide,
  });
  const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  scene.add(atmosphere);

  // ── Outer Glow Ring ─────────────────────────────────────────────
  const glowGeometry = new THREE.SphereGeometry(1.7, 32, 32);
  const glowMaterial = new THREE.MeshPhongMaterial({
    color: new THREE.Color(0x00aaff),
    transparent: true,
    opacity: 0.05,
    side: THREE.BackSide,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  scene.add(glow);

  // ── Orbit Ring ──────────────────────────────────────────────────
  const ringGeometry = new THREE.TorusGeometry(2.2, 0.008, 8, 200);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x00d4ff),
    transparent: true,
    opacity: 0.3
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 4;
  scene.add(ring);

  // Second ring
  const ring2Geometry = new THREE.TorusGeometry(2.5, 0.005, 8, 200);
  const ring2 = new THREE.Mesh(ring2Geometry, new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x7b2fff),
    transparent: true,
    opacity: 0.2
  }));
  ring2.rotation.x = Math.PI / 3;
  ring2.rotation.y = Math.PI / 6;
  scene.add(ring2);

  // ── Stars Field ─────────────────────────────────────────────────
  const starCount = 3000;
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 200;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 200;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    starSizes[i] = Math.random() * 2 + 0.5;
  }
  
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  
  const starMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(0xaaddff),
    size: 0.15,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });
  
  stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  // ── Floating Particles ──────────────────────────────────────────
  const particleCount = 100;
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount; i++) {
    particlePos[i * 3] = (Math.random() - 0.5) * 10;
    particlePos[i * 3 + 1] = (Math.random() - 0.5) * 10;
    particlePos[i * 3 + 2] = (Math.random() - 0.5) * 5 - 2;
  }
  
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  
  particleSystem = new THREE.Points(particleGeo, new THREE.PointsMaterial({
    color: new THREE.Color(0x00d4ff),
    size: 0.04,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
  }));
  scene.add(particleSystem);

  // ── Lighting ────────────────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0x112244, 0.5);
  scene.add(ambientLight);
  
  const sunLight = new THREE.DirectionalLight(0x4499ff, 1.5);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  const rimLight = new THREE.PointLight(0x7b2fff, 1, 10);
  rimLight.position.set(-3, -2, -2);
  scene.add(rimLight);

  // ── Mouse interaction ────────────────────────────────────────────
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  // ── Resize ──────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

let t = 0;
function animate() {
  animFrame = requestAnimationFrame(animate);
  t += 0.003;

  if (earth) {
    earth.rotation.y += 0.002;
    earth.rotation.x += (mouseY * 0.02 - earth.rotation.x) * 0.05;
    earth.rotation.z += (mouseX * 0.01 - earth.rotation.z) * 0.05;
  }

  if (stars) {
    stars.rotation.y -= 0.0002;
    stars.rotation.x -= 0.0001;
  }

  if (particleSystem) {
    particleSystem.rotation.y += 0.001;
    const positions = particleSystem.geometry.attributes.position.array;
    for (let i = 1; i < positions.length; i += 3) {
      positions[i] += Math.sin(t + i) * 0.001;
    }
    particleSystem.geometry.attributes.position.needsUpdate = true;
  }

  // Camera subtle movement following mouse
  camera.position.x += (mouseX * 0.3 - camera.position.x) * 0.05;
  camera.position.y += (mouseY * 0.3 - camera.position.y) * 0.05;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}

export function destroyThreeJS() {
  if (animFrame) cancelAnimationFrame(animFrame);
}
