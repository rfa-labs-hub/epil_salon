/**
 * Главный модуль админки: авторизация, маршрутизация по вкладкам,
 * утилиты UI (toast, loader, confirm).
 *
 * Пароль: хранится в репозитории (admin/config.json) как SHA-256,
 * одинаковый на всех устройствах. Смена — через GitHub API.
 *
 * Зависит от: github.js (window.GH), prices-editor.js (window.PricesEditor),
 *             photos-editor.js (window.PhotosEditor)
 */
(function () {
  'use strict';

  const CONFIG_PATH = 'admin/config.json';
  const SESSION_AUTH_KEY = 'epilsalon_admin_authed_v1';

  /** Хеш пароля по умолчанию «00000000» (SHA-256, hex). Если config.json недоступен — используется он. */
  const DEFAULT_PASSWORD_HASH = '7e071fd9b023ed8f18458a73613a0834f6220bd5cc50357ba3493c6040a9ea8c';

  const $ = function (id) { return document.getElementById(id); };

  /**
   * SHA-256 строки в нижний регистр hex (как в config.json).
   */
  async function sha256Hex(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    const arr = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < arr.length; i++) {
      hex += arr[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /**
   * Хеш пароля с опубликованного config.json (без токена GitHub).
   */
  async function fetchPublicPasswordHash() {
    const url = new URL('config.json', window.location.href);
    url.searchParams.set('t', String(Date.now()));
    let response;
    try {
      response = await fetch(url.toString(), { cache: 'no-store' });
    } catch (e) {
      return DEFAULT_PASSWORD_HASH;
    }
    if (!response.ok) return DEFAULT_PASSWORD_HASH;
    try {
      const data = await response.json();
      const h = data && data.password_sha256;
      if (typeof h !== 'string' || !/^[a-f0-9]{64}$/i.test(h)) return DEFAULT_PASSWORD_HASH;
      return h.toLowerCase();
    } catch (e) {
      return DEFAULT_PASSWORD_HASH;
    }
  }

  // ----- UI utils ---------------------------------------------------------

  function showToast(text, kind, title) {
    const wrap = $('toasts');
    if (!wrap) return;
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' toast--' + kind : '');
    if (title) {
      const h = document.createElement('p');
      h.className = 'toast__title';
      h.textContent = title;
      t.appendChild(h);
    }
    const p = document.createElement('p');
    p.className = 'toast__text';
    p.textContent = text;
    t.appendChild(p);
    wrap.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      t.style.transition = 'opacity 0.25s, transform 0.25s';
      setTimeout(function () { t.remove(); }, 300);
    }, kind === 'error' ? 6000 : 4000);
  }

  function showLoader(text) {
    const l = $('loader');
    const t = $('loader-text');
    if (t) t.textContent = text || 'Загрузка…';
    if (l) l.hidden = false;
  }

  function hideLoader() {
    const l = $('loader');
    if (l) l.hidden = true;
  }

  function confirmDialog(title, text, okText) {
    return new Promise(function (resolve) {
      const dlg = $('confirm-dialog');
      const tEl = $('confirm-title');
      const txEl = $('confirm-text');
      const ok = $('confirm-ok');
      const cancel = $('confirm-cancel');
      if (!dlg || !tEl || !txEl || !ok || !cancel) {
        resolve(window.confirm(text || title));
        return;
      }
      tEl.textContent = title || 'Подтверждение';
      txEl.textContent = text || '';
      ok.textContent = okText || 'Удалить';
      dlg.hidden = false;

      function cleanup() {
        dlg.hidden = true;
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        dlg.querySelector('.dialog__backdrop').removeEventListener('click', onCancel);
      }
      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      dlg.querySelector('.dialog__backdrop').addEventListener('click', onCancel);
    });
  }

  // ----- Маршрутизация экранов и вкладок ---------------------------------

  const SCREENS = ['screen-login', 'screen-setup', 'screen-app'];
  function showScreen(id) {
    SCREENS.forEach(function (s) {
      const el = $(s);
      if (el) el.hidden = s !== id;
    });
  }

  const TABS = ['prices', 'photos', 'settings'];
  function showTab(name) {
    if (TABS.indexOf(name) === -1) name = 'prices';
    TABS.forEach(function (t) {
      const tab = document.querySelector('.app__tab[data-tab="' + t + '"]');
      const content = $('tab-' + t);
      if (tab) tab.setAttribute('aria-selected', t === name ? 'true' : 'false');
      if (content) content.hidden = t !== name;
    });
    if (name === 'prices' && window.PricesEditor) window.PricesEditor.mount($('tab-prices'));
    if (name === 'photos' && window.PhotosEditor) window.PhotosEditor.mount($('tab-photos'));
  }

  // ----- Авторизация ------------------------------------------------------

  function isAuthed() {
    return sessionStorage.getItem(SESSION_AUTH_KEY) === '1';
  }
  function setAuthed(v) {
    if (v) sessionStorage.setItem(SESSION_AUTH_KEY, '1');
    else sessionStorage.removeItem(SESSION_AUTH_KEY);
  }

  function bindLogin() {
    const form = $('login-form');
    const input = $('login-password');
    const errEl = $('login-error');
    const submitBtn = form && form.querySelector('button[type="submit"]');
    if (!form || !input) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const v = (input.value || '').trim();
      if (errEl) errEl.hidden = true;
      if (submitBtn) submitBtn.disabled = true;
      showLoader('Проверяем пароль…');
      try {
        const expected = await fetchPublicPasswordHash();
        const got = await sha256Hex(v);
        if (got === expected) {
          setAuthed(true);
          input.value = '';
          await bootstrap();
        } else {
          if (errEl) errEl.hidden = false;
          input.focus();
          input.select();
        }
      } catch (err) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = 'Не удалось проверить пароль. Проверьте интернет и обновите страницу.';
        }
      } finally {
        hideLoader();
        if (submitBtn) submitBtn.disabled = false;
      }
    });
    input.focus();
  }

  // ----- Setup (ввод GitHub токена) --------------------------------------

  function bindSetup() {
    const form = $('setup-form');
    const input = $('setup-token');
    const toggle = $('setup-token-toggle');
    const submit = $('setup-submit');
    const errEl = $('setup-error');
    if (!form || !input) return;

    if (toggle) {
      toggle.addEventListener('click', function () {
        if (input.type === 'password') {
          input.type = 'text';
          toggle.textContent = 'скрыть';
        } else {
          input.type = 'password';
          toggle.textContent = 'показать';
        }
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const token = (input.value || '').trim();
      if (!token) return;
      submit.disabled = true;
      const oldText = submit.textContent;
      submit.textContent = 'Проверяем…';
      if (errEl) errEl.hidden = true;

      window.GH.setToken(token);
      try {
        await window.GH.verifyToken();
        showToast('Подключение к GitHub успешно.', 'success', 'Готово!');
        input.value = '';
        showScreen('screen-app');
        showTab('prices');
      } catch (err) {
        window.GH.clearToken();
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = err.userMessage || err.message || 'Не удалось подключиться.';
        }
      } finally {
        submit.disabled = false;
        submit.textContent = oldText;
      }
    });
  }

  // ----- Settings ---------------------------------------------------------

  function bindSettings() {
    const replace = $('settings-replace-token');
    const clear = $('settings-clear-token');
    const info = $('settings-token-info');
    const logout = $('logout-btn');

    function refreshInfo() {
      if (!info) return;
      const has = !!window.GH.getToken();
      info.textContent = has
        ? 'Ключ сохранён в этом браузере. Если устройство пропадёт или вы захотите перенастроить — удалите ключ.'
        : 'Ключ не задан. Войдите заново, чтобы добавить ключ.';
    }
    refreshInfo();

    if (replace) {
      replace.addEventListener('click', function () {
        window.GH.clearCache();
        showScreen('screen-setup');
      });
    }
    if (clear) {
      clear.addEventListener('click', async function () {
        const ok = await confirmDialog(
          'Удалить ключ?',
          'Ключ доступа GitHub будет удалён из этого браузера. Чтобы продолжить пользоваться админкой, его нужно будет ввести снова.',
          'Удалить'
        );
        if (!ok) return;
        window.GH.clearToken();
        window.GH.clearCache();
        setAuthed(false);
        refreshInfo();
        showToast('Ключ удалён.', 'success');
        showScreen('screen-login');
      });
    }
    if (logout) {
      logout.addEventListener('click', function () {
        setAuthed(false);
        showScreen('screen-login');
        const inp = $('login-password');
        if (inp) { inp.value = ''; inp.focus(); }
      });
    }

    bindPasswordForm();
  }

  function bindPasswordForm() {
    const form = $('password-form');
    const cur = $('pwd-current');
    const nw = $('pwd-new');
    const repeat = $('pwd-new-repeat');
    const errEl = $('pwd-error');
    const submitBtn = form && form.querySelector('button[type="submit"]');
    if (!form || !cur || !nw || !repeat) return;

    function showErr(msg) {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.hidden = false;
    }
    function hideErr() { if (errEl) errEl.hidden = true; }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideErr();

      if (!window.GH.getToken()) {
        showErr('Сначала подключите ключ GitHub в блоке выше — без него нельзя сохранить новый пароль на сайт.');
        return;
      }

      const curVal = (cur.value || '').trim();
      const newVal = (nw.value || '').trim();
      const repeatVal = (repeat.value || '').trim();

      if (newVal.length < 4) {
        showErr('Новый пароль должен быть не короче 4 символов.');
        nw.focus();
        return;
      }
      if (newVal !== repeatVal) {
        showErr('Новый пароль и повтор не совпадают.');
        repeat.focus();
        repeat.select();
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      showLoader('Сохраняем новый пароль…');
      try {
        const curHash = await sha256Hex(curVal);
        const file = await window.GH.getTextFile(CONFIG_PATH, { force: true });
        let cfg;
        try {
          cfg = JSON.parse(file.content);
        } catch (parseErr) {
          throw new Error('Файл настроек повреждён. Обратитесь к разработчику.');
        }
        const stored = String(cfg.password_sha256 || '').toLowerCase();
        if (stored !== curHash) {
          showErr('Текущий пароль введён неверно.');
          cur.focus();
          cur.select();
          return;
        }

        const newHash = await sha256Hex(newVal);
        if (newHash === stored) {
          showErr('Новый пароль совпадает с текущим. Придумайте другой.');
          nw.focus();
          nw.select();
          return;
        }

        cfg.password_sha256 = newHash;
        const newContent = JSON.stringify(cfg, null, 2) + '\n';
        await window.GH.putTextFile(CONFIG_PATH, newContent, 'admin: change panel password');

        cur.value = '';
        nw.value = '';
        repeat.value = '';
        showToast('Теперь этот пароль подходит на любом устройстве. Подождите до минуты, пока сайт обновится.', 'success', 'Пароль изменён');
      } catch (err) {
        showErr(err.userMessage || err.message || 'Не удалось сохранить пароль.');
      } finally {
        hideLoader();
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function bindTabs() {
    document.querySelectorAll('.app__tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        const name = tab.getAttribute('data-tab');
        if (name) showTab(name);
      });
    });
  }

  // ----- Bootstrap --------------------------------------------------------

  async function bootstrap() {
    if (!isAuthed()) {
      showScreen('screen-login');
      return;
    }
    if (!window.GH.getToken()) {
      showScreen('screen-setup');
      const inp = $('setup-token');
      if (inp) inp.focus();
      return;
    }
    showScreen('screen-app');
    showTab('prices');
  }

  window.AdminUI = {
    showToast: showToast,
    showLoader: showLoader,
    hideLoader: hideLoader,
    confirmDialog: confirmDialog
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindLogin();
    bindSetup();
    bindSettings();
    bindTabs();
    bootstrap();
  });
})();
