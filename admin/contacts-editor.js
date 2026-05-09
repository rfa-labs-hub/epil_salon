/**
 * Контакты и ссылки: правка телефона, соцсетей, адресов, ссылки «Записаться онлайн».
 * index.html — блок контактов + кнопка; services.html и reviews.html — только кнопка записи.
 */
(function () {
  'use strict';

  const INDEX = 'index.html';
  const SERVICES = 'services.html';
  const REVIEWS = 'reviews.html';

  let _container = null;
  let _values = {
    instagram: '', telegram: '', phone: '',
    address1: '', address2: '', booking: ''
  };

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }

  function serialize(doc) {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }

  function phoneDisplayToTel(display) {
    const digits = String(display || '').replace(/\D/g, '');
    if (!digits) return 'tel:+';
    let d = digits;
    if (d.charAt(0) === '8') d = '7' + d.slice(1);
    if (d.charAt(0) !== '7') d = '7' + d;
    return 'tel:+' + d;
  }

  function readFromIndexDoc(doc) {
    const ig = doc.querySelector('#contacts a.contacts__social-link[title="Instagram"]');
    const tg = doc.querySelector('#contacts a.contacts__social-link[title="Telegram"]');
    const phone = doc.querySelector('#contacts a.contacts__link[href^="tel:"]');
    const blocks = doc.querySelectorAll('#contacts .contacts__maps > .contacts__map-block');
    const addr0 = blocks[0] && blocks[0].querySelector('.contacts__map-address');
    const addr1 = blocks[1] && blocks[1].querySelector('.contacts__map-address');
    const cta = doc.querySelector('a.cta-book');
    return {
      instagram: ig ? ig.getAttribute('href') || '' : '',
      telegram: tg ? tg.getAttribute('href') || '' : '',
      phone: phone ? phone.textContent.trim() : '',
      address1: addr0 ? addr0.textContent.trim() : '',
      address2: addr1 ? addr1.textContent.trim() : '',
      booking: cta ? cta.getAttribute('href') || '' : ''
    };
  }

  function applyInstagram(doc, url) {
    const a = doc.querySelector('#contacts a.contacts__social-link[title="Instagram"]');
    if (a) a.setAttribute('href', url.trim());
  }
  function applyTelegram(doc, url) {
    const a = doc.querySelector('#contacts a.contacts__social-link[title="Telegram"]');
    if (a) a.setAttribute('href', url.trim());
  }
  function applyPhone(doc, display) {
    const a = doc.querySelector('#contacts a.contacts__link[href^="tel:"]');
    if (!a) return;
    const t = display.trim();
    a.textContent = t;
    a.setAttribute('href', phoneDisplayToTel(t));
    a.setAttribute('aria-label', 'Позвонить ' + t);
  }
  function applyAddress(doc, index, text) {
    const blocks = doc.querySelectorAll('#contacts .contacts__maps > .contacts__map-block');
    const block = blocks[index];
    if (!block) return;
    const p = block.querySelector('.contacts__map-address');
    const t = text.trim();
    if (p) p.textContent = t;
    const iframe = block.querySelector('iframe.contacts__map');
    if (iframe) iframe.setAttribute('title', 'Студия эпиляции на карте — ' + t);
  }
  function applyBooking(doc, url) {
    const a = doc.querySelector('a.cta-book');
    if (a) a.setAttribute('href', url.trim());
  }

  const FIELD_META = [
    { id: 'instagram', label: 'Instagram', kind: 'url', applyIndex: applyInstagram, commit: 'instagram' },
    { id: 'telegram', label: 'Telegram', kind: 'url', applyIndex: applyTelegram, commit: 'telegram' },
    { id: 'phone', label: 'Телефон', kind: 'text', applyIndex: applyPhone, commit: 'phone' },
    { id: 'address1', label: 'Адрес 1', kind: 'text', applyIndex: function (d, v) { applyAddress(d, 0, v); }, commit: 'address1' },
    { id: 'address2', label: 'Адрес 2', kind: 'text', applyIndex: function (d, v) { applyAddress(d, 1, v); }, commit: 'address2' },
    { id: 'booking', label: 'Записаться онлайн', kind: 'url', applyIndex: applyBooking, applyAll: true, commit: 'booking' }
  ];

  async function loadIndexValues() {
    const data = await window.GH.getTextFile(INDEX, { force: true });
    const doc = new DOMParser().parseFromString(data.content, 'text/html');
    _values = readFromIndexDoc(doc);
    return _values;
  }

  async function saveField(fieldId, newValue) {
    const meta = FIELD_META.find(function (m) { return m.id === fieldId; });
    if (!meta) return;
    if (!window.GH.getToken()) {
      window.AdminUI.showToast('Подключите ключ GitHub в настройках.', 'error');
      return;
    }

    window.AdminUI.showLoader('Сохраняем изменения…');
    try {
      if (meta.applyAll) {
        const paths = [INDEX, SERVICES, REVIEWS];
        for (let i = 0; i < paths.length; i++) {
          const path = paths[i];
          const file = await window.GH.getTextFile(path, { force: true });
          const doc = new DOMParser().parseFromString(file.content, 'text/html');
          applyBooking(doc, newValue);
          await window.GH.putTextFile(path, serialize(doc), 'admin: update booking link');
        }
        _values.booking = newValue.trim();
      } else {
        const file = await window.GH.getTextFile(INDEX, { force: true });
        const doc = new DOMParser().parseFromString(file.content, 'text/html');
        meta.applyIndex(doc, newValue);
        await window.GH.putTextFile(INDEX, serialize(doc), 'admin: update contacts (' + meta.commit + ')');
        _values[fieldId] = newValue.trim();
      }
      window.AdminUI.showToast('Сайт обновится через 30–90 секунд.', 'success', 'Сохранено');
    } catch (err) {
      window.AdminUI.showToast(err.userMessage || err.message || 'Ошибка сохранения.', 'error');
    } finally {
      window.AdminUI.hideLoader();
    }
  }

  function renderRow(meta) {
    const wrap = el('div', { class: 'contact-row', 'data-field': meta.id });
    const label = el('span', { class: 'contact-row__label', text: meta.label + ':' });
    const valueWrap = el('div', { class: 'contact-row__main' });
    const display = el('span', { class: 'contact-row__value', text: _values[meta.id] || '—' });
    const input = el('input', {
      class: 'field__input contact-row__input',
      type: meta.kind === 'url' ? 'url' : 'text',
      value: _values[meta.id] || '',
      hidden: true
    });
    const btnEdit = el('button', { type: 'button', class: 'btn btn--secondary btn--small', text: 'Изменить' });
    const btnSave = el('button', { type: 'button', class: 'btn btn--primary btn--small', text: 'Сохранить', hidden: true });
    const btnCancel = el('button', { type: 'button', class: 'btn btn--ghost btn--small', text: 'Отмена', hidden: true });

    function setViewMode() {
      display.hidden = false;
      input.hidden = true;
      btnEdit.hidden = false;
      btnSave.hidden = true;
      btnCancel.hidden = true;
      display.textContent = _values[meta.id] || '—';
      input.value = _values[meta.id] || '';
    }
    function setEditMode() {
      display.hidden = true;
      input.hidden = false;
      btnEdit.hidden = true;
      btnSave.hidden = false;
      btnCancel.hidden = false;
      input.value = _values[meta.id] || '';
      input.focus();
      input.select();
    }

    btnEdit.addEventListener('click', setEditMode);
    btnCancel.addEventListener('click', setViewMode);
    btnSave.addEventListener('click', async function () {
      const v = (input.value || '').trim();
      if (!v) {
        window.AdminUI.showToast('Значение не может быть пустым.', 'warning');
        return;
      }
      await saveField(meta.id, v);
      setViewMode();
    });

    valueWrap.appendChild(display);
    valueWrap.appendChild(input);
    const actions = el('div', { class: 'contact-row__actions' });
    actions.appendChild(btnEdit);
    actions.appendChild(btnSave);
    actions.appendChild(btnCancel);

    wrap.appendChild(label);
    wrap.appendChild(valueWrap);
    wrap.appendChild(actions);
    return wrap;
  }

  async function render(container) {
    _container = container;
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'tab-header' }, [
      el('h2', { class: 'section__title', text: 'Контакты и ссылки' }),
      el('p', {
        class: 'section__lead',
        text: 'Нажмите «Изменить» у нужной строки, отредактируйте и нажмите «Сохранить». Каждое поле сохраняется отдельно.'
      })
    ]));

    window.AdminUI.showLoader('Загружаем данные…');
    try {
      await loadIndexValues();
    } catch (err) {
      container.appendChild(el('div', { class: 'placeholder' }, [
        el('h3', { class: 'placeholder__title', text: 'Не удалось загрузить контакты' }),
        el('p', { class: 'placeholder__text', text: err.userMessage || err.message })
      ]));
      return;
    } finally {
      window.AdminUI.hideLoader();
    }

    const list = el('div', { class: 'contact-rows' });
    FIELD_META.forEach(function (meta) {
      list.appendChild(renderRow(meta));
    });
    container.appendChild(list);
  }

  function mount(container) {
    render(container);
  }

  window.ContactsEditor = { mount: mount };
})();
