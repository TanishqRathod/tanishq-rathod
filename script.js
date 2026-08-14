/* ============ SPLASH SCREEN: hero-only gate ============ */
/* The splash now gates on the hero video being FULLY downloaded (byte-
   accurate, via fetch + Content-Length), not just "probably won't stall"
   (canplaythrough). We stream the response body, track received bytes
   against Content-Length, and once every byte is in, wrap it in a Blob
   and hand that to the <video> element as its src. At that point there
   is nothing left to buffer — playback can't stall from a network gap.

   If Content-Length is missing (some CDNs strip it) or the fetch fails
   (e.g. CORS), we fall back to the old canplaythrough heuristic so the
   splash still resolves sensibly instead of hanging. A hard SAFETY_MS
   ceiling still guarantees no one gets stuck on the splash forever on a
   dead connection. */
(function(){
  var splash = document.getElementById('splash');
  if(!splash) return;

  var barFill = document.getElementById('splashBarFill');
  var percentEl = document.getElementById('splashPercent');
  var statusEl = document.getElementById('splashStatus');
  var heroVideo = document.getElementById('heroVideo');

  var statusSteps = [
    [0, 'Initializing experience…'],
    [15, 'Loading hero visuals…'],
    [45, 'Buffering video…'],
    [85, 'Almost ready…'],
    [97, 'Finishing up…']
  ];

  function statusFor(pct){
    var msg = statusSteps[0][1];
    for(var i = 0; i < statusSteps.length; i++){
      if(pct >= statusSteps[i][0]) msg = statusSteps[i][1];
    }
    return msg;
  }

  var heroTarget = 0;
  var displayed = 0;
  var heroSettled = false;

  function bumpTarget(pct){
    if(pct > heroTarget) heroTarget = pct;
  }

  // Fallback path: same behavior as before (canplaythrough heuristic).
  // Used when we can't get a reliable Content-Length to track real bytes.
  function loadViaMediaElement(){
    heroVideo.addEventListener('loadedmetadata', function(){ bumpTarget(15); });
    heroVideo.addEventListener('progress', function(){
      if(!heroVideo.duration || !isFinite(heroVideo.duration)) return;
      var buf = heroVideo.buffered;
      if(!buf.length) return;
      var bufferedEnd = buf.end(buf.length - 1);
      var ratio = Math.min(1, bufferedEnd / heroVideo.duration);
      bumpTarget(15 + ratio * 70);
    });
    heroVideo.addEventListener('canplaythrough', function(){
      bumpTarget(97);
      heroSettled = true;
    });
    heroVideo.addEventListener('error', function(){ heroSettled = true; });

    heroVideo.preload = 'auto';
    heroVideo.src = heroVideo.dataset.src;
    heroVideo.load();
  }

  // Primary path: fetch the whole file, track real byte progress, then
  // assign a Blob URL once 100% of it is actually in memory.
  function loadViaFetch(src){
    fetch(src)
      .then(function(res){
        if(!res.ok) throw new Error('bad status ' + res.status);

        var totalHeader = res.headers.get('Content-Length');
        var total = totalHeader ? parseInt(totalHeader, 10) : 0;

        if(!res.body || !total){
          // Can't track real bytes — fall back rather than guessing wrong.
          loadViaMediaElement();
          return;
        }

        var reader = res.body.getReader();
        var received = 0;
        var chunks = [];

        function pump(){
          return reader.read().then(function(result){
            if(result.done){
              var blob = new Blob(chunks);
              var blobUrl = URL.createObjectURL(blob);
              heroVideo.addEventListener('error', function(){ heroSettled = true; });
              heroVideo.src = blobUrl;
              heroVideo.load();
              bumpTarget(100);
              heroSettled = true;
              return;
            }
            chunks.push(result.value);
            received += result.value.length;
            // Cap at 99 until the blob is actually assembled and assigned.
            bumpTarget(Math.min(99, (received / total) * 100));
            return pump();
          });
        }

        return pump();
      })
      .catch(function(){
        // Network/CORS failure on the fetch path — try the plain media
        // element as a fallback before giving up entirely.
        loadViaMediaElement();
      });
  }

  if(heroVideo && heroVideo.dataset.src){
    if(window.fetch && window.Blob && window.URL && URL.createObjectURL){
      loadViaFetch(heroVideo.dataset.src);
    } else {
      loadViaMediaElement();
    }
  } else {
    heroSettled = true; // no hero video configured — nothing to wait on
  }

  // Hard ceiling so a stalled request on a slow or blocked connection
  // never traps someone on the splash screen indefinitely. Raised vs the
  // old heuristic-based version since we're now waiting for full bytes,
  // not just "probably enough to not stall" — adjust to taste.
  var SAFETY_MS = 18000;
  setTimeout(function(){ heroSettled = true; }, SAFETY_MS);

  function tick(){
    var target = heroSettled ? 100 : heroTarget;
    displayed += Math.max(0.6, (target - displayed) / 5);
    if(displayed > target) displayed = target;

    var rounded = Math.round(displayed);
    if(percentEl) percentEl.textContent = rounded + '%';
    if(barFill) barFill.style.width = displayed + '%';
    if(statusEl) statusEl.textContent = statusFor(rounded);

    if(heroSettled && rounded >= 100){
      finish();
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  var finished = false;
  function finish(){
    if(finished) return;
    finished = true;
    splash.classList.add('is-hidden');
    document.body.classList.remove('is-loading');

    if(heroVideo){
      var p = heroVideo.play();
      if(p && p.catch) p.catch(function(){});
    }
    // Signal that the hero video has actually begun (or attempted to begin)
    // playing. The hero-reveal timer below counts from this moment, and
    // — see further down — this is also the cue to start loading the
    // about-section video, now that it's no longer competing with the
    // hero video for bandwidth.
    document.dispatchEvent(new Event('hero-video-started'));

    var removed = false;
    function cleanup(){
      if(removed) return;
      removed = true;
      if(splash.parentNode) splash.parentNode.removeChild(splash);
    }
    splash.addEventListener('transitionend', function handler(e){
      if(e.target !== splash) return;
      splash.removeEventListener('transitionend', handler);
      cleanup();
    });
    // Belt-and-braces in case transitionend doesn't fire (e.g. tab backgrounded).
    setTimeout(cleanup, 1200);
  }
})();

/* ============ ABOUT VIDEO: deferred load ============ */
/* Only starts downloading once the hero video is actually on screen and
   playing (right as the splash disappears). By then it has the full
   scroll-through-the-hero (and, worst case, the 10s reveal wait) to
   buffer before the visitor ever reaches the About section — with none
   of that time spent fighting the hero video for bandwidth. Streamed
   natively (preload:'auto'), not blob-downloaded, so it starts playable
   sooner and doesn't hold the whole file in memory. */
(function(){
  var aboutVideo = document.getElementById('aboutVideo');
  if(!aboutVideo || !aboutVideo.dataset.src) return;

  document.addEventListener('hero-video-started', function startAboutVideoLoad(){
    document.removeEventListener('hero-video-started', startAboutVideoLoad);
    aboutVideo.preload = 'auto';
    aboutVideo.src = aboutVideo.dataset.src;
    aboutVideo.load();
  });
})();

document.getElementById('year').textContent = new Date().getFullYear();

/* ============ REDUCED MOTION CHECK ============ */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============ HERO REVEAL AFTER 10s OF HERO VIDEO PLAYBACK ============ */
const video = document.getElementById('heroVideo');
const heroEl = document.getElementById('hero');
const heroContent = document.getElementById('heroContent');
const nav = document.getElementById('siteNav');
const skipBtn = document.getElementById('skipIntro');
const REVEAL_AT = 10; // seconds of ACTUAL hero video playback
let revealed = false;
let heroRevealArmed = false;

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

/* Wires up the actual 10-second watch and its fallbacks. Only called once
   the hero video has actually started playing — see the 'hero-video-started'
   listener below — so REVEAL_AT is measured against real playback time,
   not against however long the splash preloader happened to take. */
function armHeroReveal(){
  if (heroRevealArmed) return;
  heroRevealArmed = true;

  if (prefersReducedMotion){
    // Respect reduced motion: reveal immediately, no wait
    doReveal();
    return;
  }

  video.addEventListener('timeupdate', () => {
    if (video.currentTime >= REVEAL_AT) doReveal();
  });
  // Fallback: if the video fails to load/play, don't trap the user
  video.addEventListener('error', () => {
    handleMediaError(video, heroEl);
    doReveal();
  });
  // Safety net in case timeupdate never fires (e.g. autoplay silently
  // blocked) — counted from when playback was attempted, not from page load.
  setTimeout(() => { if (!revealed) doReveal(); }, REVEAL_AT * 1000 + 5000);
}

skipBtn.addEventListener('click', doReveal);

// The splash screen dispatches this the instant it hands off and calls
// video.play() on the hero video. If there's no splash screen on the page
// for some reason, arm immediately so the hero still reveals normally.
document.addEventListener('hero-video-started', armHeroReveal);
if (!document.getElementById('splash')) armHeroReveal();

/* ============ NAV: scrolled state + mobile toggle ============ */
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const navBackdrop = document.getElementById('navBackdrop');
const navClose = document.getElementById('navClose');

window.addEventListener('scroll', () => {
  nav.classList.toggle('is-scrolled', window.scrollY > 40);
  updateRail();
}, { passive: true });

function openMenu(){
  navLinks.classList.add('is-open');
  navToggle.classList.add('is-active');
  navToggle.setAttribute('aria-expanded', true);
  navBackdrop.classList.add('is-visible');
  document.body.style.overflow = 'hidden';
}
function closeMenu(){
  navLinks.classList.remove('is-open');
  navToggle.classList.remove('is-active');
  navToggle.setAttribute('aria-expanded', false);
  navBackdrop.classList.remove('is-visible');
  document.body.style.overflow = '';
}

navToggle.addEventListener('click', () => {
  navLinks.classList.contains('is-open') ? closeMenu() : openMenu();
});
if (navClose) navClose.addEventListener('click', closeMenu);
if (navBackdrop) navBackdrop.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', closeMenu);
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
  '.section-eyebrow, .section-title, .scrub-content, .scrub-sticky, .tl-item, .project-card, .skill-card, .contact-form, .contact-links'
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
/* Each canvas only runs its animation loop while it's actually visible in
   the viewport (IntersectionObserver), so off-screen cards don't burn CPU
   on the main thread. */
function initMiniCanvas(canvas){
  const variant = canvas.dataset.variant;
  const ctx = canvas.getContext('2d');
  let w, h, dpr;
  const points = [];
  let running = false;

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
  }

  function loop(){
    if (!running) return;
    draw();
    if (!prefersReducedMotion) requestAnimationFrame(loop);
  }

  resize(); seed();

  if (typeof IntersectionObserver !== 'undefined'){
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting){
          if (!running){
            running = true;
            loop();
          }
        } else {
          running = false;
        }
      });
    }, { rootMargin: '80px' });
    obs.observe(canvas);
  } else {
    // No IntersectionObserver support — fall back to always-on animation.
    running = true;
    loop();
  }

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

/* ============ CONTACT FORM (Firebase Firestore) ============ */
const form = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');
const submitBtn = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const subject = form.subject.value.trim();
  const message = form.message.value.trim();

  if (!window.__firebase) {
    formNote.textContent = 'Something went wrong connecting to the server. Please email me directly instead.';
    return;
  }

  const { db, collection, addDoc, serverTimestamp } = window.__firebase;

  submitBtn.disabled = true;
  formNote.textContent = 'Sending…';

  try {
    await addDoc(collection(db, 'contactMessages'), {
      name,
      email,
      subject,
      message,
      createdAt: serverTimestamp()
    });

    formNote.textContent = `Thanks${name ? ', ' + name : ''} — your message has been sent. I'll get back to you soon.`;
    form.reset();
  } catch (err) {
    console.error('[contact form] Failed to submit:', err);
    formNote.textContent = 'Something went wrong sending your message. Please try emailing me directly.';
  } finally {
    submitBtn.disabled = false;
  }
});