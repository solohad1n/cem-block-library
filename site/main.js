"use strict";
/* === components/slider.js === */
(() => {
// Слайдер-лента: стрелки, точки, состояния disabled. Поведение описано в slider.css.
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initSlider(root) {
  const track = root.querySelector('.slider__track');
  const slides = [...track.children];
  const id = root.id;
  const prev = id ? document.querySelectorAll(`[data-slider-prev="${id}"]`) : [];
  const next = id ? document.querySelectorAll(`[data-slider-next="${id}"]`) : [];
  const dotsBox = root.querySelector('[data-slider-dots]');
  const total = slides.length;
  slides.forEach((s, i) => { s.setAttribute('aria-roledescription', 'слайд'); s.setAttribute('aria-label', `${i + 1} из ${total}`); });

  let dots = [];
  if (dotsBox) {
    dotsBox.innerHTML = '';
    dots = slides.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', `Слайд ${i + 1} из ${total}`);
      b.addEventListener('click', () => go(i));
      dotsBox.append(b); return b;
    });
  }

  function go(i) {
    i = Math.max(0, Math.min(total - 1, i));
    const left = slides[i].offsetLeft - slides[0].offsetLeft;
    track.scrollTo({ left, behavior: reduce() ? 'auto' : 'smooth' });
  }
  function update() {
    const max = track.scrollWidth - track.clientWidth;
    const atStart = track.scrollLeft <= 2, atEnd = track.scrollLeft >= max - 2;
    prev.forEach(b => { b.disabled = atStart; });
    next.forEach(b => { b.disabled = atEnd || max <= 2; });
    const left = track.scrollLeft;
    let cur = 0, d = Infinity;
    slides.forEach((s, i) => { const dd = Math.abs((s.offsetLeft - slides[0].offsetLeft) - left); if (dd < d) { d = dd; cur = i; } });
    if (atEnd && max > 2) cur = total - 1;   // упёрлись в конец — активна последняя точка
    dots.forEach((b, i) => b.setAttribute('aria-current', String(i === cur)));
    root.dataset.index = cur;
  }
  // Шаг стрелкой: к ближайшему слайду левее/правее текущей позиции (а не по номеру точки — в конце ленты они расходятся)
  const offs = () => slides.map(s => s.offsetLeft - slides[0].offsetLeft);
  const step = dir => {
    const x = track.scrollLeft, o = offs();
    const i = dir > 0 ? o.findIndex(v => v > x + 2) : o.map((v, k) => [v, k]).filter(([v]) => v < x - 2).pop()?.[1];
    if (i !== undefined && i > -1) go(i);
  };
  prev.forEach(b => { b.setAttribute('aria-controls', track.id || (track.id = `${id}-track`)); b.addEventListener('click', () => step(-1)); });
  next.forEach(b => { b.setAttribute('aria-controls', track.id || (track.id = `${id}-track`)); b.addEventListener('click', () => step(1)); });
  let raf = 0;
  track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
  track.addEventListener('focusin', e => { const s = e.target.closest('.slider__slide'); if (s) go(slides.indexOf(s)); });
  new ResizeObserver(update).observe(track);
  update();
  root.slider = { go, update };
}
document.querySelectorAll('[data-js~="slider"]').forEach(initSlider);

})();

/* === components/interactive.js === */
(() => {
// Общие виджеты: вкладки, аккордеон, выпадающее меню, выпадающий список с поиском, проверка форм, всплывающие окна.
// Подключаются атрибутом data-js на корне. Каждый виджет описан в CSS-файле своего компонента.

/* ---------- ВКЛАДКИ  data-js="tabs" ----------
   <div data-js="tabs"> … <button role="tab" aria-controls="ID" aria-selected="true|false"> … <div role="tabpanel" id="ID">
   Клик / Enter / Space — открыть вкладку; ←/→ (↑/↓ при aria-orientation="vertical") — соседняя; Home/End — крайние.
   Панели неактивных вкладок получают hidden. Событие tabs:change на корне. */
function initTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')].filter(t => t.closest('[data-js~="tabs"]') === root);
  const vertical = root.getAttribute('aria-orientation') === 'vertical' || root.querySelector('[role="tablist"][aria-orientation="vertical"]');
  const select = (tab, focus) => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls')); if (p) p.hidden = !on;
    });
    if (focus) tab.focus();
    root.dispatchEvent(new CustomEvent('tabs:change', { detail: { index: tabs.indexOf(tab) } }));
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {
      const k = e.key, n = tabs.length;
      const step = (vertical ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 })[k];
      if (step) { e.preventDefault(); select(tabs[(i + step + n) % n], true); }
      if (k === 'Home') { e.preventDefault(); select(tabs[0], true); }
      if (k === 'End') { e.preventDefault(); select(tabs[n - 1], true); }
    });
  });
  const cur = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
  if (cur) select(cur);
  root.tabs = { select: i => select(tabs[i]) };
}

/* ---------- АККОРДЕОН  data-js="accordion" ----------
   <div data-js="accordion" data-single> <div class="… is-open?"><button aria-expanded aria-controls="ID">…</button><div id="ID" hidden>…</div></div>
   data-single — открыт только один пункт (ПРЕДЛОЖЕНИЕ для FAQ, Q-12). Клик/Enter/Space — открыть/закрыть. */
function initAccordion(root) {
  const btns = [...root.querySelectorAll('[aria-expanded][aria-controls]')].filter(b => b.closest('[data-js~="accordion"]') === root);
  const set = (b, open) => {
    b.setAttribute('aria-expanded', String(open));
    const p = document.getElementById(b.getAttribute('aria-controls')); if (p) p.hidden = !open;
    b.closest('[data-acc-item]')?.classList.toggle('is-open', open);
  };
  btns.forEach(b => {
    set(b, b.getAttribute('aria-expanded') === 'true');
    b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      if (open && root.hasAttribute('data-single')) btns.forEach(o => o !== b && set(o, false));
      set(b, open);
    });
  });
}

/* ---------- ВЫПАДАЮЩЕЕ МЕНЮ  data-js="dropdown" ----------
   Пункт меню шапки «О центре ⌄». Открытие: наведение (≥ 1280, с задержкой закрытия 200 мс) или клик/Enter;
   Esc и клик снаружи — закрыть; фокус уходит из меню — закрыть. */
function initDropdown(root) {
  const btn = root.querySelector('[aria-expanded]');
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  let timer;
  const set = open => { btn.setAttribute('aria-expanded', String(open)); panel.hidden = !open; root.classList.toggle('is-open', open); };
  set(false);
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  const hover = window.matchMedia('(hover: hover) and (min-width: 1280px)');
  root.addEventListener('pointerenter', () => { if (hover.matches) { clearTimeout(timer); set(true); } });
  root.addEventListener('pointerleave', () => { if (hover.matches) timer = setTimeout(() => set(false), 200); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { set(false); btn.focus(); } });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) set(false); });
  document.addEventListener('click', e => { if (!root.contains(e.target)) set(false); });
}

/* ---------- ВЫПАДАЮЩИЙ СПИСОК С ПОИСКОМ  data-js="select" (см. form.css) ---------- */
function initSelect(root) {
  const toggle = root.querySelector('.select__toggle');
  const panel = root.querySelector('.select__panel');
  const search = root.querySelector('.select__search');
  const list = root.querySelector('.select__list');
  const value = root.querySelector('.select__value');
  const hidden = root.querySelector('input[type="hidden"]');
  const opts = [...list.querySelectorAll('[role="option"]')];
  const placeholder = value.textContent;
  let empty = null, active = -1;
  opts.forEach((o, i) => { o.id = o.id || `${root.id || 'sel'}-o${i}`; o.setAttribute('aria-selected', 'false'); });
  const visible = () => opts.filter(o => !o.hidden);
  const highlight = i => { const v = visible(); active = Math.max(0, Math.min(v.length - 1, i)); opts.forEach(o => o.classList.remove('is-active')); if (v[active]) { v[active].classList.add('is-active'); v[active].scrollIntoView({ block: 'nearest' }); search.setAttribute('aria-activedescendant', v[active].id); } };
  const open = () => { panel.hidden = false; root.classList.add('is-open'); toggle.setAttribute('aria-expanded', 'true'); search.value = ''; filter(); search.focus(); };
  const close = (focus) => { panel.hidden = true; root.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); if (focus) toggle.focus(); };
  const choose = o => { opts.forEach(x => x.setAttribute('aria-selected', String(x === o))); value.textContent = o.textContent; root.classList.add('has-value'); if (hidden) { hidden.value = o.dataset.value || o.textContent; hidden.dispatchEvent(new Event('change', { bubbles: true })); } root.classList.remove('is-invalid'); close(true); };
  function filter() {
    const q = search.value.trim().toLowerCase();
    opts.forEach(o => { o.hidden = q && !o.textContent.toLowerCase().includes(q); });
    if (!visible().length) { if (!empty) { empty = document.createElement('li'); empty.className = 'select__empty'; empty.textContent = 'Ничего не найдено'; } list.append(empty); } else empty?.remove();
    highlight(0);
  }
  panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => panel.hidden ? open() : close(true));
  toggle.addEventListener('keydown', e => { if (['ArrowDown', 'Enter', ' '].includes(e.key) && panel.hidden) { e.preventDefault(); open(); } });
  search.addEventListener('input', filter);
  search.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    if (e.key === 'Enter') { e.preventDefault(); const o = visible()[active]; if (o) choose(o); }
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
  });
  opts.forEach(o => o.addEventListener('click', () => choose(o)));
  document.addEventListener('click', e => { if (!root.contains(e.target) && !panel.hidden) close(false); });
  root.select = { reset: () => { value.textContent = placeholder; root.classList.remove('has-value'); if (hidden) hidden.value = ''; } };
}

/* ---------- ПРОВЕРКА ФОРМЫ  data-js="form" ----------
   Обязательные поля: required. Ошибка показывается после ухода из поля (blur) и при отправке.
   Тексты ошибок — data-error на поле, иначе «Заполните поле» / «Проверьте номер» / «Проверьте e-mail» (ПРЕДЛОЖЕНИЕ, Q-15).
   Телефон: маска +7 (___) ___-__-__ (ПРЕДЛОЖЕНИЕ, Q-15). Согласие — обязательно (ПРЕДЛОЖЕНИЕ, Q-10).
   Отправка: кнопка aria-busy, затем событие form:submit (отправку подключает разработчик).
   Разметка формы: <form data-js="form" action="…" method="post"> + первым потомком ловушка для ботов
   <input type="text" name="cem_hp" tabindex="-1" autocomplete="off" inert hidden aria-hidden="true">
   (сервер отбрасывает заявку, если поле заполнено; в каждой форме сайта). */
function initForm(form) {
  const msg = el => el.dataset.error || (el.validity.valueMissing ? 'Заполните поле' : el.type === 'tel' ? 'Проверьте номер' : el.type === 'email' ? 'Проверьте e-mail' : 'Проверьте поле');
  const check = el => {
    const wrap = el.closest('.field, .checkbox'); if (!wrap) return true;
    const ok = el.checkValidity();
    wrap.classList.toggle('is-invalid', !ok);
    const err = wrap.querySelector('.field__error'); if (err) err.textContent = ok ? '' : msg(el);
    el.setAttribute('aria-invalid', String(!ok));
    return ok;
  };
  form.querySelectorAll('input[type="tel"]').forEach(el => {
    el.setAttribute('pattern', '\\+7 \\(\\d{3}\\) \\d{3}-\\d{2}-\\d{2}');
    el.addEventListener('input', () => {
      let d = el.value.replace(/\D/g, ''); if (d.startsWith('8')) d = '7' + d.slice(1); if (!d.startsWith('7')) d = '7' + d; d = d.slice(0, 11);
      const p = d.slice(1); let v = '+7';
      if (p.length) v += ' (' + p.slice(0, 3); if (p.length >= 3) v += ') ' + p.slice(3, 6); if (p.length >= 6) v += '-' + p.slice(6, 8); if (p.length >= 8) v += '-' + p.slice(8, 10);
      el.value = v;
    });
  });
  form.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('blur', () => { if (el.type !== 'checkbox' && (el.value || el.dataset.touched)) check(el); el.dataset.touched = '1'; });
    el.addEventListener('input', () => { if (el.closest('.is-invalid')) check(el); });
    el.addEventListener('change', () => { if (el.type === 'checkbox') check(el); });
  });
  form.setAttribute('novalidate', '');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const els = [...form.querySelectorAll('input:not([type="hidden"]), textarea')].filter(el => !el.closest('[inert]'));
    const bad = els.filter(el => !check(el));
    if (bad.length) { bad[0].focus(); return; }
    const btn = form.querySelector('[type="submit"]'); btn?.setAttribute('aria-busy', 'true');
    form.dispatchEvent(new CustomEvent('form:submit', { bubbles: true, detail: new FormData(form) }));
    setTimeout(() => btn?.removeAttribute('aria-busy'), 800);
  });
}

/* ---------- ВСПЛЫВАЮЩЕЕ ОКНО / ЛИСТ  <dialog data-js="sheet"> ----------
   Открывается кнопкой [data-sheet-open="ID"], закрывается [data-sheet-close], Esc, кликом по фону.
   Фокус при открытии: первое поле (desktop) или само окно (сенсорные экраны) — решение v13. */
function initSheets() {
  document.querySelectorAll('[data-sheet-open]').forEach(b => b.addEventListener('click', () => {
    const d = document.getElementById(b.dataset.sheetOpen); if (!d) return;
    d.showModal(); b.setAttribute('aria-expanded', 'true');
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const first = d.querySelector('input:not([type="hidden"]):not([inert] *), textarea, select');
    (touch || !first ? d : first).focus();
    d.addEventListener('close', () => b.setAttribute('aria-expanded', 'false'), { once: true });
  }));
  document.querySelectorAll('dialog[data-js~="sheet"]').forEach(d => {
    d.tabIndex = -1;
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.querySelectorAll('[data-sheet-close]').forEach(b => b.addEventListener('click', () => d.close()));
  });
}

document.querySelectorAll('[data-js~="tabs"]').forEach(initTabs);
document.querySelectorAll('[data-js~="accordion"]').forEach(initAccordion);
document.querySelectorAll('[data-js~="dropdown"]').forEach(initDropdown);
document.querySelectorAll('[data-js~="select"]').forEach(initSelect);
document.querySelectorAll('form[data-js~="form"]').forEach(initForm);
initSheets();

})();

/* === blocks/assistant/assistant.js === */
(() => {
// assistant — поповеры симптомов на карте тела (поведение описано в spec.json → behavior).
// Клик по маркеру — открыть его поповер (открыт только один); повторный клик, крестик, Esc, клик снаружи — закрыть.
// Поповер сдвигается по горизонтали внутрь видимой области (блок / прокручиваемая карта на mobile / окно),
// а у нижнего края карты открывается вверх (ПРЕДЛОЖЕНИЕ, Q-assistant-1).
document.querySelectorAll('[data-block="assistant"]').forEach(root => {
  const map = root.querySelector('[data-assistant-map]');
  if (!map) return;
  const scroller = root.querySelector('.assistant__scroller');
  const points = [...map.querySelectorAll('.assistant__point')];
  const GAP = 12;
  let open = null;

  const place = (point, pop) => {
    pop.style.removeProperty('--dx'); pop.classList.remove('is-up');
    const r = pop.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect(), br = root.getBoundingClientRect();
    const cs = getComputedStyle(scroller);
    const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const lo = Math.max(scrolls ? sr.left : br.left, 0) + GAP;
    const hi = Math.min(scrolls ? sr.right : br.right, document.documentElement.clientWidth) - GAP;
    let dx = 0;
    if (r.right > hi) dx = hi - r.right;
    if (r.left + dx < lo) dx = lo - r.left;
    if (dx) pop.style.setProperty('--dx', `${Math.round(dx)}px`);
    const mr = map.getBoundingClientRect();
    if (r.bottom > mr.bottom) pop.classList.add('is-up');
  };

  const set = (point, state, focusBack) => {
    const btn = point.querySelector('.assistant__marker');
    const pop = point.querySelector('.assistant__pop');
    btn.setAttribute('aria-expanded', String(state));
    pop.hidden = !state;
    point.classList.toggle('is-open', state);
    if (state) { open = point; place(point, pop); }
    else { if (open === point) open = null; if (focusBack) btn.focus(); }
  };

  points.forEach(point => {
    const btn = point.querySelector('.assistant__marker');
    btn.addEventListener('click', () => {
      const willOpen = btn.getAttribute('aria-expanded') !== 'true';
      if (open && open !== point) set(open, false);
      set(point, willOpen);
    });
    point.querySelector('.assistant__pop-close')?.addEventListener('click', () => set(point, false, true));
  });

  root.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.preventDefault(); set(open, false, true); } });
  document.addEventListener('click', e => { if (open && !open.contains(e.target)) set(open, false); });
  const replace = () => { if (open) place(open, open.querySelector('.assistant__pop')); };
  window.addEventListener('resize', replace);
  scroller.addEventListener('scroll', replace, { passive: true });   // mobile: карту пролистали — поповер остаётся в видимой части
});

// «Голосовой помощник Док» и микрофон: механика не определена (Q-assistant-10) — разработчик подключает
// обработчик по событию assistant:voice на корне блока.
document.querySelectorAll('[data-block="assistant"]').forEach(root => {
  root.querySelectorAll('[data-assistant-voice], [data-assistant-mic]').forEach(b =>
    b.addEventListener('click', () => root.dispatchEvent(new CustomEvent('assistant:voice', { bubbles: true, detail: { source: b.hasAttribute('data-assistant-mic') ? 'mic' : 'button' } }))));
});

})();

/* === blocks/directions/directions.js === */
(() => {
// directions — один DOM, два поведения (общих виджетов не хватает: tabs и accordion не умеют переключаться по ширине).
// ≥ 1050: вкладки (role=tablist/tab/tabpanel, aria-selected; ←/→, Home/End), одна вкладка всегда открыта, по умолчанию первая.
// < 1050: аккордеон (aria-expanded), по умолчанию всё свёрнуто, открыта не больше одной плитки (ПРЕДЛОЖЕНИЕ, Q-directions-2).
// На корне блока — data-active="<индекс>" (для формы панели: прямой угол под крайней активной вкладкой).
const root = document.querySelector('[data-block="directions"]');
if (root) {
  const grid = root.querySelector('[data-directions]');
  const tabs = [...grid.querySelectorAll(':scope > [data-dir-item] > .directions__tab')];
  const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
  const mq = window.matchMedia('(min-width: 1050px)');
  let active = 0;      // вкладка (desktop)
  let open = -1;       // раскрытая плитка (mobile)

  const render = () => {
    const desk = mq.matches;
    if (desk) grid.setAttribute('role', 'tablist'); else grid.removeAttribute('role');
    tabs.forEach((t, i) => {
      const p = panels[i];
      if (desk) {
        t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(i === active)); t.removeAttribute('aria-expanded');
        t.tabIndex = i === active ? 0 : -1;
        p.setAttribute('role', 'tabpanel'); p.hidden = i !== active;
      } else {
        t.removeAttribute('role'); t.removeAttribute('aria-selected'); t.setAttribute('aria-expanded', String(i === open));
        t.removeAttribute('tabindex');
        p.removeAttribute('role'); p.hidden = i !== open;
      }
    });
    root.dataset.active = desk ? active : '';
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      if (mq.matches) active = i; else open = open === i ? -1 : i;
      render();
    });
    t.addEventListener('keydown', e => {
      if (!mq.matches) return;
      const n = tabs.length;
      const map = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 };
      if (e.key in map) { e.preventDefault(); active = map[e.key]; render(); tabs[active].focus(); }
    });
  });
  mq.addEventListener('change', render);
  render();
}

})();

/* === blocks/faq/faq.js === */
(() => {
// faq — постраничный показ вопросов на desktop (≥ 1280): по data-per-page (4) на странице, стрелки листают страницы.
// ПРЕДЛОЖЕНИЕ, Q-faq-1: в макете стрелки есть, поведение не задано. < 1280 — все вопросы, стрелок нет.
const root = document.querySelector('[data-block="faq"]');
if (root) {
  const list = root.querySelector('.faq__list');
  const items = [...list.querySelectorAll('.faq__item')];
  const per = +list.dataset.perPage || 4;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const prev = root.querySelector('[data-faq-prev]');
  const next = root.querySelector('[data-faq-next]');
  const mq = window.matchMedia('(min-width: 1280px)');
  let page = 0;
  const render = () => {
    const on = mq.matches;
    items.forEach((it, i) => it.classList.toggle('is-off', on && Math.floor(i / per) !== page));
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
  };
  const go = d => { page = Math.max(0, Math.min(pages - 1, page + d)); render(); };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  mq.addEventListener('change', render);
  render();
}

})();

/* === blocks/footer/footer.js === */
(() => {
// footer — кнопка «Наверх»: плавная прокрутка к началу страницы (без JS — переход по якорю #top).
// При «уменьшить движение» — мгновенно. Фокус переносится на шапку (#top), чтобы клавиатура продолжила с начала.
document.querySelectorAll('[data-block="footer"] [data-footer-up]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  const top = document.getElementById('top');
  if (top) { if (!top.hasAttribute('tabindex')) top.setAttribute('tabindex', '-1'); top.focus({ preventScroll: true }); }
  history.replaceState(null, '', location.pathname + location.search);
}));

})();