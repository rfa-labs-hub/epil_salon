/**
 * Редактор фото.
 *
 * 5 секций:
 *  1) Каталог работ — галерея в services.html (#works-gallery-list).
 *     Можно добавлять/удалять фото. Файлы в images/works/.
 *  2) Ламинирование ресниц — галерея в services.html (#resni-gallery-list).
 *     Можно добавлять/удалять. Файлы в images/resni/.
 *  3) Фото мастеров — img.master-card__img в index.html.
 *     Можно только заменять (кадровый список фиксирован).
 *  4) Фото услуг — img.service-content__img в services.html.
 *     Можно заменять.
 *  5) Фон главной страницы — images/hero.jfif (используется в CSS).
 *     Можно заменить, при замене обновляем ссылку в css/style.css для сброса кэша.
 *
 * Кэш браузера сбрасываем добавлением ?v=<timestamp> к src/url.
 *
 * Зависит от: window.GH, window.AdminUI.
 */
(function () {
  'use strict';

  const SERVICES_FILE = 'services.html';
  const INDEX_FILE = 'index.html';
  const CSS_FILE = 'css/style.css';

  // Состояние секций
  const _state = {
    services: null,    // { content, sha, doc }
    index: null,
    css: null,
    mountedContainer: null,
    initialized: false
  };

  // ---------- helpers ----------------------------------------------------

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('data-') === 0 || k === 'role' || k === 'type' || k === 'placeholder' || k === 'value' || k === 'aria-label' || k === 'title' || k === 'href' || k === 'target' || k === 'rel' || k === 'accept') {
        e.setAttribute(k, attrs[k]);
      } else e[k] = attrs[k];
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Из 'images/elena.jfif?v=123' вытащить чистый путь 'images/elena.jfif'.
   */
  function stripQuery(src) {
    if (!src) return '';
    const i = src.indexOf('?');
    return i === -1 ? src : src.slice(0, i);
  }

  function withCacheBust(src) {
    const clean = stripQuery(src);
    return clean + '?v=' + Date.now();
  }

  function previewUrl(repoPath, justUploadedFile) {
    if (justUploadedFile) {
      try { return URL.createObjectURL(justUploadedFile); } catch (e) {}
    }
    return window.GH.previewUrl(repoPath);
  }

  function getExt(filename) {
    const m = /\.([a-zA-Z0-9]+)$/.exec(filename || '');
    return m ? m[1].toLowerCase() : 'jpg';
  }

  // ---------- загрузка / сохранение источников --------------------------

  async function ensureFile(key, forceFresh) {
    const map = { services: SERVICES_FILE, index: INDEX_FILE, css: CSS_FILE };
    const path = map[key];
    if (forceFresh || !_state[key]) {
      const data = await window.GH.getTextFile(path, { force: !!forceFresh });
      const doc = (key === 'css') ? null : new DOMParser().parseFromString(data.content, 'text/html');
      _state[key] = { content: data.content, sha: data.sha, doc: doc };
    }
    return _state[key];
  }

  async function saveFile(key, message) {
    const map = { services: SERVICES_FILE, index: INDEX_FILE, css: CSS_FILE };
    const path = map[key];
    const s = _state[key];
    let content;
    if (s.doc) {
      content = '<!DOCTYPE html>\n' + s.doc.documentElement.outerHTML;
    } else {
      content = s.content;
    }
    await window.GH.putTextFile(path, content, message);
    s.content = content;
    // sha обновляется внутри GH.putTextFile через updateCache
    const cached = window.GH.getCachedFile(path);
    if (cached) s.sha = cached.sha;
  }

  function refreshDocFromContent(key) {
    const s = _state[key];
    if (!s) return;
    if (key !== 'css') s.doc = new DOMParser().parseFromString(s.content, 'text/html');
  }

  // ---------- описание секций -------------------------------------------

  // Подписи мастеров — берём из alt автоматически.
  // Подписи услуг — также из alt.

  /**
   * Извлекает все элементы галереи (<li> с .works-gallery__item) из документа.
   */
  function extractGallery(doc, listSelector) {
    const list = doc.querySelector(listSelector);
    if (!list) return { list: null, items: [] };
    const items = Array.from(list.querySelectorAll('li')).map(function (li) {
      const btn = li.querySelector('.works-gallery__item');
      const img = li.querySelector('img');
      return {
        liEl: li,
        btnEl: btn,
        imgEl: img,
        path: stripQuery(btn ? btn.getAttribute('data-src') : (img ? img.getAttribute('src') : '')),
        alt: (btn && btn.getAttribute('data-alt')) || (img && img.getAttribute('alt')) || ''
      };
    });
    return { list: list, items: items };
  }

  function extractSingleImages(doc, selector, makeLabel) {
    const imgs = Array.from(doc.querySelectorAll(selector));
    return imgs.map(function (img, i) {
      return {
        imgEl: img,
        path: stripQuery(img.getAttribute('src') || ''),
        alt: img.getAttribute('alt') || '',
        label: makeLabel ? makeLabel(img, i) : (img.getAttribute('alt') || ('Фото ' + (i + 1)))
      };
    });
  }

  // ---------- секция: галерея -------------------------------------------

  async function renderGallerySection(opts) {
    /* opts: { id, title, hint, fileKey, listSelector, folder, altPrefix } */
    const filedata = await ensureFile(opts.fileKey);
    const gal = extractGallery(filedata.doc, opts.listSelector);

    const section = el('section', { class: 'photo-section', 'data-section': opts.id });
    const header = el('div', { class: 'photo-section__header' }, [
      el('h3', { class: 'photo-section__title', text: opts.title })
    ]);
    section.appendChild(header);

    const grid = el('div', { class: 'photo-grid' });
    section.appendChild(grid);

    function refresh() {
      const fresh = extractGallery(_state[opts.fileKey].doc, opts.listSelector);
      grid.innerHTML = '';
      fresh.items.forEach(function (item, i) {
        grid.appendChild(renderGalleryCard(item, i, opts));
      });
      grid.appendChild(renderAddCard(opts, refresh));
    }

    refresh();
    return section;
  }

  function renderGalleryCard(item, index, opts) {
    const card = el('div', { class: 'photo-card' });

    const thumbWrap = el('div', { class: 'photo-card__thumb' });
    const img = el('img', { src: previewUrl(item.path), alt: item.alt || '' });
    img.onerror = function () { img.style.opacity = '0.3'; };
    thumbWrap.appendChild(img);

    const info = el('div', { class: 'photo-card__info' }, [
      el('div', { class: 'photo-card__label', text: item.alt || ('Фото ' + (index + 1)) })
    ]);

    const delBtn = el('button', { type: 'button', class: 'btn btn--danger-soft', text: 'Удалить' });
    delBtn.addEventListener('click', function () {
      onGalleryDelete(item, opts).catch(function (err) {
        window.AdminUI.showToast(err.userMessage || err.message, 'error', 'Ошибка');
      });
    });

    const actions = el('div', { class: 'photo-card__actions' }, [delBtn]);
    card.appendChild(thumbWrap);
    card.appendChild(info);
    card.appendChild(actions);
    return card;
  }

  function renderAddCard(opts, onAdded) {
    const card = el('label', { class: 'photo-card photo-card--add', title: 'Добавить фото' });
    const input = el('input', { type: 'file', accept: 'image/*' });
    card.appendChild(el('div', { class: 'photo-card--add__icon', text: '+' }));
    card.appendChild(el('div', { class: 'photo-card--add__label', text: 'Добавить фото' }));
    card.appendChild(input);
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      onGalleryAdd(file, opts).then(function () {
        if (onAdded) onAdded();
      }).catch(function (err) {
        window.AdminUI.showToast(err.userMessage || err.message, 'error', 'Ошибка');
      });
      input.value = '';
    });
    return card;
  }

  async function onGalleryAdd(file, opts) {
    if (!/^image\//i.test(file.type)) {
      window.AdminUI.showToast('Можно загружать только изображения.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const ok = await window.AdminUI.confirmDialog(
        'Большое фото',
        'Размер ' + Math.round(file.size / 1024 / 1024) + ' МБ. Это может замедлить загрузку сайта. Сжать фото перед публикацией рекомендуется до 1–2 МБ. Загрузить как есть?',
        'Загрузить'
      );
      if (!ok) return;
    }

    window.AdminUI.showLoader('Загружаем фото…');
    try {
      const ext = getExt(file.name);
      const filename = Date.now() + '.' + ext;
      const repoPath = opts.folder + filename;

      await window.GH.putBinaryFile(repoPath, file, 'admin: add photo to ' + opts.id);

      // Обновляем services.html: всегда берём свежую версию
      const filedata = await ensureFile(opts.fileKey, true);
      const doc = filedata.doc;
      const list = doc.querySelector(opts.listSelector);
      if (!list) throw new Error('Галерея не найдена в HTML.');

      const number = list.querySelectorAll('li').length + 1;
      const altText = (opts.altPrefix || 'Фото') + ' ' + number;

      const li = doc.createElement('li');
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'works-gallery__item';
      btn.setAttribute('data-src', repoPath);
      btn.setAttribute('data-alt', altText);
      btn.setAttribute('aria-label', 'Открыть фото ' + number);
      const imgEl = doc.createElement('img');
      imgEl.setAttribute('src', repoPath);
      imgEl.setAttribute('alt', altText);
      imgEl.setAttribute('width', '280');
      imgEl.setAttribute('height', '210');
      imgEl.setAttribute('loading', 'lazy');
      btn.appendChild(imgEl);
      li.appendChild(btn);
      list.appendChild(li);

      await saveFile(opts.fileKey, 'admin: add photo to ' + opts.id + ' gallery');
      window.AdminUI.showToast('Сайт обновится через 30–90 секунд.', 'success', 'Фото добавлено');
    } finally {
      window.AdminUI.hideLoader();
    }
  }

  async function onGalleryDelete(item, opts) {
    const ok = await window.AdminUI.confirmDialog(
      'Удалить фото?',
      'Фото «' + (item.alt || item.path) + '» будет удалено с сайта и из репозитория. Действие необратимо.',
      'Удалить'
    );
    if (!ok) return;

    window.AdminUI.showLoader('Удаляем фото…');
    try {
      // 1) удаляем <li> — берём свежий HTML
      const filedata = await ensureFile(opts.fileKey, true);
      const doc = filedata.doc;
      const list = doc.querySelector(opts.listSelector);
      if (!list) throw new Error('Галерея не найдена.');
      const lis = list.querySelectorAll('li');
      let removed = false;
      for (let i = 0; i < lis.length; i++) {
        const btn = lis[i].querySelector('.works-gallery__item');
        const path = stripQuery(btn ? btn.getAttribute('data-src') : '');
        if (path === item.path) {
          lis[i].parentNode.removeChild(lis[i]);
          removed = true;
          break;
        }
      }
      if (!removed) throw new Error('Не нашли элемент в HTML.');

      await saveFile(opts.fileKey, 'admin: remove photo from ' + opts.id + ' gallery');

      // 2) удаляем сам файл
      try {
        await window.GH.deleteFile(item.path, 'admin: delete ' + item.path);
      } catch (e) {
        // не критично, если файла уже нет — но покажем предупреждение
        window.AdminUI.showToast('HTML обновлён, но сам файл не удалось удалить с GitHub: ' + (e.userMessage || e.message), 'warning');
      }
      window.AdminUI.showToast('Сайт обновится через 30–90 секунд.', 'success', 'Фото удалено');
    } finally {
      window.AdminUI.hideLoader();
    }
  }

  // ---------- секция: одиночные фото (масштер, услуги) -----------------

  async function renderSinglesSection(opts) {
    /* opts: { id, title, hint, fileKey, selector, makeLabel } */
    const filedata = await ensureFile(opts.fileKey);
    const items = extractSingleImages(filedata.doc, opts.selector, opts.makeLabel);

    const section = el('section', { class: 'photo-section', 'data-section': opts.id });
    section.appendChild(el('div', { class: 'photo-section__header' }, [
      el('h3', { class: 'photo-section__title', text: opts.title })
    ]));

    const grid = el('div', { class: 'photo-grid' });
    section.appendChild(grid);

    function refresh() {
      const fresh = extractSingleImages(_state[opts.fileKey].doc, opts.selector, opts.makeLabel);
      grid.innerHTML = '';
      fresh.forEach(function (item, i) {
        grid.appendChild(renderSingleCard(item, i, opts, refresh));
      });
    }

    refresh();
    return section;
  }

  function renderSingleCard(item, index, opts, onChanged) {
    const card = el('div', { class: 'photo-card' });

    const thumbWrap = el('div', { class: 'photo-card__thumb' });
    const img = el('img', { src: previewUrl(item.path) + '#' + Date.now(), alt: item.alt || '' });
    img.onerror = function () { img.style.opacity = '0.3'; };
    thumbWrap.appendChild(img);

    const info = el('div', { class: 'photo-card__info' }, [
      el('div', { class: 'photo-card__label', text: item.label })
    ]);

    const replaceLabel = el('label', { class: 'btn btn--secondary', text: 'Заменить' });
    const fileInput = el('input', { type: 'file', accept: 'image/*' });
    fileInput.style.display = 'none';
    replaceLabel.appendChild(fileInput);
    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      onSingleReplace(item, f, opts).then(function () {
        if (onChanged) onChanged();
      }).catch(function (err) {
        window.AdminUI.showToast(err.userMessage || err.message, 'error', 'Ошибка');
      });
      fileInput.value = '';
    });

    const actions = el('div', { class: 'photo-card__actions' }, [replaceLabel]);
    card.appendChild(thumbWrap);
    card.appendChild(info);
    card.appendChild(actions);
    return card;
  }

  async function onSingleReplace(item, file, opts) {
    if (!/^image\//i.test(file.type)) {
      window.AdminUI.showToast('Можно загружать только изображения.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const ok = await window.AdminUI.confirmDialog(
        'Большое фото',
        'Размер ' + Math.round(file.size / 1024 / 1024) + ' МБ. Рекомендуется не больше 2 МБ. Всё равно загрузить?',
        'Загрузить'
      );
      if (!ok) return;
    }

    window.AdminUI.showLoader('Загружаем фото…');
    try {
      // Заменяем файл по тому же пути (overwrite). Расширение оставляем как у оригинала.
      const oldExt = getExt(item.path);
      const newExt = getExt(file.name);
      let targetPath = item.path;
      // Если расширение нового файла отличается — лучше использовать новое имя
      if (oldExt !== newExt) {
        const base = item.path.replace(/\.[a-zA-Z0-9]+$/, '');
        targetPath = base + '.' + newExt;
      }

      await window.GH.putBinaryFile(targetPath, file, 'admin: replace ' + targetPath);

      // Обновляем src в HTML с cache bust — берём свежую версию файла
      const filedata = await ensureFile(opts.fileKey, true);
      const doc = filedata.doc;
      const newSrc = withCacheBust(targetPath);
      const imgs = doc.querySelectorAll(opts.selector);
      let updated = 0;
      imgs.forEach(function (im) {
        if (stripQuery(im.getAttribute('src') || '') === item.path) {
          im.setAttribute('src', newSrc);
          updated++;
        }
      });
      if (updated > 0) {
        await saveFile(opts.fileKey, 'admin: update ' + opts.id + ' photo (' + (item.label || item.path) + ')');
      }

      window.AdminUI.showToast('Сайт обновится через 30–90 секунд.', 'success', 'Фото заменено');
    } finally {
      window.AdminUI.hideLoader();
    }
  }

  // ---------- секция: hero (фон главной, через CSS) ---------------------

  async function renderHeroSection() {
    const HERO_PATH = 'images/hero.jfif';
    const section = el('section', { class: 'photo-section', 'data-section': 'hero' });
    section.appendChild(el('div', { class: 'photo-section__header' }, [
      el('h3', { class: 'photo-section__title', text: 'Фон главной страницы' })
    ]));

    const grid = el('div', { class: 'photo-grid' });
    const card = el('div', { class: 'photo-card' });
    const thumb = el('div', { class: 'photo-card__thumb' });
    const img = el('img', { src: previewUrl(HERO_PATH) + '#' + Date.now(), alt: 'Фон главной' });
    img.onerror = function () { img.style.opacity = '0.3'; };
    thumb.appendChild(img);

    const info = el('div', { class: 'photo-card__info' }, [
      el('div', { class: 'photo-card__label', text: 'Фон главной страницы' })
    ]);

    const replaceLabel = el('label', { class: 'btn btn--secondary', text: 'Заменить' });
    const fileInput = el('input', { type: 'file', accept: 'image/*' });
    fileInput.style.display = 'none';
    replaceLabel.appendChild(fileInput);
    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      onHeroReplace(f, HERO_PATH).catch(function (err) {
        window.AdminUI.showToast(err.userMessage || err.message, 'error', 'Ошибка');
      });
      fileInput.value = '';
    });

    card.appendChild(thumb);
    card.appendChild(info);
    card.appendChild(el('div', { class: 'photo-card__actions' }, [replaceLabel]));
    grid.appendChild(card);
    section.appendChild(grid);
    return section;
  }

  async function onHeroReplace(file, heroPath) {
    if (!/^image\//i.test(file.type)) {
      window.AdminUI.showToast('Можно загружать только изображения.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const ok = await window.AdminUI.confirmDialog(
        'Большое фото',
        'Размер ' + Math.round(file.size / 1024 / 1024) + ' МБ. Для фона рекомендуется не больше 500 КБ–1 МБ. Загрузить как есть?',
        'Загрузить'
      );
      if (!ok) return;
    }

    window.AdminUI.showLoader('Загружаем новый фон…');
    try {
      // Расширение нового файла может отличаться от .jfif. Для простоты
      // если расширение не совпадает — обновляем путь в CSS.
      const oldExt = getExt(heroPath);
      const newExt = getExt(file.name);
      let target = heroPath;
      if (oldExt !== newExt) {
        target = heroPath.replace(/\.[a-zA-Z0-9]+$/, '') + '.' + newExt;
      }

      await window.GH.putBinaryFile(target, file, 'admin: replace hero image');

      // Обновляем style.css: ищем url("../images/hero.jfif?...") и заменяем
      await ensureFile('css', true);
      const cssState = _state.css;
      const ts = Date.now();
      const newUrl = '../' + target + '?v=' + ts;

      // Регулярка: url(... images/hero.* ...). Ищем path после images/ начинающийся с hero.
      const re = /url\(\s*(['"]?)([^'")]*?images\/hero[^'")]*)\1\s*\)/g;
      let replacedCount = 0;
      const newContent = cssState.content.replace(re, function (m, q, _path) {
        replacedCount++;
        const quote = q || '"';
        return 'url(' + quote + newUrl + quote + ')';
      });

      if (replacedCount === 0) {
        window.AdminUI.showToast('Файл загружен, но в CSS ссылка на hero не найдена. Возможно, она задаётся иначе.', 'warning');
      } else {
        cssState.content = newContent;
        await saveFile('css', 'admin: bump hero image cache');
      }

      window.AdminUI.showToast('Сайт обновится через 30–90 секунд.', 'success', 'Фон заменён');
    } finally {
      window.AdminUI.hideLoader();
    }
  }

  // ---------- mount ------------------------------------------------------

  async function mount(container) {
    _state.mountedContainer = container;
    if (_state.initialized) return; // не перерисовывать каждый раз
    _state.initialized = true;
    await renderAll();
  }

  async function renderAll() {
    const container = _state.mountedContainer;
    if (!container) return;
    container.innerHTML = '';

    container.appendChild(el('div', { class: 'tab-header' }, [
      el('h2', { class: 'section__title', text: 'Фото' }),
      el('p', {
        class: 'section__lead',
        text: 'Добавляйте, удаляйте и заменяйте фотографии на сайте. Рекомендуем сжимать снимки до 1–2 МБ перед загрузкой.'
      })
    ]));

    window.AdminUI.showLoader('Загружаем данные сайта…');
    try {
      // Каталог работ
      container.appendChild(await renderGallerySection({
        id: 'works',
        title: 'Каталог работ',
        fileKey: 'services',
        listSelector: '#works-gallery-list',
        folder: 'images/works/',
        altPrefix: 'Работа'
      }));

      // Ламинирование ресниц
      container.appendChild(await renderGallerySection({
        id: 'resni',
        title: 'Ламинирование ресниц',
        fileKey: 'services',
        listSelector: '#resni-gallery-list',
        folder: 'images/resni/',
        altPrefix: 'Ламинирование ресниц'
      }));

      // Фото мастеров
      container.appendChild(await renderSinglesSection({
        id: 'masters',
        title: 'Фото мастеров',
        fileKey: 'index',
        selector: 'img.master-card__img',
        makeLabel: function (img) {
          const card = img.closest('.master-card');
          const name = card && card.querySelector('.master-card__name');
          return (name && name.textContent.trim()) || (img.getAttribute('alt') || 'Мастер');
        }
      }));

      // Фон главной страницы
      container.appendChild(await renderHeroSection());
    } catch (err) {
      container.appendChild(el('div', { class: 'placeholder' }, [
        el('h3', { class: 'placeholder__title', text: 'Не удалось загрузить данные' }),
        el('p', { class: 'placeholder__text', text: err.userMessage || err.message })
      ]));
    } finally {
      window.AdminUI.hideLoader();
    }
  }

  window.PhotosEditor = { mount: mount };
})();
