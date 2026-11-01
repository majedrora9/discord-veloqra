document.addEventListener('DOMContentLoaded', () => {
    // 1. إخفاء شاشة التحميل
    setTimeout(() => {
        document.body.classList.add('is-loaded');
    }, 2000);

    
    // 2. قائمة الموبايل (Burger Menu)
    const burgerBtn = document.getElementById('burger-btn');
    const navMenu = document.getElementById('nav-menu');

    if (burgerBtn && navMenu) {
        burgerBtn.addEventListener('click', () => {
            navMenu.classList.toggle('mobile-active');
        });
    }

    // 3. أكورديون الأسئلة الشائعة (FAQ Accordion)
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const trigger = item.querySelector('.faq-trigger');
        const content = item.querySelector('.faq-content');

        trigger.addEventListener('click', () => {
            const isOpen = item.classList.contains('active');

            // إغلاق باقي العناصر
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
                otherItem.querySelector('.faq-content').style.maxHeight = null;
            });

            // فتح أو إغلاق العنصر الحالي
            if (!isOpen) {
                item.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    });
});

    // 2. تعطيل اختصارات لوحة المفاتيح لفتح أدوات المطورين
    document.addEventListener('keydown', (e) => {
        // منع F12
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault();
            return false;
        }

        // منع Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (Inspect & Console)
        if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
            e.preventDefault();
            return false;
        }

        // منع Mac Shortcuts (Cmd+Option+I / Cmd+Option+J / Cmd+Option+C)
        if (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
            e.preventDefault();
            return false;
        }

        // منع Ctrl+U أو Cmd+U (عرض الكود المصدري View Source)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
            e.preventDefault();
            return false;
        }

        // منع Ctrl+S أو Cmd+S (حفظ الصفحة Save Page)
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            return false;
        }
    });

    // 3. تعطيل فحص الكونسول عبر حلقة التصحيح (Debugger Loop)
    setInterval(() => {
        (function() {
            const before = new Date().getTime();
            debugger;
            const after = new Date().getTime();
            if (after - before > 100) {
                // إذا فتح أدوات المطورين، يمكنك تفريغ الصفحة أو إعادة توجيهه
                document.body.innerHTML = '';
                location.reload();
            }
        })();
    }, 1000);