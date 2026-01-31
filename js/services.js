/**
 * Страница услуг: переключение категорий по хешу, выбор услуги, автоскролл
 * Хеш: #категория или #категория_услуга (например #epilation_shugaring)
 */

(function () {
  'use strict';

  const HEADER_HEIGHT = 84;
  const TAB_IDS = ['epilation', 'electro', 'laminating', 'prices'];
  const tabs = {
    epilation: document.getElementById('tab-epilation'),
    electro: document.getElementById('tab-electro'),
    laminating: document.getElementById('tab-laminating'),
    prices: document.getElementById('tab-prices')
  };
  const panels = {
    epilation: document.getElementById('panel-epilation'),
    electro: document.getElementById('panel-electro'),
    laminating: document.getElementById('panel-laminating'),
    prices: document.getElementById('panel-prices')
  };
  const worksGallerySection = document.getElementById('works-gallery-section');
  const resniGallerySection = document.getElementById('resni-gallery-section');

  function switchTo(cat) {
    if (!TAB_IDS.includes(cat)) cat = 'epilation';
    TAB_IDS.forEach(function (id) {
      const tab = tabs[id];
      const panel = panels[id];
      if (tab) {
        tab.setAttribute('aria-selected', id === cat ? 'true' : 'false');
        tab.setAttribute('tabindex', id === cat ? 0 : -1);
      }
      if (panel) {
        panel.hidden = id !== cat;
      }
    });
    if (worksGallerySection && resniGallerySection) {
      worksGallerySection.hidden = cat === 'laminating';
      resniGallerySection.hidden = cat !== 'laminating';
    }
    if (history.replaceState) {
      history.replaceState(null, '', '#' + cat);
    } else {
      window.location.hash = cat;
    }
  }

  /**
   * Показать услугу в панели: контент, подсветка кнопки, прокрутка кнопки в видимую зону, обновление хеша
   */
  function showService(cat, serviceId, options) {
    options = options || {};
    const panel = panels[cat];
    if (!panel || !serviceId || cat === 'prices') return;
    const detail = panel.querySelector('.services-detail');
    if (!detail) return;
    const btn = panel.querySelector('.services-list__item[data-service="' + serviceId + '"]');
    const contents = detail.querySelectorAll('.service-content');

    detail.hidden = false;
    contents.forEach(function (block) {
      block.hidden = block.getAttribute('data-service') !== serviceId;
    });
    panel.querySelectorAll('.services-list__item').forEach(function (b) {
      b.classList.remove('is-selected');
      if (b.getAttribute('data-service') === serviceId) b.classList.add('is-selected');
    });

    if (btn && options.scrollButtonIntoView !== false) {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    const newHash = cat + '_' + serviceId;
    if (history.replaceState) {
      history.replaceState(null, '', '#' + newHash);
    } else {
      window.location.hash = newHash;
    }
  }

  /**
   * Прокрутка страницы к блоку контента услуги (с учётом фиксированного хедера)
   */
  function scrollToDetail(panel) {
    if (!panel) return;
    const detail = panel.querySelector('.services-detail');
    if (!detail) return;
    const y = detail.getBoundingClientRect().top + window.pageYOffset - HEADER_HEIGHT;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  /**
   * Парсинг хеша: #epilation_shugaring -> { cat: 'epilation', serviceId: 'shugaring' }
   * #epilation_shugaring-bikini -> { cat: 'epilation', serviceId: 'shugaring-bikini' }
   */
  function parseHash() {
    const raw = (window.location.hash || '').replace(/^#/, '').trim();
    if (!raw) return { cat: 'epilation', serviceId: null };
    const idx = raw.indexOf('_');
    if (idx === -1) {
      return { cat: TAB_IDS.includes(raw) ? raw : 'epilation', serviceId: null };
    }
    const cat = raw.slice(0, idx);
    const serviceId = raw.slice(idx + 1);
    return {
      cat: TAB_IDS.includes(cat) ? cat : 'epilation',
      serviceId: serviceId || null
    };
  }

  function initFromHash() {
    const parsed = parseHash();
    switchTo(parsed.cat);
    if (parsed.serviceId) {
      showService(parsed.cat, parsed.serviceId, { scrollButtonIntoView: true });
      setTimeout(function () {
        scrollToDetail(panels[parsed.cat]);
      }, 100);
    }
  }

  if (tabs.epilation) {
    TAB_IDS.forEach(function (id) {
      const tab = tabs[id];
      if (!tab) return;
      tab.addEventListener('click', function () {
        switchTo(id);
      });
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        switchTo(id);
      });
    });
  }

  window.addEventListener('hashchange', initFromHash);
  initFromHash();

  // Клик по кнопке услуги: показать контент, обновить хеш, прокрутить к контенту
  document.querySelectorAll('.services-list__item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const panel = btn.closest('.services-panel');
      if (!panel) return;
      const serviceId = btn.getAttribute('data-service');
      if (!serviceId) return;
      const panelId = panel.id || '';
      const cat = panelId.replace('panel-', '') || (panel === panels.epilation ? 'epilation' : panel === panels.electro ? 'electro' : 'prices');
      if (TAB_IDS.indexOf(cat) === -1) return;

      showService(cat, serviceId, { scrollButtonIntoView: true });
      scrollToDetail(panel);
    });
  });

  // Галерея работ: открытие/закрытие модального окна, переключение фото, свайпы (works + resni)
  var worksModal = document.getElementById('works-modal');
  var worksModalImg = document.getElementById('works-modal-img');
  var worksModalClose = worksModal && worksModal.querySelector('.works-modal__close');
  var worksModalBackdrop = worksModal && worksModal.querySelector('.works-modal__backdrop');
  var worksModalSwipeArea = document.getElementById('works-modal-swipe-area');
  var worksGalleryItems = document.querySelectorAll('#works-gallery-list .works-gallery__item');
  var resniGalleryItems = document.querySelectorAll('#resni-gallery-list .works-gallery__item');
  var currentModalGalleryItems = worksGalleryItems;
  var worksModalCurrentIndex = 0;

  function getWorksItemSrcAlt(index) {
    var btn = currentModalGalleryItems[index];
    if (!btn) return { src: '', alt: '' };
    return {
      src: btn.getAttribute('data-src') || '',
      alt: btn.getAttribute('data-alt') || ''
    };
  }

  function updateWorksModalImage(index) {
    var len = currentModalGalleryItems.length;
    if (!worksModalImg || index < 0 || index >= len) return;
    worksModalCurrentIndex = index;
    var data = getWorksItemSrcAlt(index);
    worksModalImg.src = data.src;
    worksModalImg.alt = data.alt;
  }

  function openWorksModal(src, alt, index, items) {
    if (!worksModal || !worksModalImg) return;
    currentModalGalleryItems = items || worksGalleryItems;
    var len = currentModalGalleryItems.length;
    if (typeof index === 'number' && index >= 0 && index < len) {
      worksModalCurrentIndex = index;
      updateWorksModalImage(index);
    } else {
      worksModalImg.src = src;
      worksModalImg.alt = alt;
      worksModalCurrentIndex = 0;
      for (var i = 0; i < len; i++) {
        if (currentModalGalleryItems[i].getAttribute('data-src') === src) {
          worksModalCurrentIndex = i;
          break;
        }
      }
    }
    worksModal.hidden = false;
    worksModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (worksModalClose) worksModalClose.focus();
  }

  function closeWorksModal() {
    if (!worksModal) return;
    worksModal.hidden = true;
    worksModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function showWorksPrev() {
    if (worksModalCurrentIndex > 0) {
      updateWorksModalImage(worksModalCurrentIndex - 1);
    }
  }

  function showWorksNext() {
    var len = currentModalGalleryItems ? currentModalGalleryItems.length : 0;
    if (worksModalCurrentIndex < len - 1) {
      updateWorksModalImage(worksModalCurrentIndex + 1);
    }
  }

  function bindGalleryClicks(list, items) {
    if (!items || !items.length) return;
    for (var i = 0; i < items.length; i++) {
      (function (btn, index) {
        btn.addEventListener('click', function () {
          var src = btn.getAttribute('data-src');
          var alt = btn.getAttribute('data-alt') || '';
          if (src) openWorksModal(src, alt, index, items);
        });
      })(items[i], i);
    }
  }

  bindGalleryClicks(document.getElementById('works-gallery-list'), worksGalleryItems);
  bindGalleryClicks(document.getElementById('resni-gallery-list'), resniGalleryItems);

  if (worksModalBackdrop) {
    worksModalBackdrop.addEventListener('click', closeWorksModal);
  }
  if (worksModalClose) {
    worksModalClose.addEventListener('click', closeWorksModal);
  }

  // Свайпы на мобилке: лево = следующее, право = предыдущее
  if (worksModalSwipeArea) {
    var touchStartX = 0;
    var touchEndX = 0;
    var swipeMin = 50;

    worksModalSwipeArea.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });

    worksModalSwipeArea.addEventListener('touchend', function (e) {
      touchEndX = e.changedTouches[0].clientX;
      var delta = touchStartX - touchEndX;
      if (delta > swipeMin) {
        showWorksNext();
      } else if (delta < -swipeMin) {
        showWorksPrev();
      }
    }, { passive: true });
  }

  document.addEventListener('keydown', function (e) {
    if (!worksModal || worksModal.hidden) return;
    if (e.key === 'Escape') {
      closeWorksModal();
    } else if (e.key === 'ArrowLeft') {
      showWorksPrev();
    } else if (e.key === 'ArrowRight') {
      showWorksNext();
    }
  });
})();
