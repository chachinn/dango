(() => {
  'use strict';

  const SOURCE = './app.js';
  const TARGET_VERSION = '5.2.3';

  function installExteriorWallRendering() {
    const svg = document.getElementById('planCanvas');
    if (!svg) return;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let queued = false;

    const fix = () => {
      queued = false;
      const wall = [...svg.children].find(el =>
        el.tagName?.toLowerCase() === 'polygon' &&
        el.getAttribute('stroke') === '#514147' &&
        !el.dataset.dangoExteriorWall
      );
      if (!wall) return;

      wall.dataset.dangoExteriorWall = 'true';
      const originalStroke = Math.max(1, Number.parseFloat(wall.getAttribute('stroke-width')) || 3);

      // SVG strokes are normally centered on their path. Double the stroke, then
      // cover the interior half with the room fill. The visible wall therefore
      // keeps the same apparent thickness, but all of it sits OUTSIDE the entered
      // room boundary. Coordinate 0..width/height stays the clear usable interior.
      wall.setAttribute('stroke-width', String(originalStroke * 2));

      const interior = document.createElementNS(SVG_NS, 'polygon');
      interior.setAttribute('points', wall.getAttribute('points') || '');
      interior.setAttribute('fill', wall.getAttribute('fill') || '#fffdfd');
      interior.setAttribute('stroke', 'none');
      interior.setAttribute('pointer-events', 'none');
      interior.dataset.dangoInteriorSurface = 'true';
      wall.after(interior);
    };

    const schedule = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(fix);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(svg, { childList: true });
    fix();
  }

  function execute(source) {
    let patched = source;
    let geometryPatched = false;

    if (patched.includes('const DANGO_DRAWN_WALL_CM=3;')) {
      patched = patched.replace('const DANGO_DRAWN_WALL_CM=3;', 'const DANGO_DRAWN_WALL_CM=0;');
      geometryPatched = true;
    }

    // Keep the About/version surfaces aligned with the deployed build.
    patched = patched.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${TARGET_VERSION}';`);

    if (!geometryPatched) {
      console.warn('Dango interior-dimension patch marker was not found; loading source unchanged.');
    }

    (0, eval)(`${patched}\n//# sourceURL=app.js`);
    installExteriorWallRendering();
    window.DANGO_INTERIOR_DIMENSIONS_VERSION = TARGET_VERSION;
  }

  function fallback() {
    console.warn('Dango could not apply the interior-dimension loader; falling back to the normal app bundle.');
    const script = document.createElement('script');
    script.src = SOURCE;
    script.async = false;
    document.head.appendChild(script);
    script.addEventListener('load', installExteriorWallRendering, { once: true });
  }

  fetch(SOURCE, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`app.js returned ${response.status}`);
      return response.text();
    })
    .then(execute)
    .catch(error => {
      console.error('Dango app loader error:', error);
      fallback();
    });
})();
