/**
 * Салон эпиляции Елены Гончаровой
 * Бургер-меню, выпадающее «Услуги», аккордеон в мобильном меню, плавная прокрутка, lazy loading
 */

(function () {
  'use strict';

  const HEADER_HEIGHT = 84;
  const burgerBtn = document.getElementById('burger-btn');
  const nav = document.querySelector('.nav');
  const navLinks = document.querySelectorAll('.nav__link');
  const navSublinks = document.querySelectorAll('.nav__sublink');
  const servicesTrigger = document.getElementById('nav-services-trigger');
  const epilationTrigger = document.getElementById('nav-epilation-trigger');
  const electroTrigger = document.getElementById('nav-electro-trigger');
  const dropdownItem = document.querySelector('.nav__item--dropdown');

  // ——— Бургер-меню ———
  if (burgerBtn && nav) {
    function openMenu() {
      nav.classList.add('is-open');
      burgerBtn.setAttribute('aria-expanded', 'true');
      burgerBtn.setAttribute('aria-label', 'Закрыть меню');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      nav.classList.remove('is-open');
      burgerBtn.setAttribute('aria-expanded', 'false');
      burgerBtn.setAttribute('aria-label', 'Открыть меню');
      document.body.style.overflow = '';
      if (dropdownItem) dropdownItem.classList.remove('is-open');
      document.querySelectorAll('.nav__item--submenu.is-open').forEach(function (el) {
        el.classList.remove('is-open');
      });
      if (epilationTrigger) epilationTrigger.setAttribute('aria-expanded', 'false');
      if (electroTrigger) electroTrigger.setAttribute('aria-expanded', 'false');
    }

    function toggleMenu() {
      const isOpen = nav.classList.contains('is-open');
      if (isOpen) closeMenu();
      else openMenu();
    }

    burgerBtn.addEventListener('click', toggleMenu);

    navLinks.forEach(function (link) {
      if (link.getAttribute('href')) {
        link.addEventListener('click', function () {
          if (window.innerWidth < 900) closeMenu();
        });
      }
    });

    navSublinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth < 900) closeMenu();
        // Переход по href (на services.html) не блокируем — страница сменится
      });
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 900) closeMenu();
    });
  }

  // ——— Услуги: выпадающее меню (десктоп) и аккордеон (мобильный) ———
  if (servicesTrigger && dropdownItem) {
    servicesTrigger.addEventListener('click', function () {
      if (window.innerWidth >= 900) {
        dropdownItem.classList.toggle('is-open');
        const expanded = dropdownItem.classList.contains('is-open');
        servicesTrigger.setAttribute('aria-expanded', expanded);
      } else {
        dropdownItem.classList.toggle('is-open');
        const expanded = dropdownItem.classList.contains('is-open');
        servicesTrigger.setAttribute('aria-expanded', expanded);
      }
    });
  }

  if (epilationTrigger) {
    const subItem = epilationTrigger.closest('.nav__item--submenu');
    epilationTrigger.addEventListener('click', function (e) {
      if (window.innerWidth >= 900) return;
      if (!subItem) return;
      e.preventDefault();
      subItem.classList.toggle('is-open');
      epilationTrigger.setAttribute('aria-expanded', subItem.classList.contains('is-open'));
    });
  }

  if (electroTrigger) {
    const subItem = electroTrigger.closest('.nav__item--submenu');
    electroTrigger.addEventListener('click', function (e) {
      if (window.innerWidth >= 900) return;
      if (!subItem) return;
      e.preventDefault();
      subItem.classList.toggle('is-open');
      electroTrigger.setAttribute('aria-expanded', subItem.classList.contains('is-open'));
    });
  }

  document.addEventListener('click', function (e) {
    if (window.innerWidth < 900) return;
    if (!dropdownItem || !servicesTrigger) return;
    if (dropdownItem.contains(e.target)) return;
    dropdownItem.classList.remove('is-open');
    servicesTrigger.setAttribute('aria-expanded', 'false');
  });

  // ——— Десктоп: двухуровневое меню по наведению (держим открытым при движении к выпадашке и подменю) ———
  const navDropdown = document.getElementById('nav-services');
  const submenuItems = document.querySelectorAll('.nav__item--submenu');

  let dropdownLeaveTimer = null;
  let submenuLeaveTimers = {};

  function clearDropdownTimer() {
    if (dropdownLeaveTimer) {
      clearTimeout(dropdownLeaveTimer);
      dropdownLeaveTimer = null;
    }
  }

  function openDropdown() {
    if (window.innerWidth < 900) return;
    if (dropdownItem) dropdownItem.classList.add('is-open');
    if (servicesTrigger) servicesTrigger.setAttribute('aria-expanded', 'true');
    clearDropdownTimer();
  }

  function closeDropdown() {
    if (window.innerWidth < 900) return;
    clearDropdownTimer();
    dropdownLeaveTimer = setTimeout(function () {
      if (dropdownItem) dropdownItem.classList.remove('is-open');
      if (servicesTrigger) servicesTrigger.setAttribute('aria-expanded', 'false');
      submenuItems.forEach(function (el) {
        el.classList.remove('is-open');
      });
      dropdownLeaveTimer = null;
    }, 150);
  }

  if (servicesTrigger && navDropdown && dropdownItem) {
    servicesTrigger.addEventListener('mouseenter', openDropdown);
    servicesTrigger.addEventListener('mouseleave', function () {
      if (window.innerWidth < 900) return;
      closeDropdown();
    });
    navDropdown.addEventListener('mouseenter', openDropdown);
    navDropdown.addEventListener('mouseleave', closeDropdown);
  }

  submenuItems.forEach(function (subItem) {
    const trigger = subItem.querySelector('.nav__dropdown-trigger');
    const submenu = subItem.querySelector('.nav__submenu');
    if (!trigger || !submenu) return;

    function clearSubTimer() {
      if (submenuLeaveTimers[subItem]) {
        clearTimeout(submenuLeaveTimers[subItem]);
        submenuLeaveTimers[subItem] = null;
      }
    }

    function openSubmenu() {
      if (window.innerWidth < 900) return;
      clearSubTimer();
      submenuItems.forEach(function (other) {
        if (other !== subItem) other.classList.remove('is-open');
      });
      subItem.classList.add('is-open');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }

    function closeSubmenu() {
      if (window.innerWidth < 900) return;
      submenuLeaveTimers[subItem] = setTimeout(function () {
        subItem.classList.remove('is-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        submenuLeaveTimers[subItem] = null;
      }, 100);
    }

    trigger.addEventListener('mouseenter', openSubmenu);
    trigger.addEventListener('mouseleave', function () {
      if (window.innerWidth < 900) return;
      closeSubmenu();
    });
    submenu.addEventListener('mouseenter', openSubmenu);
    submenu.addEventListener('mouseleave', closeSubmenu);
  });

  // ——— Плавная прокрутка к якорям ———
  navLinks.forEach(function (link) {
    const href = link.getAttribute('href');
    if (!href || href.charAt(0) !== '#') return;

    link.addEventListener('click', function (e) {
      const id = href.slice(1);
      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.pageYOffset - HEADER_HEIGHT;

      window.scrollTo({
        top: top,
        behavior: 'smooth'
      });
    });
  });

  // ——— Lazy loading изображений (data-src → src при появлении в viewport) ———
  const lazyImages = document.querySelectorAll('.master-card__img[data-src]');

  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          const img = entry.target;
          const src = img.getAttribute('data-src');
          if (!src) return;
          img.setAttribute('src', src);
          img.removeAttribute('data-src');
          img.onload = function () {
            img.classList.add('is-loaded');
          };
          observer.unobserve(img);
        });
      },
      { rootMargin: '80px', threshold: 0.01 }
    );

    lazyImages.forEach(function (img) {
      imageObserver.observe(img);
    });
  } else {
    lazyImages.forEach(function (img) {
      const src = img.getAttribute('data-src');
      if (src) img.setAttribute('src', src);
    });
  }
})();
