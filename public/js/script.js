// =========================================
// 1. التحكم بشاشة التحميل (Loader) وشريط التمرير
// =========================================
window.addEventListener('load', () => {
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.visibility = 'hidden';
    setTimeout(() => {
      loader.remove();
      document.documentElement.classList.remove('overflow-hidden', 'loading-active');
      document.body.classList.remove('loading-active');
    }, 350);
  }
});

// =========================================
// 2. التحكم بقائمة الهواتف (Burger Menu)
// =========================================
const burgerBtn = document.getElementById('burgerBtn');
const burgerIcon = document.getElementById('burgerIcon');
const mobileMenu = document.getElementById('mobileMenu');
const mobileLinks = document.querySelectorAll('.mobile-link');

if (burgerBtn && mobileMenu && burgerIcon) {
  burgerBtn.addEventListener('click', () => {
    const isHidden = mobileMenu.classList.toggle('hidden');
    burgerIcon.textContent = isHidden ? 'menu' : 'close';
  });

  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      burgerIcon.textContent = 'menu';
    });
  });
}

// =========================================
// 3. منع فحص العنصر (Inspect Element Protection)
// =========================================

// منع اختصارات المطورين الشائعة
document.addEventListener('keydown', (e) => {
  // منع F12
  if (e.key === 'F12' || e.keyCode === 123) {
    e.preventDefault();
    return false;
  }

  // منع Ctrl + Shift + I (Inspect)
  // منع Ctrl + Shift + J (Console)
  // منع Ctrl + Shift + C (Element Selector)
  if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
    e.preventDefault();
    return false;
  }

  // منع Ctrl + U (عرض المصدر / View Source)
  if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
    e.preventDefault();
    return false;
  }

  // منع Ctrl + S (حفظ الصفحة)
  if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    return false;
  }
});


const loginModal = document.getElementById('loginModal');

function openLoginModal() {
  if (!loginModal) return;
  loginModal.classList.remove('hidden');
  loginModal.classList.add('flex');
  document.body.style.overflow = 'hidden';
}

function closeLoginModal() {
  if (!loginModal) return;
  loginModal.classList.add('hidden');
  loginModal.classList.remove('flex');
  document.body.style.overflow = '';
}

// الإغلاق عند الضغط خارج المودال أو بزر Esc
if (loginModal) {
  loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) closeLoginModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !loginModal.classList.contains('hidden')) {
      closeLoginModal();
    }
  });
}