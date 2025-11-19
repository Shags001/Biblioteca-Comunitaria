// app/static/js/main.js
// Centraliza scripts JS de la app

// Lucide icons y tooltips
function initIconsAndTooltips() {
  if (window.lucide) lucide.createIcons();
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  var triggerOption = isTouch ? 'click' : 'hover focus';
  var triggers = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  triggers.forEach(function (el) {
    new bootstrap.Tooltip(el, {
      container: 'body',
      boundary: 'window',
      trigger: triggerOption,
      delay: { show: 100, hide: 50 }
    });
  });
}

// Navbar collapse y cierre
function initNavbarCollapse() {
  var navbarCollapse = document.getElementById('navbarNav');
  var toggler = document.querySelector('.navbar-toggler');
  if (navbarCollapse && toggler) {
    navbarCollapse.addEventListener('show.bs.collapse', function () {
      toggler.classList.add('is-open');
      document.body.classList.add('no-scroll');
    });
    navbarCollapse.addEventListener('hidden.bs.collapse', function () {
      toggler.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
    });
    document.querySelectorAll('.navbar-nav .nav-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        if (link.classList.contains('dropdown-toggle')) {
          e.stopPropagation();
          return;
        }
        var computed = window.getComputedStyle(toggler);
        var isTogglerVisible = computed.display !== 'none';
        if (isTogglerVisible && navbarCollapse.classList.contains('show')) {
          var bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse) || new bootstrap.Collapse(navbarCollapse, { toggle: false });
          bsCollapse.hide();
        }
      });
    });
    document.addEventListener('click', function (e) {
      var isTogglerVisible = toggler && window.getComputedStyle(toggler).display !== 'none';
      var isNavbarOpen = navbarCollapse && navbarCollapse.classList.contains('show');
      var clickedInsideNavbar = e.target.closest('.navbar');
      if (isTogglerVisible && isNavbarOpen && !clickedInsideNavbar) {
        var bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse) || new bootstrap.Collapse(navbarCollapse, { toggle: false });
        bsCollapse.hide();
      }
    });
  }
}

// Login form
function initLoginForm() {
  var form = document.getElementById('loginForm');
  if (!form) return;
  var errorMessage = document.getElementById('errorMessage');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var email = emailInput.value.trim();
    var password = passwordInput.value.trim();
    errorMessage.classList.add('d-none');
    emailInput.classList.remove('is-invalid');
    passwordInput.classList.remove('is-invalid');
    var hasError = false;
    if (!email) {
      emailInput.classList.add('is-invalid');
      hasError = true;
    }
    if (!password) {
      passwordInput.classList.add('is-invalid');
      hasError = true;
    }
    if (hasError) {
      errorMessage.classList.remove('d-none');
      // Ya no se oculta automáticamente
    } else {
      form.submit();
    }
  });
  emailInput.addEventListener('input', function() {
    this.classList.remove('is-invalid');
  });
  passwordInput.addEventListener('input', function() {
    this.classList.remove('is-invalid');
  });
  // Ya no ocultamos el mensaje flash global automáticamente
}

// Book form (gestLibros)
function initBookForm() {
  var form = document.getElementById('bookForm');
  if (!form) return;
  var alertMessage = document.getElementById('alertMessage');
  form.addEventListener('submit', function(e) {
    // If a specialized module (libros.js) is handling the book form, avoid
    // showing duplicate alerts — let that module manage notifications.
    if (window && window.LIBROS_MODULE) return;
    e.preventDefault();
    var title = document.getElementById('bookTitle').value.trim();
    var author = document.getElementById('bookAuthor').value.trim();
    // genre may be a native select or our custom picker (#bookGenreInput)
    var genreEl = document.getElementById('bookGenre');
    var genreInput = document.getElementById('bookGenreInput');
    var genre = '';
    if (genreEl && typeof genreEl.value !== 'undefined') genre = genreEl.value;
    else if (genreInput && genreInput.dataset && genreInput.dataset.value) genre = genreInput.dataset.value;
    var copies = document.getElementById('bookCopies').value;
    if (!title || !author || !genre || !copies) {
      // Prefer inline alertMessage if present, otherwise create a flash
      if (alertMessage) {
        showAlert('Te faltó llenar algunos campos', 'error');
      } else {
        var container = document.getElementById('flashContainer') || document.body;
        var f = document.createElement('div');
        f.className = 'flash alert-error';
        f.innerHTML = '<div class="flash-body">Te faltó llenar algunos campos</div><button type="button" class="flash-close btn-close">&times;</button>';
        container.appendChild(f);
        setTimeout(function() { f.classList.add('hide'); setTimeout(function(){ try{ f.remove(); } catch(e){} }, 400); }, 3500);
      }
      return;
    }
    if (alertMessage) {
      showAlert('¡Listo! Libro agregado', 'success');
      setTimeout(function() { form.reset(); hideAlert(); }, 2000);
    } else {
      var container2 = document.getElementById('flashContainer') || document.body;
      var f2 = document.createElement('div');
      f2.className = 'flash alert-success';
      f2.innerHTML = '<div class="flash-body">¡Listo! Libro agregado</div><button type="button" class="flash-close btn-close">&times;</button>';
      container2.appendChild(f2);
      setTimeout(function() { f2.classList.add('hide'); setTimeout(function(){ try{ f2.remove(); } catch(e){} }, 400); }, 2000);
      setTimeout(function() { form.reset(); }, 2000);
    }
  });
  function showAlert(message, type) {
    alertMessage.textContent = message;
    alertMessage.className = 'alert-custom alert-' + type;
    alertMessage.style.display = 'block';
    setTimeout(hideAlert, 4000);
  }
  function hideAlert() {
    alertMessage.style.display = 'none';
  }
  window.resetForm = function() {
    if (confirm('¿Seguro que quieres cancelar? Se perderán los cambios.')) {
      form.reset();
      hideAlert();
    }
  };
}

// Prestamo form
function initPrestamoForm() {
  var form = document.getElementById('prestamoForm');
  if (!form) return;
  // Aquí puedes agregar validaciones y lógica para el formulario de préstamo
}

// Inicialización global
function initAppScripts() {
  initIconsAndTooltips();
  initNavbarCollapse();
  initLoginForm();
  initBookForm();
  initPrestamoForm();
  initModalUiBehavior();
  initFlashMessages();
  // Agrega aquí más inicializadores si creas nuevos módulos
}

document.addEventListener('DOMContentLoaded', initAppScripts);

// Automatically adjust navbar/footer and z-index when custom modals open.
function initModalUiBehavior() {
  var modals = document.querySelectorAll('.modal-overlay');
  if (!modals || !modals.length) return;

  function toggleModalUi(show) {
    var html = document.documentElement;
    var navbar = document.querySelector('.navbar');
    var footer = document.querySelector('footer, .footer');
    if (show) {
      html.classList.add('modal-active');
      // prevent background scrolling when modal is open
      document.body.classList.add('no-scroll');
      if (navbar) navbar.setAttribute('aria-hidden', 'true');
      if (footer) footer.setAttribute('aria-hidden', 'true');
    } else {
      html.classList.remove('modal-active');
      document.body.classList.remove('no-scroll');
      if (navbar) navbar.removeAttribute('aria-hidden');
      if (footer) footer.removeAttribute('aria-hidden');
    }
  }

  // Observe class changes (we rely on adding/removing 'd-none' to show/hide modals)
  modals.forEach(function(modal) {
    var mo = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.attributeName === 'class') {
          var isShown = !modal.classList.contains('d-none');
          toggleModalUi(isShown);
        }
      });
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });

    // Clicking the overlay area should hide the modal and restore UI if other code expects it
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.classList.add('d-none');
        toggleModalUi(false);
      }
    });

    // Wire up internal close buttons if present. Also support module-specific ids
    // like #mBtnCancelar used in the préstamos modal. When a close control is
    // clicked we must hide the modal element (add d-none) and restore UI state.
    var closeBtn = modal.querySelector('.btn-close-modal, .btn-close, #btnCerrarModal, #btnCancelar, #mBtnCancelar, #btnCerrarPrestamoModal');
    if (closeBtn) closeBtn.addEventListener('click', function() {
      try { modal.classList.add('d-none'); } catch (e) {}
      toggleModalUi(false);
    });
  });

  // Also close visible modals with Escape and restore UI
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      var visible = Array.prototype.slice.call(document.querySelectorAll('.modal-overlay')).find(function(m) { return !m.classList.contains('d-none'); });
      if (visible) {
        visible.classList.add('d-none');
        toggleModalUi(false);
      }
    }
  });
}

// Manejo de mensajes flash renderizados por Jinja en la plantilla base
function initFlashMessages() {
  var flashes = document.querySelectorAll('.flash');
  var container = document.getElementById('flashContainer');
  if (!flashes || !flashes.length || !container) return;

  // Posicionar el contenedor justo debajo del navbar si existe
  function positionFlashContainerBelowNavbar() {
    var navbar = document.querySelector('.navbar');
    if (navbar) {
      var rect = navbar.getBoundingClientRect();
      // sumamos 8px de separación
      container.style.top = (rect.bottom + 8) + 'px';
      // aseguramos que la posición sea fixed y se mantenga a la derecha
      container.style.right = '20px';
    } else {
      // fallback a 20px desde arriba
      container.style.top = '20px';
    }
  }
  // run once and on resize
  positionFlashContainerBelowNavbar();
  window.addEventListener('resize', positionFlashContainerBelowNavbar);
  flashes.forEach(function(f) {
    // Tiempo por defecto 3500ms (puedes personalizar en data-timeout)
    var timeout = parseInt(f.getAttribute('data-timeout') || '3500', 10);
    var closeBtn = f.querySelector('.flash-close');

    // Auto-cierre
    var t = setTimeout(function() {
      f.classList.add('hide');
      setTimeout(function() { try { f.remove(); } catch(e){} }, 400);
    }, timeout);

    // Cerrar por botón
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        clearTimeout(t);
        f.classList.add('hide');
        setTimeout(function() { try { f.remove(); } catch(e){} }, 300);
      });
    }
  });
}
