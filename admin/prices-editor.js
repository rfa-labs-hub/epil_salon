/**
 * Редактор цен.
 *
 * Источник данных: services.html. В нём ~13 таблиц <table class="service-content__table">.
 * Многие таблицы дублируются (внутри карточки услуги + на общей вкладке «Цены»).
 * Дубликаты определяем по aria-label и при сохранении синхронно обновляем все копии.
 *
 * Зависимости: window.GH, window.AdminUI.
 */
(function () {
  'use strict';

  const FILE = 'services.html';

  // Кастомные ярлыки для известных aria-label, чтобы заголовки в админке
  // были более понятными (с категорией услуги).
  const KNOWN_LABELS = {
    'Цены на шугаринг': { category: 'Шугаринг', title: 'Цены на шугаринг' },
    'Цены на шугаринг комплекс': { category: 'Шугаринг', title: 'Комплексы (сеты)' },
    'Цены на шугаринг бикини': { category: 'Шугаринг бикини', title: 'Цены' },
    'Цены на полимерную эпиляцию': { category: 'Полимерная эпиляция', title: 'Цены' },
    'Восковая эпиляция для девушек': { category: 'Восковая эпиляция', title: 'Для девушек' },
    'Восковая эпиляция для мужчин': { category: 'Восковая эпиляция', title: 'Для мужчин' },
    'Цены на эпиляцию подмышек': { category: 'Эпиляция подмышек', title: 'Цены' },
    'Цены на эпиляцию лица': { category: 'Эпиляция лица', title: 'Цены' },
    'Цены на эпиляцию ног': { category: 'Эпиляция ног', title: 'Цены' },
    'Цены на эпиляцию рук': { category: 'Эпиляция рук', title: 'Цены' },
    'Цены на электроэпиляцию': { category: 'Электроэпиляция', title: 'Цены' },
    'Цены на ламинирование ресниц': { category: 'Ламинирование ресниц', title: 'Цены' }
  };

  let _doc = null;          // распарсенный DOM документа services.html
  let _editors = [];        // массив редакторов: [{ aria, title, category, columns, rows, originalRows, dirty, el }]
  let _container = null;
  let _mounted = false;

  // ---------- HTML utility -----------------------------------------------

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('data-') === 0 || k === 'role' || k === 'type' || k === 'placeholder' || k === 'value' || k === 'aria-label' || k === 'title' || k === 'href' || k === 'target' || k === 'rel') {
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

  // ---------- Парсинг ----------------------------------------------------

  /**
   * Найти заголовок для таблицы. Поднимаемся по previousElementSibling
   * родителя (в нашем разметке таблица обёрнута в .service-content__table-wrap).
   * Ищем h3.service-content__table-title (короткий заголовок) и h2.service-content__title
   * (заголовок секции). Если есть оба — используем как title + sub.
   */
  function findHeadings(table) {
    let h3Title = null;
    let h2Title = null;

    let cursor = table.parentElement; // table-wrap
    if (!cursor) return { h2: null, h3: null };

    // ищем предыдущие h2/h3 внутри той же .container или секции
    let probe = cursor.previousElementSibling;
    while (probe) {
      if (!h3Title && probe.tagName === 'H3' && probe.classList.contains('service-content__table-title')) {
        h3Title = probe.textContent.trim();
      }
      if (probe.tagName === 'H2' && probe.classList.contains('service-content__title')) {
        h2Title = probe.textContent.trim();
        break;
      }
      probe = probe.previousElementSibling;
    }

    // если h2 не нашли в том же контейнере — попробуем подняться к секции
    if (!h2Title) {
      let p = cursor.parentElement;
      while (p) {
        const found = p.querySelector('h2.service-content__title, h2.services-panel__title');
        if (found) { h2Title = found.textContent.trim(); break; }
        p = p.parentElement;
      }
    }

    return { h2: h2Title, h3: h3Title };
  }

  /**
   * Извлечь строки из таблицы как массив массивов строк (textContent ячеек).
   * <br> внутри ячейки превращается в "/" чтобы выглядело компактно (это
   * соответствует случаю "600/<br>700 р.").
   */
  function extractRows(table) {
    const trs = table.querySelectorAll('tbody > tr');
    const rows = [];
    trs.forEach(function (tr) {
      const cells = [];
      tr.querySelectorAll('td').forEach(function (td) {
        // Заменяем <br> на " / " чтобы значения не слиплись и не пропали
        const html = td.innerHTML.replace(/<br\s*\/?\s*>/gi, ' / ');
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        cells.push(tmp.textContent.replace(/\s+/g, ' ').trim());
      });
      if (cells.length) rows.push(cells);
    });
    return rows;
  }

  function detectColumnCount(table) {
    const firstRow = table.querySelector('tbody > tr');
    if (!firstRow) {
      // если таблица пустая — судим по классу
      return table.classList.contains('service-content__table--two-cols') ? 2 : 3;
    }
    return Math.max(2, Math.min(3, firstRow.querySelectorAll('td').length));
  }

  /**
   * Парсим services.html — собираем уникальные редакторы по aria-label.
   * Сохраняем массив самих DOM-таблиц (для последующего записи).
   */
  function buildEditors(doc) {
    const tables = Array.from(doc.querySelectorAll('table.service-content__table'));
    const groups = {}; // aria -> { aria, headings, columns, rows, tables[] }

    tables.forEach(function (t) {
      const aria = (t.getAttribute('aria-label') || '').trim();
      if (!aria) return;

      const headings = findHeadings(t);
      const columns = detectColumnCount(t);

      if (!groups[aria]) {
        groups[aria] = {
          aria: aria,
          headings: headings,
          columns: columns,
          rows: extractRows(t),
          tables: [t]
        };
      } else {
        groups[aria].tables.push(t);
        // если у каноничной группы нет h3, а у этой есть — берём
        if (!groups[aria].headings.h3 && headings.h3) {
          groups[aria].headings.h3 = headings.h3;
        }
      }
    });

    return Object.keys(groups).map(function (aria) {
      const g = groups[aria];
      const known = KNOWN_LABELS[aria];
      const category = known ? known.category : (g.headings.h2 || aria);
      const title = known ? known.title : (g.headings.h3 || g.headings.h2 || aria);
      return {
        aria: aria,
        category: category,
        title: title,
        columns: g.columns,
        rows: g.rows.map(function (r) { return r.slice(); }),
        originalRows: g.rows.map(function (r) { return r.slice(); }),
        copies: g.tables.length,
        dirty: false,
        el: null
      };
    });
  }

  // ---------- Сериализация и запись --------------------------------------

  function rowsEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const ra = a[i], rb = b[i];
      if (ra.length !== rb.length) return false;
      for (let j = 0; j < ra.length; j++) if (ra[j] !== rb[j]) return false;
    }
    return true;
  }

  function refreshDirty(editor) {
    const wasDirty = editor.dirty;
    editor.dirty = !rowsEqual(editor.rows, editor.originalRows);
    if (editor.el) {
      editor.el.classList.toggle('editor-card--dirty', editor.dirty);
    }
    if (wasDirty !== editor.dirty) updateGlobalActions();
  }

  /**
   * Применить строки редактора ко всем таблицам с тем же aria-label.
   */
  function writeEditorToDoc(editor, doc) {
    const tables = doc.querySelectorAll('table.service-content__table[aria-label="' + editor.aria.replace(/"/g, '\\"') + '"]');
    tables.forEach(function (table) {
      let tbody = table.querySelector('tbody');
      if (!tbody) {
        tbody = doc.createElement('tbody');
        table.appendChild(tbody);
      }
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

      editor.rows.forEach(function (cells) {
        const tr = doc.createElement('tr');
        cells.forEach(function (text) {
          const td = doc.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    });
  }

  /**
   * Сериализовать документ обратно в HTML с DOCTYPE.
   */
  function serialize(doc) {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  // ---------- Рендер UI --------------------------------------------------

  function renderHeader() {
    const wrap = el('div', { class: 'tab-header' }, [
      el('h2', { class: 'section__title', text: 'Цены и услуги' }),
      el('p', {
        class: 'section__lead',
        text: 'Меняйте названия услуг и стоимость. Если одна и та же таблица показывается в нескольких местах сайта (на странице услуги и на общей вкладке «Цены»), она обновится синхронно.'
      })
    ]);
    return wrap;
  }

  function renderEditorCard(editor, idx) {
    const card = el('div', { class: 'editor-card', 'data-open': idx === 0 ? 'true' : 'false' });
    editor.el = card;

    // Подбираем человекочитаемый заголовок: если есть отдельная подкатегория
    // (например, «Комплексы (сеты)» под «Шугаринг») — показываем её, иначе категорию
    const headingText = (editor.title && editor.title !== editor.category)
      ? editor.category + ' — ' + editor.title
      : editor.category;
    const titleNode = el('div', { class: 'editor-card__title' }, [
      document.createTextNode(headingText)
    ]);

    const dirtyBadge = el('span', { class: 'editor-card__dirty-badge', text: 'есть изменения' });

    const header = el('div', { class: 'editor-card__header' }, [
      titleNode,
      el('div', { class: 'editor-card__header-right' }, [
        dirtyBadge,
        el('span', { class: 'editor-card__toggle', html: '▾' })
      ])
    ]);
    header.addEventListener('click', function () {
      const open = card.getAttribute('data-open') === 'true';
      card.setAttribute('data-open', open ? 'false' : 'true');
    });
    card.appendChild(header);

    const body = el('div', { class: 'editor-card__body' });
    const rowsWrap = el('div', { class: 'price-rows' });
    body.appendChild(rowsWrap);

    function renderRow(rowIdx) {
      const cells = editor.rows[rowIdx];
      const row = el('div', { class: 'price-row price-row--cols-' + editor.columns });
      // Поля: 2 cols => name + price; 3 cols => name + time + price
      const placeholders = editor.columns === 3
        ? ['Услуга', 'Время', 'Цена']
        : ['Услуга', 'Цена'];

      placeholders.forEach(function (ph, i) {
        const inp = el('input', {
          type: 'text',
          value: cells[i] != null ? cells[i] : '',
          placeholder: ph,
          'aria-label': ph
        });
        inp.addEventListener('input', function () {
          while (cells.length <= i) cells.push('');
          cells[i] = inp.value;
          refreshDirty(editor);
        });
        row.appendChild(inp);
      });

      const remove = el('button', {
        type: 'button',
        class: 'price-row__remove',
        title: 'Удалить строку',
        'aria-label': 'Удалить строку',
        text: '×'
      });
      remove.addEventListener('click', function () {
        const idxNow = Array.prototype.indexOf.call(rowsWrap.children, row);
        if (idxNow === -1) return;
        editor.rows.splice(idxNow, 1);
        rowsWrap.removeChild(row);
        refreshDirty(editor);
      });
      row.appendChild(remove);

      return row;
    }

    editor.rows.forEach(function (_, i) {
      rowsWrap.appendChild(renderRow(i));
    });

    const addBtn = el('button', {
      type: 'button',
      class: 'btn btn--secondary btn--small',
      text: '+ Добавить строку'
    });
    addBtn.addEventListener('click', function () {
      const newCells = new Array(editor.columns).fill('');
      editor.rows.push(newCells);
      rowsWrap.appendChild(renderRow(editor.rows.length - 1));
      refreshDirty(editor);
    });

    const revertBtn = el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--small',
      text: 'Отменить изменения'
    });
    revertBtn.addEventListener('click', function () {
      editor.rows = editor.originalRows.map(function (r) { return r.slice(); });
      // re-render rowsWrap
      while (rowsWrap.firstChild) rowsWrap.removeChild(rowsWrap.firstChild);
      editor.rows.forEach(function (_, i) { rowsWrap.appendChild(renderRow(i)); });
      refreshDirty(editor);
    });

    const actions = el('div', { class: 'editor-actions' }, [
      el('div', { class: 'editor-actions__group' }, [addBtn]),
      el('div', { class: 'editor-actions__group' }, [revertBtn])
    ]);
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function renderGlobalActions() {
    const wrap = el('div', { class: 'global-actions', id: 'prices-global-actions' });

    const info = el('span', { class: 'global-actions__info', id: 'prices-dirty-info', text: 'Нет изменений' });
    const saveBtn = el('button', {
      type: 'button',
      class: 'btn btn--primary',
      id: 'prices-save-btn',
      text: 'Сохранить изменения'
    });
    saveBtn.disabled = true;
    saveBtn.addEventListener('click', saveAll);

    const reloadBtn = el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--small',
      title: 'Перезагрузить данные с GitHub',
      text: 'Обновить с сервера'
    });
    reloadBtn.addEventListener('click', function () { reload(true); });

    wrap.appendChild(info);
    wrap.appendChild(reloadBtn);
    wrap.appendChild(saveBtn);
    return wrap;
  }

  function updateGlobalActions() {
    const dirtyCount = _editors.filter(function (e) { return e.dirty; }).length;
    const info = document.getElementById('prices-dirty-info');
    const btn = document.getElementById('prices-save-btn');
    if (info) {
      info.textContent = dirtyCount === 0
        ? 'Нет изменений'
        : 'Изменено: ' + dirtyCount + ' ' + plural(dirtyCount, ['таблица', 'таблицы', 'таблиц']);
    }
    if (btn) btn.disabled = dirtyCount === 0;
  }

  function plural(n, forms) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  function renderEditors() {
    if (!_container) return;
    _container.innerHTML = '';
    _container.appendChild(renderHeader());
    _container.appendChild(renderGlobalActions());

    if (!_editors.length) {
      _container.appendChild(el('div', { class: 'placeholder' }, [
        el('h3', { class: 'placeholder__title', text: 'Нет таблиц' }),
        el('p', { class: 'placeholder__text', text: 'Не удалось найти таблицы цен в файле services.html.' })
      ]));
      return;
    }

    // Группируем по category, чтобы UI был структурирован
    const byCategory = {};
    _editors.forEach(function (ed) {
      if (!byCategory[ed.category]) byCategory[ed.category] = [];
      byCategory[ed.category].push(ed);
    });

    Object.keys(byCategory).forEach(function (cat) {
      const list = byCategory[cat];
      list.forEach(function (ed, i) {
        const card = renderEditorCard(ed, _editors.indexOf(ed));
        _container.appendChild(card);
      });
    });

    updateGlobalActions();
  }

  // ---------- Загрузка / сохранение --------------------------------------

  async function reload(force) {
    window.AdminUI.showLoader('Загружаем данные сайта…');
    try {
      const file = await window.GH.getTextFile(FILE, { force: !!force });
      _doc = new DOMParser().parseFromString(file.content, 'text/html');
      _editors = buildEditors(_doc);
      renderEditors();
    } catch (err) {
      _container.innerHTML = '';
      _container.appendChild(el('div', { class: 'placeholder' }, [
        el('h3', { class: 'placeholder__title', text: 'Не удалось загрузить данные' }),
        el('p', { class: 'placeholder__text', text: err.userMessage || err.message })
      ]));
    } finally {
      window.AdminUI.hideLoader();
    }
  }

  async function saveAll() {
    const dirtyEditors = _editors.filter(function (e) { return e.dirty; });
    if (!dirtyEditors.length) return true;

    window.AdminUI.showLoader('Сохраняем изменения…');
    try {
      // Берём свежий services.html — на случай если фото-редактор успел изменить файл
      const file = await window.GH.getTextFile(FILE, { force: true });
      const freshDoc = new DOMParser().parseFromString(file.content, 'text/html');

      // Применяем строки из dirty-редакторов ко всем таблицам с тем же aria-label
      dirtyEditors.forEach(function (ed) { writeEditorToDoc(ed, freshDoc); });
      _doc = freshDoc; // привязываем актуальный doc

      const html = serialize(freshDoc);
      const labels = dirtyEditors.map(function (e) { return e.aria; });
      const message = 'admin: update prices (' + labels.slice(0, 3).join(', ') + (labels.length > 3 ? ', …' : '') + ')';

      await window.GH.putTextFile(FILE, html, message);

      dirtyEditors.forEach(function (ed) {
        ed.originalRows = ed.rows.map(function (r) { return r.slice(); });
        ed.dirty = false;
        if (ed.el) ed.el.classList.remove('editor-card--dirty');
      });
      updateGlobalActions();
      window.AdminUI.showToast('Сайт обновится через 30–90 секунд.', 'success', 'Изменения сохранены!');
      return true;
    } catch (err) {
      window.AdminUI.showToast(err.userMessage || err.message || 'Ошибка сохранения.', 'error', 'Не удалось сохранить');
      if (/sha|409|422|conflict/i.test(err.message || '')) {
        await reload(true);
      }
      return false;
    } finally {
      window.AdminUI.hideLoader();
    }
  }

  // ---------- Public API -------------------------------------------------

  function mount(container) {
    _container = container;
    if (_mounted) return;
    _mounted = true;
    reload(false);
  }

  window.PricesEditor = {
    mount: mount,
    hasUnsavedChanges: function () {
      return _editors.some(function (e) { return e.dirty; });
    },
    saveAll: saveAll,
    discardAll: function () {
      return reload(true);
    }
  };
})();
