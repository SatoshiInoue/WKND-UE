// Expect pre-decorate rows: .timeline > row(div) > 5 cells:
// [0]=year, [1]=title, [2]=bodyHTML, [3]=image (img/picture/video or URL), [4]=priority

function readRows(block) {
  const rows = Array.from(block.children);
  const out = [];

  for (const row of rows) {
    const cells = Array.from(row.children || []);
    if (!cells.length) continue;

    const year = (cells[0]?.textContent || '').trim();
    const title = (cells[1]?.textContent || '').trim();
    const bodyHTML = cells[2]?.innerHTML?.trim() || '';

    let imgSrc = '';
    let imgAlt = '';
    const img = cells[3]?.querySelector('img, picture img, video');
    if (img) {
      imgSrc = img.getAttribute('src') || img.currentSrc || '';
      imgAlt = img.getAttribute('alt') || '';
    } else {
      imgSrc = (cells[3]?.textContent || '').trim();
    }

    const priority = (cells[4]?.textContent || '').trim();

    if (year || title || bodyHTML || imgSrc) {
      out.push({ year, title, bodyHTML, imgSrc, imgAlt, priority });
    }
  }
  return out;
}

function buildPanel(item, idx) {
  const sec = document.createElement('section');
  sec.className = 't-item';
  sec.setAttribute('role', 'group');
  sec.dataset.index = idx;
  sec.dataset.side = idx % 2 === 0 ? 'left' : 'right';

  // Media (full-bleed background)
  const media = document.createElement('div');
  media.className = 't-media';
  if (item.imgSrc) {
    const img = document.createElement('img');
    img.src = item.imgSrc;
    img.alt = item.imgAlt || '';
    img.loading = idx === 0 ? 'eager' : 'lazy';
    if (item.priority === 'high' || idx === 0)
      img.setAttribute('fetchpriority', 'high');
    media.appendChild(img);
  }
  sec.appendChild(media);

  // Scrim
  const scrim = document.createElement('div');
  scrim.className = 't-scrim';
  sec.appendChild(scrim);

  // Text overlay
  const content = document.createElement('div');
  content.className = 't-content';
  content.innerHTML = `
    ${item.year ? `<span class="t-year">${item.year}</span>` : ''}
    ${item.title ? `<h3 class="t-title">${item.title}</h3>` : ''}
    ${item.bodyHTML ? `<div class="t-body">${item.bodyHTML}</div>` : ''}
  `;
  sec.appendChild(content);

  return sec;
}

function observeActive(block) {
  const items = Array.from(block.querySelectorAll('.t-item'));
  if (!items.length) return;

  // mark first as active initially
  items[0].classList.add('is-active');

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.66) {
          items.forEach((n) => n.classList.toggle('is-active', n === e.target));
        }
      });
    },
    { root: block, threshold: [0.66] }
  );

  items.forEach((el) => io.observe(el));
}
export default function decorate(block) {
  // Prevent double decoration (UE can re-run scripts)
  if (block.dataset.decorated === 'true') return;
  block.dataset.decorated = 'true';

  // Read rows -> items (keep your existing readRows())
  const items = readRows(block);
  if (!items.length) return;

  // If UE: render simplest static markup (no observers, no snapping, no overlay)
  if (isUE()) {
    block.innerHTML = '';
    items.forEach((it) => {
      const sec = document.createElement('section');
      sec.className = 't-item';
      const media = document.createElement('div');
      media.className = 't-media';
      if (it.imgSrc) {
        const img = document.createElement('img');
        img.src = it.imgSrc;
        img.alt = it.imgAlt || '';
        media.appendChild(img);
      }
      const content = document.createElement('div');
      content.className = 't-content';
      content.innerHTML = `
        ${it.year ? `<span class="t-year">${it.year}</span>` : ''}
        ${it.title ? `<h3 class="t-title">${it.title}</h3>` : ''}
        ${it.bodyHTML ? `<div class="t-body">${it.bodyHTML}</div>` : ''}
      `;
      sec.appendChild(media);
      sec.appendChild(content);
      block.appendChild(sec);
    });
    return; // 👈 stop: no IO, no scroll handlers in UE
  }

  // --- Published site behavior below ---
  block.innerHTML = '';
  items.forEach((it, idx) => block.appendChild(buildPanel(it, idx)));

  // Viewport-based active tracking; no scrollIntoView loops
  observeActiveViewport(block);

  // Optional: keyboard nav — remove if not needed
  block.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const cards = Array.from(block.querySelectorAll('.t-item'));
    const activeIdx = Math.max(
      0,
      cards.findIndex((n) => n.classList.contains('is-active'))
    );
    const next =
      e.key === 'ArrowDown'
        ? Math.min(activeIdx + 1, cards.length - 1)
        : Math.max(activeIdx - 1, 0);
    cards[next].scrollIntoView({ behavior: 'smooth', block: 'start' });
    e.preventDefault();
  });
}
function addExitSentinel(block) {
  if (!block.querySelector('.t-exit')) {
    block.appendChild(
      Object.assign(document.createElement('div'), { className: 't-exit' })
    );
  }
}

// when user tries to scroll beyond the last panel, nudge the page
function enableScrollHandoff(block) {
  const atBottom = () =>
    block.scrollTop + block.clientHeight >= block.scrollHeight - 1;
  const atTop = () => block.scrollTop <= 0;

  block.addEventListener(
    'wheel',
    (e) => {
      if ((e.deltaY > 0 && atBottom()) || (e.deltaY < 0 && atTop())) {
        // let the page scroll
        block.blur?.();
        // a tiny nudge to break out of the inner scroller
        window.scrollBy({
          top: e.deltaY > 0 ? 1 : -1,
          left: 0,
          behavior: 'instant',
        });
      }
    },
    { passive: true }
  );

  // touch support
  let startY = 0;
  block.addEventListener(
    'touchstart',
    (e) => {
      startY = e.touches[0].clientY;
    },
    { passive: true }
  );
  block.addEventListener(
    'touchmove',
    (e) => {
      const dy = startY - e.touches[0].clientY;
      if ((dy > 0 && atBottom()) || (dy < 0 && atTop())) {
        window.scrollBy({ top: dy > 0 ? 1 : -1, left: 0, behavior: 'instant' });
      }
    },
    { passive: true }
  );
}

function isUE() {
  return !!document.querySelector(
    '[data-aue-present],[data-aue-edit-mode],[data-aue-canvas]'
  );
}

function observeActiveViewport(block) {
  const items = Array.from(block.querySelectorAll('.t-item'));
  if (!items.length) return;
  items[0].classList.add('is-active');

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          items.forEach((n) => n.classList.toggle('is-active', n === e.target));
        }
      }
    },
    { root: null, threshold: [0.6] }
  );

  items.forEach((el) => io.observe(el));
}
