document.getElementById('year').textContent = new Date().getFullYear();

/* ============ REDUCED MOTION CHECK ============ */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============ HERO REVEAL AFTER 10s OF VIDEO ============ */
const video = document.getElementById('heroVideo');
const heroEl = document.getElementById('hero');
const heroContent = document.getElementById('heroContent');
const nav = document.getElementById('siteNav');
const skipBtn = document.getElementById('skipIntro');
const REVEAL_AT = 10; // seconds
let revealed = false;

function doReveal(){
  if (revealed) return;
  revealed = true;
  heroContent.classList.add('is-revealed');
  nav.classList.add('is-visible');
  skipBtn.classList.add('is-hidden');
}

/* If the hero video file is missing/unsupported, fall back to the poster
   image as a plain background instead of leaving a black box, and reveal
   the copy immediately rather than waiting on a video that will never play. */
function handleMediaError(videoEl, fallbackEl){
  videoEl.style.display = 'none';
  const poster = videoEl.getAttribute('poster');
  if (poster && fallbackEl){
    fallbackEl.style.backgroundImage = `url("${poster}")`;
    fallbackEl.style.backgroundSize = 'cover';
    fallbackEl.style.backgroundPosition = 'center 30%';
  }
}

if (prefersReducedMotion){
  // Respect reduced motion: reveal immediately, no wait
  doReveal();
} else {
  video.addEventListener('timeupdate', () => {
    if (video.currentTime >= REVEAL_AT) doReveal();
  });
  // Fallback: if video fails to load/play, don't trap the user
  video.addEventListener('error', () => {
    handleMediaError(video, heroEl);
    doReveal();
  });
  setTimeout(() => { if (!revealed) doReveal(); }, 15000);
}

skipBtn.addEventListener('click', doReveal);

/* ============ NAV: scrolled state + mobile toggle ============ */
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 40);
  updateRail();
}, { passive: true });

navToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', open);
});
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    navLinks.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', false);
  });
});

/* ============ SCROLL PROGRESS RAIL ============ */
const railFill = document.getElementById('railFill');
function updateRail(){
  const h = document.documentElement;
  const scrolled = h.scrollTop;
  const max = h.scrollHeight - h.clientHeight;
  railFill.style.width = max > 0 ? `${(scrolled / max) * 100}%` : '0%';
}
updateRail();

/* ============ SCROLL REVEALS (fade-up) ============ */
const revealTargets = document.querySelectorAll(
  '.section-eyebrow, .section-title, .scrub-content, .scrub-sticky, .tl-item, .project-card, .model-copy, .model-stage, .skill-card, .contact-form, .contact-links'
);
revealTargets.forEach(el => el.classList.add('fade-up'));

const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting){
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

revealTargets.forEach((el, i) => {
  el.style.transitionDelay = prefersReducedMotion ? '0s' : `${(i % 4) * 0.08}s`;
  io.observe(el);
});

/* ============ ABOUT + EXPERIENCE: SCROLL-SCRUBBED VIDEO ============ */
(function(){
  var media = document.getElementById('portraitTravel');
  var dock  = document.getElementById('portraitDock');
  var experience = document.getElementById('experience');
  var about = document.getElementById('about');
  var video = document.getElementById('aboutVideo');
  var imgs  = media ? media.querySelectorAll('.about-img') : [];
  if(!media || !dock || !experience || !video || !imgs.length) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var desktopQuery = window.matchMedia('(min-width:861px)');

  var aboutRect = null, dockRect = null, travelActive = false;
  var scrubStart = 0, scrubEnd = 0;
  var videoDuration = 0;
  var videoPrimed = false;
  var durationResolved = false;
  var videoReady = false;

  // The images crossfade from the first instant (no network wait) and
  // keep working as a fallback for the whole session. Only once the
  // video reports 'canplay' (enough buffered to play without
  // immediately stalling) do we reveal it — CSS then crossfades video
  // over the images. If the video later stalls mid-scrub, the images
  // stay correctly hidden underneath rather than reappearing, since a
  // frozen video frame still reads better than a flicker back to a
  // static image.
  function markVideoReady(){
    if(videoReady) return;
    videoReady = true;
    media.classList.add('video-ready');
  }
  video.addEventListener('canplay', markVideoReady);
  if(video.readyState >= 3){ markVideoReady(); }

  function primeVideo(){
    if(videoPrimed) return;
    videoPrimed = true;
    var playPromise = video.play();
    var finish = function(){ video.pause(); update(); };
    if(playPromise && playPromise.then){
      playPromise.then(finish).catch(finish);
    } else {
      finish();
    }
  }

  function resolveDuration(){
    if(durationResolved) return;
    var d = video.duration;
    if(d && isFinite(d) && d > 0){
      durationResolved = true;
      videoDuration = d;
      primeVideo();
      return;
    }
    if(d === Infinity || isNaN(d)){
      durationResolved = true; // don't re-enter while the fix is in flight
      var onSeeked = function(){
        video.removeEventListener('seeked', onSeeked);
        video.currentTime = 0;
        videoDuration = isFinite(video.duration) ? video.duration : 0;
        primeVideo();
      };
      video.addEventListener('seeked', onSeeked);
      try{ video.currentTime = 1e101; } catch(e){
        video.removeEventListener('seeked', onSeeked);
        primeVideo();
      }
    }
  }

  video.addEventListener('loadedmetadata', resolveDuration);
  video.addEventListener('durationchange', function(){
    if(durationResolved) return;
    resolveDuration();
  });
  video.load();
  if(video.readyState >= 1){ resolveDuration(); }

  function lerp(a,b,t){ return a + (b - a) * t; }

  function measure(){
    var scrollY = window.scrollY || window.pageYOffset;
    var scrollX = window.scrollX || window.pageXOffset;

    var prevCss = media.style.cssText;
    media.style.cssText = '';
    var ar = media.getBoundingClientRect();
    aboutRect = { top: ar.top + scrollY, left: ar.left + scrollX, width: ar.width, height: ar.height };
    media.style.cssText = prevCss;

    var dr = dock.getBoundingClientRect();
    dockRect = { top: dr.top + scrollY, left: dr.left + scrollX, width: dr.width, height: dr.height };

    var aboutTop = about ? (about.getBoundingClientRect().top + scrollY) : aboutRect.top;
    scrubStart = aboutTop;
    var experienceTop = experience.offsetTop;
    var experienceHeight = experience.offsetHeight;
    scrubEnd = experienceTop + experienceHeight * 0.35;
    if(scrubEnd <= scrubStart) scrubEnd = scrubStart + 1;
  }

  function enableTravel(){
    travelActive = true;
    video.loop = false;
    video.pause();
    measure();
    media.style.position = 'fixed';
  }

  function disableTravel(){
    travelActive = false;
    media.style.cssText = '';
    experience.style.setProperty('--experience-border-alpha', '1');
    video.loop = true;
    video.currentTime = 0;
    var p = video.play();
    if(p && p.catch) p.catch(function(){});
  }

  // Only seek to a point in the video if that point has actually
  // downloaded. Without this guard, fast scrolling during the
  // scroll-scrub effect asks the browser to jump into an unbuffered
  // region, which forces it to pause and wait on a network round
  // trip — this is what shows up as the video "stopping halfway".
  // Skipping the seek here just means the video catches up on the
  // next scroll tick instead of stalling visibly.
  function isBuffered(t){
    var b = video.buffered;
    for(var i = 0; i < b.length; i++){
      if(t >= b.start(i) && t <= b.end(i)) return true;
    }
    return false;
  }

  function seekTo(t){
    if(video.readyState < 1) return;
    if(!isFinite(t)) return;
    if(Math.abs(video.currentTime - t) < 0.008) return;
    if(!isBuffered(t)) return;
    try{ video.currentTime = t; } catch(e){}
  }

  // Drives the crossfade across the stacked hero stills. Kept running
  // even after the video takes over visually (cheap — just opacity
  // math) so the images are already at the right frame the instant a
  // video stall makes them the visible fallback again.
  function updateImages(progress){
    if(reduceMotion){
      imgs.forEach(function(img, i){
        img.style.opacity = (progress < 1 ? i === 0 : i === imgs.length - 1) ? 1 : 0;
      });
      return;
    }
    var seg = progress * (imgs.length - 1);
    var idx = Math.floor(seg);
    if(idx > imgs.length - 2) idx = imgs.length - 2;
    var frac = seg - idx;
    imgs.forEach(function(img, i){
      var o = 0;
      if(i === idx) o = 1 - frac;
      else if(i === idx + 1) o = frac;
      img.style.opacity = o;
    });
  }

  function update(){
    if(!travelActive){ return; }

    var SCRUB_SPEED = 1.4;
    var scrollY = window.scrollY || window.pageYOffset;
    var progress = ((scrollY - scrubStart) / (scrubEnd - scrubStart)) * SCRUB_SPEED;
    if(progress < 0) progress = 0;
    if(progress > 1) progress = 1;

    var targetTop =
      dockRect.top +
      (dockRect.height - aboutRect.height) / 2 - 80;

    var top = lerp(aboutRect.top, targetTop, progress) - scrollY;
    var left   = lerp(aboutRect.left, dockRect.left, progress);
    var width = aboutRect.width;
    var height = aboutRect.height;
    var radius = lerp(0, 18, progress);
    var shadowAlpha = (0.45 * progress).toFixed(2);
    var shadowBlur  = Math.round(lerp(0, 60, progress));
    var shadowSpread= Math.round(lerp(0, 20, progress));

    media.style.top = top + 'px';
    media.style.left = left + 'px';
    media.style.width = width + 'px';
    media.style.height = height + 'px';
    media.style.borderRadius = radius + 'px';
    media.style.boxShadow = progress > 0.02
      ? ('0 ' + shadowSpread + 'px ' + shadowBlur + 'px rgba(4,6,14,' + shadowAlpha + ')')
      : 'none';
    media.style.setProperty('--edge-fade', (1 - progress).toFixed(3));

    var lineFadeStart = 0.01;
    var lineFadeEnd = 0.02;
    var lineT = (progress - lineFadeStart) / (lineFadeEnd - lineFadeStart);
    if(lineT < 0) lineT = 0;
    if(lineT > 1) lineT = 1;
    experience.style.setProperty('--experience-border-alpha', (1 - lineT).toFixed(3));

    updateImages(progress);

    if(reduceMotion){
      seekTo(progress < 1 ? 0 : Math.max(videoDuration - 0.05, 0));
      return;
    }

    if(videoDuration > 0){
      var t = progress * videoDuration;
      seekTo(Math.min(t, videoDuration - 0.03));
    }
  }

  function syncMode(){
    if(desktopQuery.matches){
      enableTravel();
      update();
    } else {
      disableTravel();
    }
  }

  syncMode();
  window.addEventListener('scroll', update, {passive:true});
  window.addEventListener('resize', function(){ measure(); syncMode(); });
  if(desktopQuery.addEventListener){
    desktopQuery.addEventListener('change', syncMode);
  } else if(desktopQuery.addListener){
    desktopQuery.addListener(syncMode);
  }

  function remeasure(){ if(desktopQuery.matches){ measure(); update(); } }
  window.addEventListener('load', remeasure);
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(remeasure).catch(function(){});
  }
})();

/* ============ PROJECT MINI CANVASES (ambient particle sketches) ============ */
function initMiniCanvas(canvas){
  const variant = canvas.dataset.variant;
  const ctx = canvas.getContext('2d');
  let w, h, dpr;
  const points = [];

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed(){
    points.length = 0;
    const count = variant === 'net' ? 46 : variant === 'grid' ? 60 : 34;
    for (let i = 0; i < count; i++){
      points.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6
      });
    }
  }

  function draw(){
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(139,124,246,0.16)';
    ctx.fillStyle = 'rgba(79,214,232,0.7)';

    points.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    });

    if (variant === 'wave'){
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8){
        const y = h/2 + Math.sin((x * 0.02) + performance.now() * 0.0008) * (h * 0.18);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(79,214,232,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else if (variant === 'scatter'){
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      const maxDist = variant === 'grid' ? 60 : 90;
      for (let i = 0; i < points.length; i++){
        for (let j = i + 1; j < points.length; j++){
          const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < maxDist){
            ctx.globalAlpha = 1 - d / maxDist;
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[j].x, points[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (!prefersReducedMotion) requestAnimationFrame(draw);
  }

  resize(); seed(); draw();
  window.addEventListener('resize', () => { resize(); seed(); });
}

document.querySelectorAll('.mini-canvas').forEach(initMiniCanvas);

/* ============ SKILL BARS: animate width when visible ============ */
const skillCards = document.querySelectorAll('.skill-card');
const skillIO = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting){
      entry.target.classList.add('is-in');
      skillIO.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });
skillCards.forEach(c => skillIO.observe(c));

/* ============ 3D MODEL SECTION (GLTF viewer of my own model) ============ */
(function initModel(){
  const stage = document.querySelector('.model-stage');
  const canvas = document.getElementById('modelCanvas');
  const loadingEl = document.getElementById('modelLoading');
  if (!stage || !canvas || typeof THREE === 'undefined') return;

  const MODEL_URL = 'assets/models/teresa.glb';
  const TARGET_RADIUS = 2.4;

  // Loud, visible diagnostics: file:// pages can't fetch local binary
  // assets (CORS blocks it), so GLTFLoader will always fail there. Detect
  // that case specifically and say so, rather than quietly falling back
  // to a placeholder that looks like "nothing changed."
  if (location.protocol === 'file:'){
    console.warn(
      '[model] Page is running from file:// — browsers block fetch() of local ' +
      'binary files like .glb under this protocol, so the model cannot load. ' +
      'Serve this folder over http(s):// instead, e.g. `python3 -m http.server` ' +
      'or VS Code\'s Live Server extension, then reload.'
    );
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 0.05, 100);
  camera.position.set(0, 0, 6.5);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  if (renderer.outputEncoding !== undefined && THREE.sRGBEncoding !== undefined){
    renderer.outputEncoding = THREE.sRGBEncoding;
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8b7cf6, 0.6);
  rim.position.set(-4, -2, -3);
  scene.add(rim);

  const group = new THREE.Group();
  scene.add(group);

  // References to fallback-only pieces so animate() can give them their
  // own independent motion (counter-rotation, glow pulse) on top of the
  // regular drag/idle rotation applied to the whole group.
  let fallbackInner = null;
  let fallbackGlow = null;
  let fallbackParticles = null;

  function frameObject(object){
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    object.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = (TARGET_RADIUS * 2) / maxDim;
    object.scale.setScalar(scale);
  }

  function hideLoading(){
    if (loadingEl) loadingEl.classList.add('is-hidden');
  }

  // Small radial-gradient sprite texture used for the ambient glow behind
  // the fallback wireframes. Generated on a canvas rather than fetched, so
  // it works even when nothing else on the page can load.
  function createGlowTexture(hex){
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, hex + 'e6');
    grad.addColorStop(0.45, hex + '40');
    grad.addColorStop(1, hex + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  function showFallbackParticles(reasonText){
    // No on-screen error text — this visual is the failure state, and the
    // reason is logged to the console for debugging instead of shown over
    // the stage.
    hideLoading();
    if (reasonText) console.warn('[model] ' + reasonText);

    const fallbackGroup = new THREE.Group();

    // Soft ambient glow behind everything, in deep blue.
    const glowTex = createGlowTexture('#3b5bfd');
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(TARGET_RADIUS * 3.4, TARGET_RADIUS * 3.4, 1);
    fallbackGroup.add(glowSprite);
    fallbackGlow = glowSprite;

    // Outer wireframe shell — brighter royal blue.
    const outerGeo = new THREE.IcosahedronGeometry(TARGET_RADIUS * 0.95, 1);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x3b5bfd, wireframe: true, transparent: true, opacity: 0.55
    });
    fallbackGroup.add(new THREE.Mesh(outerGeo, outerMat));

    // Inner wireframe shell — darker indigo, counter-rotates for a bit of
    // parallax depth instead of sitting static inside the outer one.
    const innerGeo = new THREE.IcosahedronGeometry(TARGET_RADIUS * 0.55, 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x1e3a8a, wireframe: true, transparent: true, opacity: 0.45
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    fallbackGroup.add(innerMesh);
    fallbackInner = innerMesh;

    // A thin shell of glowing points scattered just outside the wireframes.
    const PARTICLE_COUNT = 160;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++){
      const phi = Math.acos(-1 + (2 * i) / PARTICLE_COUNT);
      const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi;
      const r = TARGET_RADIUS * (0.92 + Math.random() * 0.18);
      positions[i * 3] = r * Math.cos(theta) * Math.sin(phi);
      positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x6d8bff, size: 0.045, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    const particlePoints = new THREE.Points(particleGeo, particleMat);
    fallbackGroup.add(particlePoints);
    fallbackParticles = particlePoints;

    group.add(fallbackGroup);
  }

  if (typeof THREE.GLTFLoader !== 'undefined'){
    const loader = new THREE.GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        frameObject(gltf.scene);
        group.add(gltf.scene);
        hideLoading();
        console.log('[model] Loaded successfully from', MODEL_URL);
      },
      (xhr) => {
        if (xhr.total){
          console.log('[model] Loading', Math.round((xhr.loaded / xhr.total) * 100) + '%');
        }
      },
      (err) => {
        console.error('[model] Failed to load ' + MODEL_URL + ':', err);
        const reason = location.protocol === 'file:'
          ? 'Model failed: page is running over file:// — start a local server'
          : 'Model failed to load — check the file path and console';
        showFallbackParticles(reason);
      }
    );
  } else {
    console.error('[model] THREE.GLTFLoader is not defined — the loader <script> tag likely failed to load (check network tab / ad blockers / CDN availability).');
    showFallbackParticles('GLTFLoader script did not load — check console');
  }

  let dragging = false, lastX = 0, lastY = 0;
  let rotX = 0.1, rotY = 0.3, velX = 0, velY = 0.0012;

  function pointerDown(x, y){ dragging = true; lastX = x; lastY = y; }
  function pointerMove(x, y){
    if (!dragging) return;
    velY = (x - lastX) * 0.0006;
    velX = (y - lastY) * 0.0006;
    lastX = x; lastY = y;
  }
  function pointerUp(){ dragging = false; }

  canvas.addEventListener('mousedown', e => pointerDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => pointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', pointerUp);
  canvas.addEventListener('touchstart', e => { const t = e.touches[0]; pointerDown(t.clientX, t.clientY); }, { passive: true });
  canvas.addEventListener('touchmove', e => { const t = e.touches[0]; pointerMove(t.clientX, t.clientY); }, { passive: true });
  canvas.addEventListener('touchend', pointerUp);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY * 0.0025;
    camera.position.z = Math.min(12, Math.max(2.5, camera.position.z + delta));
  }, { passive: false });

  function animate(){
    if (!dragging){
      velY += (0.0012 - velY) * 0.02;
      velX += (0 - velX) * 0.02;
    } else {
      velY *= 0.9; velX *= 0.9;
    }
    rotY += velY; rotX += velX;
    rotX = Math.max(-1, Math.min(1, rotX));
    group.rotation.y = rotY;
    group.rotation.x = rotX;

    if (fallbackInner){
      fallbackInner.rotation.y -= 0.006;
      fallbackInner.rotation.x += 0.003;
    }
    if (fallbackParticles){
      fallbackParticles.rotation.y += 0.0015;
    }
    if (fallbackGlow){
      const pulse = 1 + Math.sin(performance.now() * 0.0015) * 0.08;
      fallbackGlow.scale.set(TARGET_RADIUS * 3.4 * pulse, TARGET_RADIUS * 3.4 * pulse, 1);
    }

    renderer.render(scene, camera);
    if (!prefersReducedMotion) requestAnimationFrame(animate);
  }
  animate();
  if (prefersReducedMotion) renderer.render(scene, camera);

  function handleResize(){
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', handleResize);
})();

/* ============ CONTACT FORM (front-end only) ============ */
const form = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = form.name.value.trim();
  formNote.textContent = `Thanks${name ? ', ' + name : ''} — this form is a template. Wire it up to Formspree, a mailto link, or your own backend to receive messages.`;
  form.reset();
});
