/**
 * GitHub Contents API — клиент для работы с репозиторием
 *
 * Архитектура:
 *  - file cache: храним sha и текущее содержимое в памяти, чтобы не качать
 *    файл при каждом маленьком изменении
 *  - все мутации через PUT /repos/{owner}/{repo}/contents/{path}
 *  - удаление через DELETE
 *  - бинарные файлы (фото) загружаются через тот же PUT с base64
 */
(function () {
  'use strict';

  const REPO_OWNER = 'rfa-labs-hub';
  const REPO_NAME = 'epil_salon';
  const REPO_BRANCH = 'main';
  const API_BASE = 'https://api.github.com';

  const TOKEN_STORAGE_KEY = 'epilsalon_admin_gh_token_v1';

  // Кэш файлов: { 'services.html': { content: string, sha: string } }
  const fileCache = {};

  function getToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  }
  function setToken(token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  function clearCache() {
    Object.keys(fileCache).forEach(function (k) { delete fileCache[k]; });
  }

  function authHeaders() {
    return {
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  /**
   * Превратить произвольную строку в base64 с поддержкой UTF-8.
   */
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToUtf8(b64) {
    const clean = b64.replace(/\s/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * Файл -> base64 (без data URI префикса).
   */
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Не удалось прочитать файл'));
          return;
        }
        const idx = result.indexOf(',');
        resolve(idx !== -1 ? result.slice(idx + 1) : result);
      };
      reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
      reader.readAsDataURL(file);
    });
  }

  function contentsUrl(path) {
    const safePath = path.split('/').map(encodeURIComponent).join('/');
    return API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + safePath;
  }

  /**
   * Делает GET запрос к API. Возвращает { json, ok, status, message }.
   */
  async function apiFetch(url, options) {
    const opts = options || {};
    let response;
    try {
      response = await fetch(url, opts);
    } catch (e) {
      throw friendly(new Error('Не удалось подключиться к GitHub. Проверьте интернет.'));
    }
    let data = null;
    try { data = await response.json(); } catch (e) { /* пусто */ }
    if (!response.ok) {
      const msg = (data && data.message) || ('HTTP ' + response.status);
      const err = new Error(msg);
      err.status = response.status;
      throw friendly(err, response.status);
    }
    return data;
  }

  function friendly(err, status) {
    if (!err.status) err.status = status;
    if (status === 401) {
      err.userMessage = 'Ключ GitHub недействителен. Откройте «Настройки» → «Заменить ключ».';
    } else if (status === 403) {
      err.userMessage = 'Недостаточно прав у ключа GitHub. Нужно дать «Contents: Read and write».';
    } else if (status === 404) {
      err.userMessage = 'Файл или ресурс не найден на GitHub.';
    } else if (status === 409 || status === 422) {
      err.userMessage = 'Конфликт версии файла. Перезагрузите страницу и попробуйте ещё раз.';
    } else if (!err.userMessage) {
      err.userMessage = err.message;
    }
    return err;
  }

  /**
   * Проверяет токен — пытается прочитать репозиторий.
   */
  async function verifyToken() {
    const url = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME;
    const data = await apiFetch(url, { headers: authHeaders() });
    return data;
  }

  /**
   * Получить файл (как текст). Кэширует sha и контент.
   */
  async function getTextFile(path, options) {
    const opts = options || {};
    if (!opts.force && fileCache[path]) return fileCache[path];

    const url = contentsUrl(path) + '?ref=' + REPO_BRANCH + '&t=' + Date.now();
    const data = await apiFetch(url, { headers: authHeaders() });

    if (!data || data.type !== 'file' || typeof data.content !== 'string') {
      throw new Error('Не удалось получить содержимое файла: ' + path);
    }
    const text = base64ToUtf8(data.content);
    fileCache[path] = { content: text, sha: data.sha };
    return fileCache[path];
  }

  /**
   * Сохранить текстовый файл. message — описание коммита.
   */
  async function putTextFile(path, content, message) {
    const cached = fileCache[path];
    const body = {
      message: message || ('admin: update ' + path),
      content: utf8ToBase64(content),
      branch: REPO_BRANCH
    };
    if (cached && cached.sha) body.sha = cached.sha;

    const data = await apiFetch(contentsUrl(path), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(body)
    });

    if (data && data.content && data.content.sha) {
      fileCache[path] = { content: content, sha: data.content.sha };
    }
    return data;
  }

  /**
   * Загрузить бинарный файл (фото). path — путь в репо, file — File объект.
   */
  async function putBinaryFile(path, file, message) {
    const base64 = await fileToBase64(file);

    let sha;
    try {
      const url = contentsUrl(path) + '?ref=' + REPO_BRANCH + '&t=' + Date.now();
      const existing = await apiFetch(url, { headers: authHeaders() });
      if (existing && existing.sha) sha = existing.sha;
    } catch (e) {
      // 404 = файла нет, это нормально для нового; остальные ошибки — пробрасываем
      if (e.status !== 404) throw e;
    }

    const body = {
      message: message || ('admin: upload ' + path),
      content: base64,
      branch: REPO_BRANCH
    };
    if (sha) body.sha = sha;

    return apiFetch(contentsUrl(path), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(body)
    });
  }

  /**
   * Удалить файл. Получаем sha (если ещё не известен) и DELETE.
   */
  async function deleteFile(path, message) {
    let sha;
    if (fileCache[path] && fileCache[path].sha) {
      sha = fileCache[path].sha;
    } else {
      const url = contentsUrl(path) + '?ref=' + REPO_BRANCH + '&t=' + Date.now();
      const existing = await apiFetch(url, { headers: authHeaders() });
      if (existing && existing.sha) sha = existing.sha;
    }
    if (!sha) throw new Error('Не удалось определить sha файла: ' + path);

    const body = {
      message: message || ('admin: delete ' + path),
      sha: sha,
      branch: REPO_BRANCH
    };
    const result = await apiFetch(contentsUrl(path), {
      method: 'DELETE',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(body)
    });
    delete fileCache[path];
    return result;
  }

  /**
   * Список файлов в директории (для перечисления уже загруженных фото и т.п.).
   */
  async function listDirectory(path) {
    const url = contentsUrl(path) + '?ref=' + REPO_BRANCH + '&t=' + Date.now();
    const data = await apiFetch(url, { headers: authHeaders() });
    return Array.isArray(data) ? data : [];
  }

  /**
   * Обновить содержимое в кэше после внешнего изменения (например, после
   * коммитов одного файла подряд — чтобы каждый раз использовать свежий sha).
   */
  function updateCache(path, content, sha) {
    fileCache[path] = { content: content, sha: sha };
  }

  function getCachedFile(path) {
    return fileCache[path] || null;
  }

  /**
   * Публичный URL картинки в репо (через raw.githubusercontent — но удобнее
   * использовать сам сайт sugarepil.ru, чтобы не упираться в кэш).
   * Для предпросмотра в админке используем jsDelivr CDN, т.к. он быстро
   * подхватывает изменения и не требует CORS-настроек.
   */
  function previewUrl(path) {
    // jsDelivr может кэшироваться долго, добавим параметр
    return 'https://cdn.jsdelivr.net/gh/' + REPO_OWNER + '/' + REPO_NAME + '@' + REPO_BRANCH + '/' + path + '?v=' + Date.now();
  }

  /**
   * Локальный preview без обращения к интернету: blob: URL из base64.
   * Используется когда файл только что загружен, GitHub ещё не запушил.
   */
  async function localPreviewFromFile(file) {
    return URL.createObjectURL(file);
  }

  window.GH = {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    clearCache: clearCache,
    verifyToken: verifyToken,
    getTextFile: getTextFile,
    putTextFile: putTextFile,
    putBinaryFile: putBinaryFile,
    deleteFile: deleteFile,
    listDirectory: listDirectory,
    updateCache: updateCache,
    getCachedFile: getCachedFile,
    previewUrl: previewUrl,
    localPreviewFromFile: localPreviewFromFile,
    REPO_OWNER: REPO_OWNER,
    REPO_NAME: REPO_NAME,
    REPO_BRANCH: REPO_BRANCH
  };
})();
