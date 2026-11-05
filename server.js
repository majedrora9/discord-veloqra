const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cookieSession = require('cookie-session');
const axios = require('axios');

const AdminUser = require('./models/AdminUser');
const Order = require('./models/Order');
const TeamAbout = require('./models/TeamAbout');
const DiscordUser = require('./models/DiscordUser');
const Seller = require('./models/Seller');
const Job = require('./models/Jobs');
const Badge = require('./models/Badge');
const { StoreItem, StoreOrder } = require('./models/Store');
const TelegramSubscriber = require('./models/TelegramSubscriber');

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '697781426527010877';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'vnfBSDtLE_ByDugfdXeiC8okImulTDjJ';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || ''; 
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://app.veloqra.xyz/auth/discord/callback';

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://Vercel-Admin-veloqra-resource:Y3a7iPIirGVxc5S5@veloqra-resource.wdmh1h2.mongodb.net/veloqra?retryWrites=true&w=majority";

let cachedDb = global.mongoose;
if (!cachedDb) {
    cachedDb = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cachedDb.conn) return cachedDb.conn;
    if (!cachedDb.promise) {
        const opts = {
            bufferCommands: false,
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10
        };
        cachedDb.promise = mongoose.connect(MONGO_URI, opts).then(async (mongooseInstance) => {
            console.log("⚡ MongoDB Connected (Discord Network Engine)");
            return mongooseInstance;
        });
    }
    cachedDb.conn = await cachedDb.promise;
    return cachedDb.conn;
}

app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("Database connection failure:", err);
        res.status(500).send("فشل الاتصال بقاعدة البيانات، يرجى المحاولة بعد لحظات.");
    }
});

app.set('trust proxy', 1);

app.use(cookieSession({
    name: 'veloqra_discord_session',
    keys: ['veloqra_discord_secret_auth_2026'],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true
}));

app.use((req, res, next) => {
    res.locals.user = req.session ? (req.session.user || null) : null;
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== نظام تيليجرام (MongoDB + Webhook) ==================== //

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8731827562:AAH-eW6krnvRgTEKDvb1WjD9R9ofMZ5Vftg';

// تسجيل المشتركين تلقائياً عبر Webhook وتخزينهم في MongoDB
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const msg = req.body?.message;
    if (msg && msg.chat && msg.text && msg.text.trim().startsWith('/start')) {
      const chatId = String(msg.chat.id);
      const username = msg.from?.username || msg.from?.first_name || '';

      // حفظ الـ Chat ID في MongoDB
      await TelegramSubscriber.findOneAndUpdate(
        { chatId },
        { chatId, username },
        { upsert: true }
      );

      // إرسال رسالة ترحيبية وتأكيد الاشتراك فوراً
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'أهلاً بك في متجر فيلوكرا! تم تسجيل حسابك واشتراكك بنجاح ✅\nستصلك جميع الطلبات الجديدة هنا فوراً'
        })
      });
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Telegram Webhook Route Error:', e);
    res.sendStatus(200);
  }
});

async function notifyAllSubscribers(orderData) {
  try {
    const subs = await TelegramSubscriber.find().lean();
    let recipients = (subs && subs.length > 0) ? subs.map(s => s.chatId) : [];
    if (recipients.length === 0 && process.env.TELEGRAM_CHAT_ID) {
      recipients.push(process.env.TELEGRAM_CHAT_ID);
    }

    if (recipients.length === 0) return;

    // خريطة أسماء العملات بالعربي
    const currencyNamesArabic = {
      'SYP_CASH': 'ل.س (نقداً)',
      'SYP_SHAM': 'شام كاش (ل.س)',
      'SYP_PAYMERA': 'بايميرا (ل.س)',
      'SYP_MTN': 'MTN كاش',
      'SYP_SYRIATEL': 'سيرياتيل كاش',
      'IQD_ASIACELL': 'آسيا سيل (د.ع)',
      'IQD_QI': 'رافدين Qi',
      'IQD_CASH': 'د.ع (نقداً)',
      'USD_SHAM': 'شام كاش ($)',
      'USD_PAYPAL': 'PayPal ($)',
      'VELO_COIN': 'فيلو كوين',
      'CRYPTO_USDT': 'USDT (BEP20)',
      'TRY_PAPARA': 'بابارا (TL)',
      'TRY_CASH': 'TL (كاش)',
      'LBP_WHISH': 'Whish Money',
      'JOD_CLIQ': 'CliQ (د.أ)',
      'EGP_VODAFONE': 'فودافون كاش',
      'SAR_STCPAY': 'STC Pay (ر.س)'
    };

    const getCurrName = (c) => currencyNamesArabic[String(c || '').toUpperCase()] || c;

    // تجهيز الأصناف بتنسيق منظم بسطور منفصلة
    let itemsList = '';
    (orderData.items || []).forEach((it, idx) => {
      let rawTitle = it.title || '';
      let recipientPhone = '';

      // استخراج رقم المستلم إن وجد وفصله عن اسم المنتج
      const phoneMatch = rawTitle.match(/\[رقم المستلم:\s*([^\]]+)\]/i);
      if (phoneMatch) {
        recipientPhone = phoneMatch[1].trim();
        rawTitle = rawTitle.replace(phoneMatch[0], '').trim();
      }

      itemsList += `🔹 Item: (${idx + 1}): ${rawTitle}\n`;
      itemsList += `   ▫️ Amount: ${it.qty || 1}\n`;
      itemsList += `   ▫️ Price: ${it.finalPrice} ${getCurrName(it.currency)}\n`;
      if (recipientPhone) {
        itemsList += `   📱 Phone Number: <code>${recipientPhone}</code>\n`;
      }
      itemsList += `\n`;
    });

    // تجهيز الإجمالي النهائي
    const rawTotals = orderData.currencyTotals || {};
    let totalsList = [];
    if (rawTotals instanceof Map || typeof rawTotals.forEach === 'function') {
      rawTotals.forEach((val, key) => {
        totalsList.push(`• ${val} ${getCurrName(key)}`);
      });
    } else {
      for (const [key, val] of Object.entries(rawTotals)) {
        if (!key.startsWith('$') && typeof val !== 'object') {
          totalsList.push(`• ${val} ${getCurrName(key)}`);
        }
      }
    }
    const totalsText = totalsList.length > 0 ? totalsList.join('\n') : '0';

    // عمولة الوسيط
    const middlemanInfo = orderData.useMiddleman 
      ? `\n💰 عمولة الوسيط (5%): ${orderData.middlemanFee} ${getCurrName(orderData.middlemanPaymentMethod)}` 
      : '';

    // التحقق من هوية المشتري وآيديه
    const buyerDiscordId = orderData.buyer?.discordId;
    const isBuyerRegistered = buyerDiscordId && buyerDiscordId !== 'guest';
    const buyerDisplay = isBuyerRegistered 
      ? `${orderData.buyer?.username || 'مستخدم'} (<code>${buyerDiscordId}</code>)` 
      : `${orderData.buyer?.username || 'زائر'} (<code>guest</code>)`;

    // بيانات البائع وآيديه
    const sellerDiscordId = orderData.seller?.discordId || 'غير متوفر';
    const sellerDisplay = `${orderData.seller?.username || 'بائع'} (<code>${sellerDiscordId}</code>)`;

    // قالب الرسالة النهائي
    const message = 
`
طلب جديد في فيلوكرا
───────────────────
🆔 <b>Order ID:</b> <code>#${orderData.orderId}</code>
👤 <b>User:</b> ${buyerDisplay}
🏪 <b>Seller:</b> ${sellerDisplay}
🛡️ <b>Purchase type:</b> ${orderData.useMiddleman ? 'مع وسيط (+5%)' : 'شراء مباشر'}${middlemanInfo}
───────────────────
📦 <b>Items</b>

${itemsList.trim()}
───────────────────
🌟 <b>Total:</b>
${totalsText}
───────────────────`;

    // الإرسال مع تفعيل parse_mode: 'HTML' لنسخ رقم المستلم ورقم الطلب بلمسة واحدة
    for (const chatId of recipients) {
      try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
          })
        });
      } catch (err) {
        console.error(`Telegram send error to ${chatId}:`, err);
      }
    }
  } catch (err) {
    console.error('Broadcast Telegram Error:', err);
  }
}

// ==================== مسارات عامة ==================== //

app.get('/invite', (req, res) => res.redirect(301, 'https://discord.com/oauth2/authorize?client_id=697781426527010877'));
app.get('/join', (req, res) => res.redirect(301, 'https://discord.gg/BmwsgbSnk3'));
app.get('/_tg4a', (req, res) => res.redirect(301, '/users/1068278933532983370'));
app.get('/discord', (req, res) => res.redirect('/'));

const OWNER_DISCORD_ID = '691044838459834430';
const VELOQRA_STAFF_IDS = ['691044838459834430', '1068278933532983370'];
const VIOLATIONS_ALLOWED_IDS = ['691044838459834430', '1068278933532983370'];
const JOBS_ADMIN_IDS = ['691044838459834430', '1068278933532983370'];

async function requireStaffAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/discord');
    }
    const discordId = req.session.user.id;
    const dbUser = await DiscordUser.findOne({ discordId }).lean();
    const isStaffInList = VELOQRA_STAFF_IDS.includes(discordId);
    
    const userBadges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
    const hasStaffBadge = isStaffInList || userBadges.some(b => {
        if (typeof b === 'string') return b.toLowerCase() === 'staff';
        if (b && typeof b === 'object') return (b.key || b.id || '').toLowerCase() === 'staff';
        return false;
    });

    if (!hasStaffBadge) {
        return res.status(403).render('404', { 
            title: 'غير مصرح', 
            message: 'هذه الصفحة مخصصة لإدارة فيلوكرا حصراً.' 
        });
    }

    req.isMasterAdmin = VELOQRA_STAFF_IDS.includes(discordId);
    next();
}

function requireViolationsAccess(req, res, next) {
    if (!req.session || !req.session.user) return res.redirect('/auth/discord');
    if (!VIOLATIONS_ALLOWED_IDS.includes(req.session.user.id)) {
        return res.status(403).render('404', { title: 'صلاحية محظورة', message: 'عذراً، هذه الصفحة مخصصة للإدارة العليا حصراً.' });
    }
    next();
}

function requireJobsAccess(req, res, next) {
    if (!req.session || !req.session.user) return res.redirect('/auth/discord');
    if (!JOBS_ADMIN_IDS.includes(req.session.user.id)) {
        return res.status(403).render('404', { title: 'صلاحية محظورة', message: 'عذراً، إدارة الوظائف مخصصة للإدارة العليا حصراً.' });
    }
    next();
}

app.get('/', (req, res) => {
    res.render('index', { page: 'discord-home' });
});

app.get('/terms', (req, res) => {
    res.render('terms', { page: 'terms' });
});

app.get('/subdomain-policy', (req, res) => {
    res.render('subdomain-policy', { page: 'subdomain-policy' });
});

// ==================== مسارات المتجر (Store Routes) ==================== //

app.get('/store', async (req, res) => {
  try {
    const { q, type } = req.query;
    
    let queryFilter = { status: { $in: ['active', 'sold'] } };

    if (q && q.trim()) {
      const searchRegex = { $regex: q.trim(), $options: 'i' };
      queryFilter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { 'seller.username': searchRegex }
      ];
    }
    if (type && type !== 'all') queryFilter.type = type;

    const [items, dbUser] = await Promise.all([
      StoreItem.find(queryFilter).sort({ isPinned: -1, createdAt: -1 }).lean(),
      req.session && req.session.user ? DiscordUser.findOne({ discordId: req.session.user.id }).lean() : null
    ]);

    let isStaffOrAdmin = false;
    if (req.session && req.session.user) {
      const uId = String(req.session.user.id);
      const isOwnerInList = ['691044838459834430', '1068278933532983370'].includes(uId);
      const badges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
      const hasAdminBadge = badges.some(b => {
        const val = (typeof b === 'string' ? b : (b.key || b.id || '')).toLowerCase().trim();
        return ['admin', 'staff', 'veloqra_staff'].includes(val);
      });
      isStaffOrAdmin = isOwnerInList || hasAdminBadge;
    }

    res.render('store/index', {
      page: 'store',
      user: req.session ? req.session.user : null,
      items: items || [],
      currentSearch: q || '',
      currentType: type || 'all',
      isStaffOrAdmin
    });
  } catch (err) {
    console.error('Store loading error:', err);
    res.status(500).send('خطأ في تحميل المتجر');
  }
});

app.post('/store/validate-cart', async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.json({ validIds: [] });
    }

    const existingItems = await StoreItem.find({
      _id: { $in: itemIds },
      status: { $in: ['active', 'sold'] }
    }).select('_id').lean();

    const validIds = existingItems.map(item => String(item._id));
    res.json({ validIds });
  } catch (err) {
    res.status(500).json({ validIds: [] });
  }
});

app.get('/store/publish', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/discord');
  }
  res.render('store/publish', {
    page: 'store-publish',
    user: req.session.user
  });
});

app.get('/store/product/:id', async (req, res) => {
  try {
    const item = await StoreItem.findById(req.params.id).lean();
    if (!item) {
      return res.status(404).render('404', {
        title: 'المنتج غير موجود',
        message: 'عذراً، لم نتمكن من العثور على هذا المنتج أو قد تم حذفه.'
      });
    }

    let isStaffOrAdmin = false;
    if (req.session && req.session.user) {
      const uId = String(req.session.user.id);
      const dbUser = await DiscordUser.findOne({ discordId: uId }).lean();
      const isOwnerInList = ['691044838459834430', '1068278933532983370'].includes(uId);
      const badges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
      const hasAdminBadge = badges.some(b => {
        const val = (typeof b === 'string' ? b : (b.key || b.id || '')).toLowerCase().trim();
        return ['admin', 'staff', 'veloqra_staff'].includes(val);
      });
      isStaffOrAdmin = isOwnerInList || hasAdminBadge;
    }

    const isOwner = req.session && req.session.user && String(req.session.user.id) === String(item.seller.discordId);

    res.render('store/product', {
      page: 'store-product',
      user: req.session ? req.session.user : null,
      item,
      canManage: isOwner || isStaffOrAdmin
    });
  } catch (err) {
    console.error('Store product detail error:', err);
    res.status(500).send('خطأ في جلب تفاصيل المنتج');
  }
});

// 1. مسار فتح وعرض صفحة تعديل المنتج (GET)
app.get('/store/edit/:id', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/discord');
  }

  try {
    const item = await StoreItem.findById(req.params.id).lean();
    if (!item) {
      return res.status(404).render('404', {
        title: 'المنتج غير موجود',
        message: 'المنتج المطلوب تعديله غير موجود أو قد تم حذفه.'
      });
    }

    const discordId = req.session.user.id;
    const dbUser = await DiscordUser.findOne({ discordId }).lean();
    const isOwner = String(item.seller.discordId) === String(discordId);
    const badges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
    const isStaff = ['691044838459834430', '1068278933532983370'].includes(String(discordId)) || badges.some(b => {
      const val = (typeof b === 'string' ? b : (b.key || b.id || '')).toLowerCase().trim();
      return ['admin', 'staff', 'veloqra_staff'].includes(val);
    });

    if (!isOwner && !isStaff) {
      return res.status(403).render('404', {
        title: 'غير مصرح',
        message: 'لا تملك صلاحية لتعديل هذا المنتج.'
      });
    }

    res.render('store/edit', {
      page: 'store-edit',
      user: req.session.user,
      item
    });
  } catch (err) {
    console.error('Store edit load error:', err);
    res.status(500).send('خطأ في تحميل صفحة التعديل');
  }
});

app.post('/store/create', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'يجب عليك تسجيل الدخول أولاً' });
  }

  try {
    const { title, description, category, type, quantity, images, currencies, subItems, requireLogin, requirePhoneNumber } = req.body;

    if (!title || title.trim().length === 0 || title.trim().length > 40) {
      return res.status(400).json({ success: false, message: 'العنوان مطلوب ولا يتجاوز 40 حرفاً' });
    }

    if (description && description.trim().length > 800) {
      return res.status(400).json({ success: false, message: 'الوصف يجب ألا يتجاوز 800 حرف' });
    }

    let cleanImages = Array.isArray(images) 
      ? images.map(url => String(url).trim()).filter(url => url.length > 0)
      : [];
    if (cleanImages.length > 10) cleanImages = cleanImages.slice(0, 10);
    if (cleanImages.length === 0) cleanImages = ['/logo.png'];

    let singlePricing = { allowedCurrencies: [] };
    let cleanSubItems = [];

    if (type === 'single') {
      singlePricing.allowedCurrencies = Array.isArray(currencies) ? currencies : [];
      if (singlePricing.allowedCurrencies.length === 0) {
        return res.status(400).json({ success: false, message: 'يرجى تحديد سعر واحد على الأقل' });
      }
    } else {
      cleanSubItems = (Array.isArray(subItems) ? subItems : []).map(s => ({
        title: s.title,
        description: s.description || '',
        quantity: s.quantity !== undefined ? Number(s.quantity) : 1,
        allowedCurrencies: Array.isArray(s.allowedCurrencies) 
          ? s.allowedCurrencies 
          : [{ currency: s.currency, price: Number(s.price) || 0 }],
        isSold: false
      }));
      if (cleanSubItems.length === 0) {
        return res.status(400).json({ success: false, message: 'يرجى إضافة عناصر متعددة للبيع' });
      }
    }

    const newItem = await StoreItem.create({
      title: title.trim(),
      description: (description || '').trim(),
      category: category || 'general',
      type: type || 'single',
      quantity: Number(quantity) === -1 ? -1 : Math.max(1, Number(quantity) || 1),
      images: cleanImages,
      requireLogin: requireLogin === true || requireLogin === 'true',
      requirePhoneNumber: requirePhoneNumber === true || requirePhoneNumber === 'true',
      seller: {
        discordId: req.session.user.id,
        username: req.session.user.global_name || req.session.user.username,
        avatar: req.session.user.avatar || '/logo.png'
      },
      singlePricing,
      subItems: cleanSubItems,
      status: 'active'
    });

    res.json({ success: true, message: 'تم نشر المنتج بنجاح!', itemId: newItem._id });
  } catch (err) {
    console.error('Store publish error:', err);
    res.status(500).json({ success: false, message: 'فشل في نشر المنتج بقاعدة البيانات' });
  }
});

// 1. مسار فتح وعرض صفحة تعديل المنتج (GET)
app.get('/store/edit/:id', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/discord');
  }

  try {
    const item = await StoreItem.findById(req.params.id).lean();
    if (!item) {
      return res.status(404).render('404', {
        title: 'المنتج غير موجود',
        message: 'المنتج المطلوب تعديله غير موجود أو قد تم حذفه.'
      });
    }

    const discordId = req.session.user.id;
    const dbUser = await DiscordUser.findOne({ discordId }).lean();
    const isOwner = String(item.seller.discordId) === String(discordId);
    const badges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
    const isStaff = ['691044838459834430', '1068278933532983370'].includes(String(discordId)) || badges.some(b => {
      const val = (typeof b === 'string' ? b : (b.key || b.id || '')).toLowerCase().trim();
      return ['admin', 'staff', 'veloqra_staff'].includes(val);
    });

    if (!isOwner && !isStaff) {
      return res.status(403).render('404', {
        title: 'غير مصرح',
        message: 'لا تملك صلاحية لتعديل هذا المنتج.'
      });
    }

    res.render('store/edit', {
      page: 'store-edit',
      user: req.session.user,
      item
    });
  } catch (err) {
    console.error('Store edit load error:', err);
    res.status(500).send('خطأ في تحميل صفحة التعديل');
  }
});

// 2. مسار حفظ ومعالجة التعديلات والأسعار (POST)
app.post('/store/edit/:id', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: 'غير مصرح' });
  try {
    const item = await StoreItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });

    const discordId = req.session.user.id;
    const dbUser = await DiscordUser.findOne({ discordId }).lean();
    const isOwner = String(item.seller.discordId) === String(discordId);
    const badges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
    const isStaff = ['691044838459834430', '1068278933532983370'].includes(String(discordId)) || badges.some(b => {
      const val = (typeof b === 'string' ? b : (b.key || b.id || '')).toLowerCase().trim();
      return ['admin', 'staff', 'veloqra_staff'].includes(val);
    });

    if (!isOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'لا تملك صلاحية تعديل هذا المنتج' });
    }

    const { title, description, quantity, requireLogin, requirePhoneNumber, currencies, subItems } = req.body;

    if (title) item.title = title.trim().slice(0, 40);
    if (description !== undefined) item.description = description.trim().slice(0, 800);
    
    if (requireLogin !== undefined) {
      item.requireLogin = requireLogin === true || requireLogin === 'true';
    }
    if (requirePhoneNumber !== undefined) {
      item.requirePhoneNumber = requirePhoneNumber === true || requirePhoneNumber === 'true';
    }

    if (item.type === 'single') {
      if (quantity !== undefined) {
        const qVal = Number(quantity);
        item.quantity = qVal === -1 ? -1 : Math.max(0, qVal);
        item.status = (item.quantity === -1 || item.quantity > 0) ? 'active' : 'sold';
      }
      if (Array.isArray(currencies) && currencies.length > 0) {
        item.singlePricing = {
          allowedCurrencies: currencies.map(c => ({
            currency: c.currency,
            price: Number(c.price) || 0
          })).filter(c => c.price > 0)
        };
      }
    } else if (item.type === 'multi') {
      if (Array.isArray(subItems)) {
        item.subItems = subItems.map(s => {
          const sQty = Number(s.quantity) === -1 ? -1 : Math.max(0, Number(s.quantity) || 0);
          const validCurrs = (Array.isArray(s.allowedCurrencies) ? s.allowedCurrencies : [])
            .map(c => ({ currency: c.currency, price: Number(c.price) || 0 }))
            .filter(c => c.price > 0);

          return {
            _id: s.id || s._id || new mongoose.Types.ObjectId(),
            title: s.title ? s.title.trim() : 'عنصر',
            description: s.description ? s.description.trim() : '',
            quantity: sQty,
            currency: validCurrs.length > 0 ? validCurrs[0].currency : 'SYP_CASH',
            price: validCurrs.length > 0 ? validCurrs[0].price : 0,
            allowedCurrencies: validCurrs,
            isSold: sQty !== -1 && sQty <= 0
          };
        });

        const hasAnyAvailable = item.subItems.some(s => s.quantity === -1 || s.quantity > 0);
        item.status = hasAnyAvailable ? 'active' : 'sold';
      }
    }

    item.markModified('singlePricing');
    item.markModified('subItems');
    item.markModified('requirePhoneNumber');
    item.markModified('requireLogin');

    await item.save();
    res.json({ success: true, message: 'تم حفظ كافة التعديلات والأسعار بنجاح!' });
  } catch (err) {
    console.error('Edit product error:', err);
    res.status(500).json({ success: false, message: 'فشل التعديل، تأكد من صحة البيانات' });
  }
});

app.get('/admin/faq', requireStaffAuth, (req, res) => {
  res.render('admin/faq', {
    page: 'admin-faq',
    user: req.session.user
  });
});

app.post('/store/delete/:id', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: 'غير مصرح' });
  try {
    const item = await StoreItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });

    const discordId = req.session.user.id;
    const dbUser = await DiscordUser.findOne({ discordId }).lean();
    const isOwner = String(item.seller.discordId) === String(discordId);
    const badges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
    const isStaff = ['691044838459834430', '1068278933532983370'].includes(String(discordId)) || badges.some(b => {
      const val = (typeof b === 'string' ? b : (b.key || b.id || '')).toLowerCase().trim();
      return ['admin', 'staff', 'veloqra_staff'].includes(val);
    });

    if (!isOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'لا تملك صلاحية حذف هذا المنتج' });
    }

    await StoreItem.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'تم حذف المنتج من المتجر بنجاح!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل الحذف' });
  }
});

app.post('/store/toggle-pin/:id', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ success: false, message: 'غير مصرح' });
  try {
    const discordId = String(req.session.user.id);
    const dbUser = await DiscordUser.findOne({ discordId }).lean();
    const badges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
    const isStaff = ['691044838459834430', '1068278933532983370'].includes(discordId) || badges.some(b => {
      const val = (typeof b === 'string' ? b : (b.key || b.id || '')).toLowerCase().trim();
      return ['admin', 'staff', 'veloqra_staff'].includes(val);
    });

    if (!isStaff) return res.status(403).json({ success: false, message: 'هذه الصلاحية للإدارة فقط' });

    const item = await StoreItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });

    item.isPinned = !item.isPinned;
    await item.save();

    res.json({ success: true, isPinned: item.isPinned, message: item.isPinned ? 'تم تثبيت الإعلان في المقدمة بنجاح!' : 'تم إلغاء تثبيت الإعلان' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تعديل التثبيت' });
  }
});

// مسار الدفع والطلب (إرسال الإشعار لجميع المشتركين في تيليجرام)
app.post('/store/checkout', async (req, res) => {
  try {
    const { items, useMiddleman, middlemanPaymentMethod, middlemanFee, guestContact, buyerPhoneNumber } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'سلة الشراء فارغة' });
    }

    const isLogged = req.session && req.session.user;
    const hasRestrictedItem = items.some(i => i.requireLogin === true || i.requireLogin === 'true');

    if (isLogged) {
      const ownsAnyItem = items.some(i => String(i.sellerDiscordId) === currentUserId);
      if (ownsAnyItem) {
        return res.status(400).json({ success: false, message: 'لا يمكنك شراء منتج خاص بك' });
      }
    }

    if (hasRestrictedItem && !isLogged) {
      return res.status(401).json({ success: false, message: 'يتطلب أحد المنتجات في السلة تسجيل الدخول لإتمام الطلب' });
    }

    if (!isLogged && (!guestContact || !guestContact.trim())) {
      return res.status(400).json({ success: false, message: 'يرجى كتابة وسيلة تواصل لإتمام الطلب' });
    }

    const orderItems = [];
    const totals = {};

    for (const i of items) {
      const base = Number(i.price) || 0;
      const requestedQty = Number(i.qty) || 1;
      const finalP = base * requestedQty;

      const storeItem = await StoreItem.findById(i.parentItemId);
      if (!storeItem) {
        return res.status(400).json({
          success: false,
          message: `عذراً، المنتج "${i.title}" تم حذفه من المتجر`
        });
      }

      if (storeItem.type === 'single') {
        if (storeItem.quantity !== -1) {
          if (storeItem.quantity < requestedQty) {
            return res.status(400).json({
              success: false,
              message: `نفذت الكمية للمنتج: "${storeItem.title}". المتوفر حالياً: ${storeItem.quantity}`
            });
          }
          storeItem.quantity -= requestedQty;
          if (storeItem.quantity <= 0) {
            storeItem.quantity = 0;
            storeItem.status = 'sold';
          }
        }
      } else if (storeItem.type === 'multi' && i.subItemId && Array.isArray(storeItem.subItems)) {
        const sub = storeItem.subItems.find(s => String(s._id) === String(i.subItemId));
        if (sub) {
          if (sub.quantity !== -1 && sub.quantity !== undefined) {
            if (sub.quantity < requestedQty) {
              return res.status(400).json({
                success: false,
                message: `نفذت الكمية للعنصر: "${sub.title}". المتوفر: ${sub.quantity}`
              });
            }
            sub.quantity -= requestedQty;
            if (sub.quantity <= 0) {
              sub.quantity = 0;
              sub.isSold = true;
            }
          }
        }

        const hasAvailableSub = storeItem.subItems.some(s => s.quantity === -1 || s.quantity > 0);
        if (!hasAvailableSub) {
          storeItem.status = 'sold';
        }
      }

      await storeItem.save();

      let titleWithPhone = i.title;
      if (buyerPhoneNumber && buyerPhoneNumber.trim()) {
        titleWithPhone += ` [رقم المستلم: ${buyerPhoneNumber.trim()}]`;
      }

      orderItems.push({
        parentItemId: i.parentItemId,
        subItemId: i.subItemId || null,
        title: titleWithPhone,
        currency: i.currency,
        basePrice: base,
        finalPrice: finalP,
        qty: requestedQty
      });

      totals[i.currency] = (totals[i.currency] || 0) + finalP;
    }

    const buyerData = isLogged ? {
      discordId: req.session.user.id,
      username: req.session.user.global_name || req.session.user.username,
      avatar: req.session.user.avatar || '/logo.png'
    } : {
      discordId: 'guest',
      username: `زائر (${guestContact.trim()})`,
      avatar: '/logo.png'
    };

    const newOrder = await StoreOrder.create({
      orderId: 'VELO-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      buyer: buyerData,
      seller: {
        discordId: items[0].sellerDiscordId,
        username: items[0].sellerUsername || 'Seller',
        avatar: items[0].sellerAvatar || '/logo.png'
      },
      useMiddleman: Boolean(useMiddleman),
      middlemanPaymentMethod: useMiddleman ? middlemanPaymentMethod : null,
      middlemanFee: useMiddleman ? (Number(middlemanFee) || 0) : 0,
      items: orderItems,
      currencyTotals: totals,
      status: 'pending'
    });

    // إرسال الإشعار لتيليجرام لجميع المسجلين وانتظار اكتمال البث
    await notifyAllSubscribers(newOrder);

    res.json({ success: true, message: 'تم إرسال طلب الشراء بنجاح وهو قيد التدقيق!', orderId: newOrder.orderId });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة الطلب' });
  }
});

// باقي المسارات
app.get('/team', async (req, res) => {
    try {
        const [teamAbouts, allBadges, staffUsers] = await Promise.all([
            TeamAbout.find().lean(),
            Badge.find().lean(),
            DiscordUser.find().lean()
        ]);
        res.render('team', { 
            page: 'team',
            teamAbouts: teamAbouts || [],
            systemBadges: allBadges || [],
            discordUsers: staffUsers || []
        });
    } catch (err) {
        res.render('team', { page: 'team', teamAbouts: [], systemBadges: [], discordUsers: [] });
    }
});

app.get('/login', (req, res) => {
    if (req.session && req.session.user) return res.redirect('/profile');
    res.redirect('/auth/discord');
});

app.get('/profile', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/login');

    try {
        const discordId = req.session.user.id;
        const [userOrders, existingRecord, allJobs, dbUser, allBadges, storeBuyerOrders] = await Promise.all([
            Order.find({ userId: discordId }).sort({ createdAt: -1 }).lean(),
            Seller.findOne({ discordId }).lean(),
            Job.find({ "applications.userId": discordId }).lean(),
            DiscordUser.findOne({ discordId }).lean(),
            Badge.find().lean(),
            StoreOrder.find({ "buyer.discordId": discordId }).sort({ createdAt: -1 }).lean()
        ]);

        const userJobApplications = [];
        (allJobs || []).forEach(j => {
            (j.applications || []).forEach(appItem => {
                if (appItem.userId === discordId) {
                    userJobApplications.push({
                        jobTitle: j.title,
                        icon: j.icon,
                        status: appItem.status,
                        appliedAt: appItem.appliedAt
                    });
                }
            });
        });

        let sellerData = existingRecord;
        let isVerified = Boolean(sellerData && sellerData.isVerifiedSeller) || VELOQRA_STAFF_IDS.includes(discordId);

        if (!sellerData) {
            sellerData = {
                discordId: discordId,
                username: req.session.user.global_name || req.session.user.username,
                avatar: req.session.user.avatar || '/logo.png',
                isVerifiedSeller: isVerified,
                veloCoins: 0,
                salesCount: 0,
                violations: [],
                purchases: [],
                ads: []
            };
        }

        let userBadgeKeys = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];

        res.render('profile', { 
            page: 'profile',
            user: req.session.user,
            orders: userOrders || [],
            jobApplications: userJobApplications,
            storeBuyerOrders: storeBuyerOrders || [],
            seller: sellerData,
            isVerified: isVerified,
            userBadges: userBadgeKeys,
            systemBadges: allBadges || []
        });
    } catch (err) {
        console.error("Profile load error:", err);
        res.render('profile', { 
            page: 'profile',
            user: req.session.user,
            orders: [],
            jobApplications: [],
            storeBuyerOrders: [],
            seller: { veloCoins: 0, salesCount: 0, violations: [], purchases: [], ads: [] },
            isVerified: false,
            userBadges: [],
            systemBadges: []
        });
    }
});

app.get('/users', async (req, res) => {
    try {
        const [users, teamAbouts, allBadges, verifiedSellers] = await Promise.all([
            DiscordUser.find().sort({ lastLogin: -1 }).lean(),
            TeamAbout.find().lean(),
            Badge.find().lean(),
            Seller.find({ isVerifiedSeller: true }).select('discordId').lean()
        ]);

        const verifiedIds = new Set((verifiedSellers || []).map(s => String(s.discordId)));
        VELOQRA_STAFF_IDS.forEach(id => verifiedIds.add(String(id)));

        const enrichedUsers = (users || []).map(u => {
            const badgesList = Array.isArray(u.badges) ? [...u.badges] : [];
            const uid = String(u.discordId);

            if (verifiedIds.has(uid) && !badgesList.includes('verified_seller')) {
                badgesList.push('verified_seller');
            }

            return { ...u, badges: badgesList };
        });

        res.render('users', { 
            page: 'users',
            users: enrichedUsers || [],
            teamAbouts: teamAbouts || [],
            systemBadges: allBadges || []
        });
    } catch (err) {
        console.error("Users load error:", err);
        res.render('users', { page: 'users', users: [], teamAbouts: [], systemBadges: [] });
    }
});

app.get('/users/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        const cleanId = identifier.trim().toLowerCase();

        const targetUser = await DiscordUser.findOne({
            $or: [
                { discordId: identifier },
                { customSlug: cleanId },
                { username: cleanId }
            ]
        }).lean();

        if (!targetUser) {
            return res.status(404).render('404', {
                title: 'المستخدم غير موجود',
                message: 'لم نتمكن من العثور على هذا العضو في قاعدة البيانات.'
            });
        }

        const [teamAbouts, allBadges, sellerRecord] = await Promise.all([
            TeamAbout.find().lean(),
            Badge.find().lean(),
            Seller.findOne({ discordId: targetUser.discordId }).lean()
        ]);

        let userAbout = (targetUser.about || '').trim();
        const cleanTag = (targetUser.username || '').replace(/^@/, '').toLowerCase().trim();
        const foundAbout = (teamAbouts || []).find(item => item && item.tag === cleanTag);
        if (foundAbout && foundAbout.about && foundAbout.about.trim().length > 0) {
            userAbout = foundAbout.about.trim();
        }

        const badgesMap = {};
        (allBadges || []).forEach(b => {
            if (b && b.key) {
                badgesMap[b.key.trim().toLowerCase()] = {
                    key: b.key.trim().toLowerCase(),
                    name: b.name || b.key,
                    icon: b.icon || 'military_tech',
                    color: b.color || '#3b82f6',
                    description: b.description || ''
                };
            }
        });

        const userBadgesList = Array.isArray(targetUser.badges) ? targetUser.badges : [];
        const userBadgesDetails = userBadgesList.map(item => {
            const k = (typeof item === 'string' ? item : (item.key || '')).trim().toLowerCase();
            return badgesMap[k] || {
                key: k,
                name: k.replace(/_/g, ' '),
                icon: 'military_tech',
                color: '#3b82f6',
                description: ''
            };
        });

        const isFromRef = req.query.ref === 'users';
        const referer = req.headers.referer || '';
        const fromUsers = isFromRef || referer.includes('/users');

        res.render('user-detail', {
            targetUser,
            userAbout,
            userBadgesDetails,
            fromUsers
        });
    } catch (err) {
        console.error("User Detail Error:", err);
        res.status(500).send("خطأ في تحميل صفحة العضو");
    }
});

app.get('/jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 }).lean();
        res.render('jobs', { 
            page: 'jobs', 
            jobs: jobs || [],
            user: req.session ? req.session.user : null
        });
    } catch (err) {
        console.error("Jobs Fetch Error:", err);
        res.status(500).send("خطأ في جلب قائمة الوظائف");
    }
});

const handleJobApplication = async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }
    try {
        const { jobId, fullName, applicantName, age, applicantAge, experience, reason, portfolio } = req.body;
        const discordId = req.session.user.id;

        const candidateName = (fullName || applicantName || req.session.user.global_name || req.session.user.username || '').trim();
        const candidateAge = Number(age || applicantAge) || 18;

        const application = {
            userId: discordId,
            username: req.session.user.global_name || req.session.user.username,
            avatar: req.session.user.avatar || '/logo.png',
            fullName: candidateName,
            age: candidateAge,
            experience: (experience || '').trim(),
            reason: (reason || '').trim(),
            portfolio: (portfolio || '').trim(),
            status: 'pending',
            appliedAt: new Date()
        };

        await Job.findByIdAndUpdate(jobId, {
            $push: { applications: application }
        });

        res.redirect('/profile');
    } catch (err) {
        console.error("Job Application Submit Error:", err);
        res.status(500).send("خطأ أثناء تقديم طلب التوظيف");
    }
};

app.post('/jobs/apply', handleJobApplication);
app.post('/admin/jobs/apply', handleJobApplication);

app.get('/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/login');

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: DISCORD_REDIRECT_URI,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = tokenResponse.data.access_token;

        const [userResponse, userGuildsResponse] = await Promise.all([
            axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            }),
            axios.get('https://discord.com/api/users/@me/guilds', {
                headers: { Authorization: `Bearer ${accessToken}` }
            })
        ]);

        const discordUser = userResponse.data;
        const allUserGuilds = userGuildsResponse.data || [];

        const userAdminGuilds = allUserGuilds.filter(g => {
            const perms = BigInt(g.permissions);
            const isOwner = Boolean(g.owner);
            const isAdmin = (perms & BigInt(0x8)) === BigInt(0x8);
            const isManage = (perms & BigInt(0x20)) === BigInt(0x20);
            return isOwner || isAdmin || isManage;
        });

        let finalEligibleGuilds = [];
        if (DISCORD_BOT_TOKEN) {
            try {
                const botGuildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
                    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
                });
                const botGuildIds = new Set((botGuildsResponse.data || []).map(g => g.id));
                finalEligibleGuilds = userAdminGuilds.filter(g => botGuildIds.has(g.id));
            } catch (botErr) {
                finalEligibleGuilds = userAdminGuilds;
            }
        } else {
            finalEligibleGuilds = userAdminGuilds;
        }

        const formattedGuilds = finalEligibleGuilds.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.icon 
                ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` 
                : '/logo.png'
        }));

        const userAvatar = discordUser.avatar 
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : '/logo.png';

        await DiscordUser.findOneAndUpdate(
            { discordId: discordUser.id },
            {
                username: discordUser.username,
                globalName: discordUser.global_name || discordUser.username,
                avatar: userAvatar,
                guilds: formattedGuilds,
                lastLogin: new Date()
            },
            { upsert: true, returnDocument: 'after' }
        );

        req.session.user = {
            id: discordUser.id,
            username: discordUser.username,
            global_name: discordUser.global_name || discordUser.username,
            avatar: userAvatar
        };

        res.redirect('/profile');
    } catch (err) {
        console.error('Discord Auth Error:', err.response?.data || err.message);
        res.redirect('/login?error=failed');
    }
});

app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
});

app.get('/admin', requireStaffAuth, async (req, res) => {
    try {
        const [sellersCount, usersCount, badgesCount, jobsCount] = await Promise.all([
            Seller.countDocuments({ isVerifiedSeller: true }),
            DiscordUser.countDocuments(),
            Badge.countDocuments(),
            Job.countDocuments()
        ]);

        res.render('admin/index', {
            page: 'admin-home',
            activeTab: 'home',
            user: req.session.user,
            isMasterAdmin: req.isMasterAdmin,
            stats: { sellersCount, usersCount, badgesCount, jobsCount }
        });
    } catch (err) {
        res.status(500).send("خطأ في تحميل لوحة الإدارة");
    }
});

app.get('/admin/wallets', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const [sellers, discordUsers] = await Promise.all([
            Seller.find().sort({ veloCoins: -1 }).lean(),
            DiscordUser.find().sort({ lastLogin: -1 }).lean()
        ]);

        const usersMap = {};
        (discordUsers || []).forEach(u => {
            usersMap[u.discordId] = u;
        });

        const enrichedWallets = (sellers || []).map(s => {
            const u = usersMap[s.discordId] || {};
            return {
                discordId: s.discordId,
                username: s.username || u.globalName || u.username || 'عضو فيلوكرا',
                avatar: s.avatar || u.avatar || '/logo.png',
                balance: Number(s.veloCoins || 0)
            };
        });

        res.render('admin/wallets', {
            page: 'admin-wallets',
            activeTab: 'wallets',
            user: req.session.user,
            isMasterAdmin: req.isMasterAdmin,
            wallets: enrichedWallets,
            discordUsers: discordUsers || [],
            msg: req.query.msg || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error("Wallets Admin Load Error:", err);
        res.status(500).send("خطأ في تحميل صفحة إدارة المحافظ");
    }
});

// تحديث أو شحن المحفظة مع التحقق من تسجيل العضو
app.post('/admin/wallets/update', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { discordId, amount, actionType } = req.body;
        if (!discordId) {
            return res.status(400).json({ success: false, message: 'يرجى إدخال ديسكورد آيدي الخاص بالعضو' });
        }

        const cleanId = String(discordId).trim();
        const parsedAmount = parseFloat(amount);

        if (isNaN(parsedAmount) || parsedAmount < 0) {
            return res.status(400).json({ success: false, message: 'القيمة المدخلة غير صالحة، يرجى كتابة رقم موجب' });
        }

        // 1. فحص وجود العضو في قاعدة بيانات المسجلين
        const dUser = await DiscordUser.findOne({ discordId: cleanId }).lean();
        if (!dUser) {
            return res.status(404).json({ 
                success: false, 
                message: 'العضو غير موجود أو لم يقم بتسجيل الدخول إلى الموقع عبر ديسكورد حتى الآن!' 
            });
        }

        // 2. تعديل الرصيد
        const seller = await Seller.findOne({ discordId: cleanId });
        let currentBalance = seller ? Number(seller.veloCoins || 0) : 0;
        let newBalance = 0;

        if (actionType === 'add') {
            newBalance = currentBalance + parsedAmount;
        } else if (actionType === 'subtract') {
            newBalance = Math.max(0, currentBalance - parsedAmount);
        } else if (actionType === 'set') {
            newBalance = parsedAmount;
        }

        const finalBalance = parseFloat(newBalance.toFixed(2));

        await Seller.findOneAndUpdate(
            { discordId: cleanId },
            {
                $set: { 
                    veloCoins: finalBalance,
                    username: dUser.globalName || dUser.username,
                    avatar: dUser.avatar || '/logo.png'
                },
                $setOnInsert: {
                    isVerifiedSeller: false,
                    salesCount: 0,
                    violations: [],
                    purchases: [],
                    ads: []
                }
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.json({ 
            success: true, 
            message: 'تم تحديث رصيد المحفظة بنجاح!',
            discordId: cleanId,
            newBalance: finalBalance
        });
    } catch (err) {
        console.error("Wallet Update Error:", err);
        res.status(500).json({ success: false, message: 'حدث خطأ في الخادم أثناء تحديث المحفظة' });
    }
});

// تصفير الرصيد وحذف المحفظة من السجل
app.post('/admin/wallets/delete', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { discordId } = req.body;
        if (!discordId) {
            return res.status(400).json({ success: false, message: 'معرف العضو غير متوفر' });
        }

        const cleanId = String(discordId).trim();

        // تصفير الرصيد وحذف بيانات المحفظة
        await Seller.findOneAndUpdate(
            { discordId: cleanId },
            { $set: { veloCoins: 0 } }
        );

        res.json({ success: true, message: 'تم تصفير رصيد المحفظة وإزالتها من القائمة بنجاح!' });
    } catch (err) {
        console.error("Wallet Delete Error:", err);
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء محاولة إزالة المحفظة' });
    }
});

app.get('/admin/requests', requireStaffAuth, async (req, res) => {
    try {
        const [sellers, customOrders, storeOrders, discordUsers] = await Promise.all([
            Seller.find().lean(),
            Order.find().sort({ createdAt: -1 }).lean(),
            StoreOrder.find().sort({ createdAt: -1 }).lean(),
            DiscordUser.find().lean()
        ]);

        const usersMap = {};
        (discordUsers || []).forEach(u => {
            usersMap[String(u.discordId)] = u;
        });

        // ربط صورة العضو واسمه بطلب الشحن
        const enrichedCustomOrders = (customOrders || []).map(ord => {
            const u = usersMap[String(ord.userId)] || {};
            return {
                ...ord,
                userAvatar: u.avatar || '/logo.png',
                userName: u.globalName || u.username || `User_${String(ord.userId).slice(0, 5)}`
            };
        });

        const pendingAds = [];
        const approvedAds = [];

        (sellers || []).forEach(seller => {
            (seller.ads || []).forEach(ad => {
                const item = {
                    sellerId: seller._id,
                    sellerDiscordId: seller.discordId,
                    sellerName: seller.username,
                    sellerAvatar: seller.avatar || '/logo.png',
                    ad
                };
                if (ad.status === 'pending') pendingAds.push(item);
                if (ad.status === 'approved') approvedAds.push(item);
            });
        });

        res.render('admin/requests', {
            page: 'admin-requests',
            activeTab: 'requests',
            user: req.session.user,
            isMasterAdmin: req.isMasterAdmin,
            customOrders: enrichedCustomOrders,
            pendingAds,
            approvedAds,
            storeOrders: storeOrders || []
        });
    } catch (err) {
        console.error("Requests Load Error:", err);
        res.status(500).send("خطأ أثناء تحميل صفحة إدارة الطلبات");
    }
});

app.post('/admin/requests/action', requireStaffAuth, async (req, res) => {
    try {
        const { sellerId, adId, action } = req.body;
        if (!sellerId || !adId || !action) return res.redirect('/admin/requests');

        if (action === 'approve') {
            await Seller.updateOne({ _id: sellerId, "ads._id": adId }, { $set: { "ads.$.status": "approved" } });
        } else if (action === 'reject') {
            await Seller.updateOne({ _id: sellerId, "ads._id": adId }, { $set: { "ads.$.status": "rejected" } });
        } else if (action === 'delete') {
            await Seller.findByIdAndUpdate(sellerId, { $pull: { ads: { _id: adId } } });
        }

        res.redirect('/admin/requests');
    } catch (err) {
        console.error("Request Action Error:", err);
        res.redirect('/admin/requests');
    }
});


app.post('/admin/orders/action', requireStaffAuth, async (req, res) => {
    try {
        const { orderId, action } = req.body;
        if (!orderId || !action) return res.redirect('/admin/requests');

        if (action === 'approve') {
            const ord = await Order.findById(orderId);
            if (ord) {
                ord.status = 'approved';
                await ord.save();

                // فحص إذا كان الطلب شحن رصيد
                const isChargeOrder = (ord.siteName && ord.siteName.includes('شحن')) || 
                                      (ord.plan && ord.plan.includes('VeloCoin'));

                if (isChargeOrder) {
                    let addedCoins = 100;
                    if (ord.plan && ord.plan.includes('VeloCoin_')) {
                        addedCoins = Number(ord.plan.replace('VeloCoin_', '')) || 100;
                    } else if (ord.siteName && ord.siteName.match(/\d+/)) {
                        addedCoins = Number(ord.siteName.match(/\d+/)[0]) || 100;
                    }

                    const dollarValue = addedCoins / 100;
                    const uIdStr = String(ord.userId).trim();

                    // جلب بيانات العضو الأساسية
                    const dUser = await DiscordUser.findOne({ discordId: uIdStr }).lean();

                    const purchaseItem = {
                        productName: `شحن رصيد (${addedCoins.toLocaleString()} Velo Coin)`,
                        sellerName: 'Veloqra Official',
                        price: ord.price || `${dollarValue} $`,
                        currency: 'VeloCoin',
                        qty: 1,
                        date: new Date()
                    };

                    // إيداع الرصيد وتحديث مصفوفة المشتريات + زيادة عداد المبيعات salesCount
                    await Seller.findOneAndUpdate(
                        { discordId: uIdStr },
                        {
                            $set: {
                                username: dUser ? (dUser.globalName || dUser.username) : 'عضو فيلوكرا',
                                avatar: dUser ? dUser.avatar : '/logo.png'
                            },
                            $inc: { 
                                veloCoins: dollarValue,
                                salesCount: 1  // تم التفعيل: يزيد عدد المبيعات في البروفايل فوراً
                            },
                            $push: { purchases: purchaseItem }
                        },
                        { upsert: true, returnDocument: 'after' }
                    );
                }
            }
        } else if (action === 'reject') {
            await Order.findByIdAndUpdate(orderId, { status: 'rejected' });
        } else if (action === 'delete') {
            await Order.findByIdAndDelete(orderId);
        }

        res.redirect('/admin/requests');
    } catch (err) {
        console.error("Order Action Error:", err);
        res.redirect('/admin/requests');
    }
});

// ==================== معالجة إجراءات طلبات المتجر ==================== //
app.post('/admin/store-orders/action', requireStaffAuth, async (req, res) => {
  try {
    const { orderId, action } = req.body;
    if (!orderId || !action) return res.redirect('/admin/requests');

    const stOrder = await StoreOrder.findById(orderId);
    if (!stOrder) return res.redirect('/admin/requests');

    if (action === 'approve' || action === 'complete') {
      stOrder.status = 'completed';
      await stOrder.save();

      // 1. زيادة عدد مبيعات البائع salesCount
      if (stOrder.seller?.discordId) {
        await Seller.findOneAndUpdate(
          { discordId: String(stOrder.seller.discordId) },
          { $inc: { salesCount: 1 } },
          { upsert: true }
        );
      }

      // 2. ترحيل الطلب إلى سجل مشتريات المشتري (إذا كان مسجلاً وليس زائراً)
      if (stOrder.buyer?.discordId && stOrder.buyer.discordId !== 'guest') {
        const purchasesToAdd = (stOrder.items || []).map(it => ({
          productName: it.title,
          sellerName: stOrder.seller?.username || 'بائع فيلوكرا',
          price: `${it.finalPrice} ${it.currency}`,
          currency: it.currency,
          qty: it.qty || 1,
          date: new Date()
        }));

        await Seller.findOneAndUpdate(
          { discordId: String(stOrder.buyer.discordId) },
          { 
            $set: {
              username: stOrder.buyer.username,
              avatar: stOrder.buyer.avatar || '/logo.png'
            },
            $push: { purchases: { $each: purchasesToAdd } } 
          },
          { upsert: true }
        );
      }

    } else if (action === 'reject') {
      stOrder.status = 'rejected';
      await stOrder.save();

      // إعادة الكميات المستهلكة إلى المخزن تلقائياً
      for (const it of (stOrder.items || [])) {
        const storeItem = await StoreItem.findById(it.parentItemId);
        if (storeItem) {
          const returnQty = Number(it.qty) || 1;
          if (storeItem.type === 'single') {
            if (storeItem.quantity !== -1) {
              storeItem.quantity += returnQty;
              storeItem.status = 'active';
            }
          } else if (storeItem.type === 'multi' && it.subItemId) {
            const sub = (storeItem.subItems || []).find(s => String(s._id) === String(it.subItemId));
            if (sub && sub.quantity !== -1) {
              sub.quantity += returnQty;
              sub.isSold = false;
              storeItem.status = 'active';
            }
          }
          await storeItem.save();
        }
      }

    } else if (action === 'delete') {
      await StoreOrder.findByIdAndDelete(orderId);
    }

    res.redirect('/admin/requests');
  } catch (err) {
    console.error("Store Order Action Error:", err);
    res.redirect('/admin/requests');
  }
});

app.get('/admin/users-custom', requireStaffAuth, async (req, res) => {
    try {
        const [users, allBadges] = await Promise.all([
            DiscordUser.find().sort({ lastLogin: -1 }).lean(),
            Badge.find().lean()
        ]);
        res.render('admin/users-custom', {
            page: 'admin-users-custom',
            activeTab: 'users-custom',
            user: req.session.user,
            isMasterAdmin: req.isMasterAdmin,
            users: users || [],
            allBadges: allBadges || []
        });
    } catch (err) {
        res.status(500).send("خطأ في جلب بيانات الأعضاء");
    }
});

app.post('/admin/users-custom/save', requireStaffAuth, async (req, res) => {
    try {
        const {
            discordId,
            customSlug,
            themeEnabled,
            bgType,
            bgValue,
            cardBg,
            cardBlur,
            textColor,
            accentColor,
            fontFamily,
            customCursorUrl,
            audioUrl,
            customCss,
            customTextsRaw,
            socialLinksRaw,
            userBadges
        } = req.body;

        if (!discordId) return res.redirect('/admin/users-custom');

        const customTexts = [];
        if (customTextsRaw && customTextsRaw.trim()) {
            customTextsRaw.split('\n').forEach(line => {
                if (!line.trim()) return;
                const parts = line.split(',').map(p => p.trim());
                
                if (parts[0].toLowerCase() === 'img' || parts[0].toLowerCase() === 'image') {
                    const imgUrl = parts[1] || '';
                    const isNewLine = parts.length >= 3 && ['nl', 'newline', '1', 'true'].includes(parts[2].toLowerCase());
                    const clickUrl = parts[3] || '';
                    if (imgUrl) {
                        customTexts.push({
                            type: 'image',
                            imageUrl: imgUrl,
                            newLine: isNewLine,
                            linkUrl: clickUrl
                        });
                    }
                } else {
                    if (parts.length >= 2) {
                        const isNewLine = parts.length >= 3 && ['nl', 'newline', '1', 'true'].includes(parts[2].toLowerCase());
                        customTexts.push({
                            type: 'badge',
                            icon: parts[0],
                            text: parts[1],
                            newLine: isNewLine
                        });
                    } else if (parts.length === 1 && parts[0]) {
                        customTexts.push({
                            type: 'badge',
                            icon: 'star',
                            text: parts[0],
                            newLine: false
                        });
                    }
                }
            });
        }

        const socialLinks = [];
        if (socialLinksRaw && socialLinksRaw.trim()) {
            socialLinksRaw.split('\n').forEach(line => {
                const parts = line.split(',').map(p => p.trim());
                if (parts.length >= 3) {
                    socialLinks.push({ platform: parts[0], title: parts[1], url: parts[2] });
                }
            });
        }

        const cleanSlug = (customSlug || '').trim().toLowerCase();
        if (cleanSlug) {
            const existingSlug = await DiscordUser.findOne({ customSlug: cleanSlug, discordId: { $ne: discordId } });
            if (existingSlug) {
                return res.status(400).send("الاسم المخصص مستخدم بالفعل لعضو آخر!");
            }
        }

        const finalBadges = Array.isArray(userBadges) ? userBadges : (userBadges ? [userBadges] : []);

        await DiscordUser.findOneAndUpdate(
            { discordId },
            {
                customSlug: cleanSlug,
                badges: finalBadges,
                customTheme: {
                    enabled: themeEnabled === 'true',
                    bgType: bgType || 'color',
                    bgValue: bgValue || '#0a122c',
                    cardBg: cardBg || 'rgba(255, 255, 255, 0.05)',
                    cardBlur: cardBlur || '16px',
                    textColor: textColor || '#ffffff',
                    accentColor: accentColor || '#ffd000',
                    fontFamily: fontFamily || 'IBM Plex Sans Arabic',
                    customCursorUrl: customCursorUrl || '',
                    audioUrl: audioUrl || '',
                    customCss: customCss || ''
                },
                customTexts: customTexts,
                socialLinks: socialLinks
            }
        );

        res.redirect('/admin/users-custom');
    } catch (err) {
        console.error("Admin Custom Save Error:", err);
        res.status(500).send("خطأ أثناء حفظ التخصيص");
    }
});

app.get('/admin/badges', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const [badges, discordUsers] = await Promise.all([
            Badge.find().sort({ createdAt: -1 }).lean(),
            DiscordUser.find().sort({ lastLogin: -1 }).lean()
        ]);

        res.render('admin/badges', {
            page: 'admin-badges',
            activeTab: 'badges',
            user: req.session.user,
            isMasterAdmin: req.isMasterAdmin,
            badges: badges || [],
            discordUsers: discordUsers || []
        });
    } catch (err) {
        console.error("Badges Admin Load Error:", err);
        res.status(500).send("خطأ في تحميل صفحة إدارة الشارات");
    }
});

app.post('/admin/badges/update', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { badgeId, name, icon, color, colorHex, description } = req.body;
        if (!badgeId || !name) return res.redirect('/admin/badges');

        const badgeColor = color || colorHex || '#3b82f6';

        await Badge.findByIdAndUpdate(badgeId, {
            name: name.trim(),
            icon: (icon || 'military_tech').trim(),
            color: badgeColor,
            description: description ? description.trim() : ''
        });

        res.redirect('/admin/badges?msg=updated');
    } catch (err) {
        console.error("Update Badge Error:", err);
        res.redirect('/admin/badges');
    }
});

app.post('/admin/badges/create', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { key, name, icon, color, colorHex, description } = req.body;
        if (!key || !name) return res.redirect('/admin/badges');

        const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
        const badgeColor = color || colorHex || '#3b82f6';

        await Badge.findOneAndUpdate(
            { key: cleanKey },
            {
                name: name.trim(),
                icon: (icon || 'military_tech').trim(),
                color: badgeColor,
                description: description ? description.trim() : ''
            },
            { upsert: true }
        );

        res.redirect('/admin/badges');
    } catch (err) {
        console.error("Create Badge Error:", err);
        res.redirect('/admin/badges');
    }
});

app.post('/admin/badges/assign', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { discordId, badgeKey } = req.body;
        if (!discordId || !badgeKey) return res.redirect('/admin/badges');

        const cleanId = discordId.toString().trim();
        const cleanBadge = badgeKey.toString().trim();

        const userExists = await DiscordUser.findOne({ discordId: cleanId });
        if (!userExists) {
            await DiscordUser.create({
                discordId: cleanId,
                username: `User_${cleanId.slice(0, 5)}`,
                globalName: 'عضو فيلوكرا',
                avatar: '/logo.png',
                badges: [cleanBadge]
            });
            return res.redirect('/admin/badges');
        }

        await DiscordUser.updateOne({ discordId: cleanId }, { $addToSet: { badges: cleanBadge } }, { strict: false });
        res.redirect('/admin/badges');
    } catch (err) {
        console.error("Assign Badge Error:", err);
        res.redirect('/admin/badges');
    }
});

app.post('/admin/badges/revoke', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { discordId, badgeKey } = req.body;
        if (!discordId || !badgeKey) return res.redirect('/admin/badges');

        await DiscordUser.updateOne({ discordId: discordId.trim() }, { $pull: { badges: badgeKey.trim() } });
        res.redirect('/admin/badges');
    } catch (err) {
        console.error("Revoke Badge Error:", err);
        res.redirect('/admin/badges');
    }
});

app.post('/admin/badges/delete', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { badgeId, badgeKey } = req.body;
        if (badgeId) {
            await Badge.findByIdAndDelete(badgeId);
            if (badgeKey) {
                await DiscordUser.updateMany({}, { $pull: { badges: badgeKey } });
            }
        }
        res.redirect('/admin/badges');
    } catch (err) {
        console.error("Delete Badge Error:", err);
        res.redirect('/admin/badges');
    }
});

app.get('/admin/jobs', requireStaffAuth, requireJobsAccess, async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 }).lean();
        res.render('admin/jobs', {
            page: 'admin-jobs',
            activeTab: 'jobs',
            user: req.session.user,
            isMasterAdmin: req.isMasterAdmin,
            jobs: jobs || []
        });
    } catch (err) {
        console.error("Admin Jobs Error:", err);
        res.status(500).send("خطأ في تحميل صفحة إدارة الوظائف");
    }
});

app.post('/admin/jobs/create', requireStaffAuth, requireJobsAccess, async (req, res) => {
    try {
        const { title, icon, department, description, desc, requirements, salary, status } = req.body;
        if (!title || !title.trim()) {
            return res.redirect('/admin/jobs?error=missing_title');
        }

        const cleanDesc = (description || desc || '').trim();
        const reqsList = requirements 
            ? requirements.split('\n').map(r => r.trim()).filter(Boolean)
            : [];

        await Job.create({
            title: title.trim(),
            icon: (icon || 'work').trim(),
            department: department ? department.trim() : 'عام',
            description: cleanDesc,
            desc: cleanDesc,
            requirements: reqsList,
            salary: salary ? salary.trim() : 'تحدد بعد المقابلة',
            status: status || 'open',
            applications: []
        });

        res.redirect('/admin/jobs?msg=created');
    } catch (err) {
        console.error("Create Job Error:", err);
        res.redirect('/admin/jobs?error=failed');
    }
});

app.post('/admin/jobs/toggle-status', requireStaffAuth, requireJobsAccess, async (req, res) => {
    try {
        const { jobId, status } = req.body;
        if (!jobId || !['open', 'closed'].includes(status)) return res.redirect('/admin/jobs');
        await Job.findByIdAndUpdate(jobId, { status });
        res.redirect('/admin/jobs');
    } catch (err) {
        console.error("Toggle Job Status Error:", err);
        res.redirect('/admin/jobs');
    }
});

app.post('/admin/jobs/delete/:id', requireStaffAuth, requireJobsAccess, async (req, res) => {
    try {
        await Job.findByIdAndDelete(req.params.id);
        res.redirect('/admin/jobs');
    } catch (err) {
        console.error("Delete Job Error:", err);
        res.redirect('/admin/jobs');
    }
});

app.post('/admin/jobs/application-action', requireStaffAuth, requireJobsAccess, async (req, res) => {
    try {
        const { jobId, appId, action } = req.body;
        if (!jobId || !appId || !action) return res.redirect('/admin/jobs');

        if (action === 'delete') {
            await Job.findByIdAndUpdate(jobId, { $pull: { applications: { _id: appId } } });
        } else if (['accepted', 'rejected'].includes(action)) {
            await Job.updateOne({ _id: jobId, "applications._id": appId }, { $set: { "applications.$.status": action } });
        }
        res.redirect('/admin/jobs');
    } catch (err) {
        console.error("Job Application Action Error:", err);
        res.redirect('/admin/jobs');
    }
});

app.get('/admin/violations', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const [sellers, discordUsers] = await Promise.all([
            Seller.find().sort({ updatedAt: -1 }).lean(),
            DiscordUser.find().sort({ lastLogin: -1 }).lean()
        ]);
        res.render('admin/violations', {
            page: 'admin-violations',
            activeTab: 'violations',
            user: req.session.user,
            isMasterAdmin: req.isMasterAdmin,
            sellers: sellers || [],
            discordUsers: discordUsers || []
        });
    } catch (err) {
        console.error("Violations Load Error:", err);
        res.status(500).send("خطأ في جلب بيانات المخالفات");
    }
});

app.post('/admin/sellers/verify', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { discordId } = req.body;
        if (!discordId) return res.redirect('/admin/violations');
        const cleanId = discordId.trim();

        const dUser = await DiscordUser.findOne({ discordId: cleanId }).lean();
        if (!dUser) {
            const [sellers, discordUsers] = await Promise.all([
                Seller.find().sort({ updatedAt: -1 }).lean(),
                DiscordUser.find().sort({ lastLogin: -1 }).lean()
            ]);
            return res.render('admin/violations', {
                page: 'admin-violations',
                activeTab: 'violations',
                user: req.session.user,
                isMasterAdmin: req.isMasterAdmin,
                sellers: sellers || [],
                discordUsers: discordUsers || [],
                errorMsg: `المستخدم (${cleanId}) غير مسجل في الموقع حتى الآن! يجب أن يسجل دخوله مرة واحدة عبر ديسكورد أولاً`
            });
        }

        await Seller.findOneAndUpdate(
            { discordId: cleanId },
            {
                isVerifiedSeller: true,
                username: dUser.globalName || dUser.username || 'بائع معتمد',
                avatar: dUser.avatar || '/logo.png'
            },
            { upsert: true, returnDocument: 'after' }
        );
        res.redirect('/admin/violations');
    } catch (err) {
        console.error("Seller Verify Error:", err);
        res.status(500).send("خطأ أثناء توثيق البائع");
    }
});

app.post('/admin/sellers/delete', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { sellerId } = req.body;
        if (!sellerId) return res.redirect('/admin/violations');
        await Seller.findByIdAndDelete(sellerId);
        res.redirect('/admin/violations');
    } catch (err) {
        console.error("Seller Delete Error:", err);
        res.status(500).send("خطأ أثناء حذف البائع");
    }
});

app.post('/admin/violations/add', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { discordId, reason, severity } = req.body;
        if (!discordId || !reason) return res.redirect('/admin/violations');

        const cleanId = discordId.trim();
        const dUser = await DiscordUser.findOne({ discordId: cleanId }).lean();
        const adminSession = req.session ? req.session.user : null;
        const currentAdminId = adminSession ? adminSession.id : '691044838459834430';
        const currentAdminName = adminSession ? (adminSession.global_name || adminSession.username) : 'Staff';
        const currentAdminAvatar = adminSession ? adminSession.avatar : '/logo.png';

        await Seller.findOneAndUpdate(
            { discordId: cleanId },
            {
                $setOnInsert: {
                    username: dUser ? (dUser.globalName || dUser.username) : 'بائع',
                    avatar: dUser ? dUser.avatar : '/logo.png',
                    isVerifiedSeller: true,
                    veloCoins: 0,
                    salesCount: 0
                },
                $push: {
                    violations: {
                        reason: reason.trim(),
                        severity: severity || 'تحذير',
                        date: new Date(),
                        adminId: currentAdminId,
                        adminName: currentAdminName,
                        adminAvatar: currentAdminAvatar
                    }
                }
            },
            { upsert: true }
        );
        res.redirect('/admin/violations');
    } catch (err) {
        console.error("Violation Add Error:", err);
        res.status(500).send("خطأ أثناء تسجيل المخالفة");
    }
});

app.post('/admin/violations/delete', requireStaffAuth, requireViolationsAccess, async (req, res) => {
    try {
        const { sellerId, violationId } = req.body;
        if (!sellerId || !violationId) return res.redirect('/admin/violations');
        await Seller.findByIdAndUpdate(sellerId, { $pull: { violations: { _id: violationId } } });
        res.redirect('/admin/violations');
    } catch (err) {
        console.error("Violation Delete Error:", err);
        res.status(500).send("خطأ أثناء حذف المخالفة");
    }
});

async function requireCustomizationAccess(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }
    const discordId = req.session.user.id;
    const dbUser = await DiscordUser.findOne({ discordId }).lean();
    
    const allowed = ['veloqra_pro', 'pro', 'veloqra pro', 'veloqra_staff', 'staff', 'veloqra staff'];
    const userBadges = (dbUser && Array.isArray(dbUser.badges)) ? dbUser.badges : [];
    
    const canCustomize = VELOQRA_STAFF_IDS.includes(discordId) || userBadges.some(b => {
        const val = typeof b === 'string' ? b.trim().toLowerCase() : (b.key || b.id || '').trim().toLowerCase();
        return allowed.includes(val);
    });

    if (!canCustomize) {
        return res.status(403).render('404', { 
            title: 'غير مصرح', 
            message: 'ميزة تخصيص البروفايل مخصصة حصرياً لأصحاب شارة Veloqra Pro وطاقم الإدارة.' 
        });
    }

    req.targetDbUser = dbUser;
    next();
}

app.get('/profile/customize', requireCustomizationAccess, async (req, res) => {
    try {
        const [dbUser, allBadges] = await Promise.all([
            DiscordUser.findOne({ discordId: req.session.user.id }).lean(),
            Badge.find().lean()
        ]);

        res.render('profile-customize', {
            page: 'profile-customize',
            user: req.session.user,
            dbUser: dbUser || {},
            systemBadges: allBadges || []
        });
    } catch (err) {
        console.error("Customize load error:", err);
        res.status(500).send("خطأ في تحميل صفحة التخصيص");
    }
});

// ==================== مسارات شحن الرصيد (Charge Routes) ==================== //

// عرض صفحة الشحن
app.get('/charge', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/discord');
  }
  res.render('charge', {
    page: 'charge',
    user: req.session.user
  });
});

app.post('/charge/submit', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول أولاً' });
  }

  try {
    const { coins, method, transferCode } = req.body;
    const discordUser = req.session.user;

    const requestedCoins = Number(coins) || 0;
    if (requestedCoins < 100) {
      return res.status(400).json({ success: false, message: 'الحد الأدنى للشحن هو 100 Coin' });
    }

    const cleanTransferCode = String(transferCode || '').replace(/#/g, '').trim();
    if (!cleanTransferCode) {
      return res.status(400).json({ success: false, message: 'رقم الحوالة مطلوب' });
    }

    const methodMeta = {
      'syp_sham': { name: 'شام كاش', curr: 'ل.س', icon: '/syp_sham.png', rate: 150 },
      'syp_paymera': { name: 'بايميرا', curr: 'ل.س', icon: '/syp_paymera.png', rate: 150 },
      'syp_cash': { name: 'كاش نقدي', curr: 'ل.س', icon: 'payments', rate: 150 },
      'iqd_asiacell': { name: 'آسيا سيل', curr: 'د.ع', icon: '/iqd_asiacell.png', rate: 1400 },
      'usd_sham': { name: 'شام كاش (دولار)', curr: '$', icon: '/usd_sham.png', rate: 1 },
      'crypto_usdt': { name: 'USDT (BEP20)', curr: 'USDT', icon: 'currency_bitcoin', rate: 1 }
    };

    const targetMeta = methodMeta[method] || { name: method, curr: '$', icon: '/logo.png', rate: 1 };
    const calculatedCost = (requestedCoins / 100) * targetMeta.rate;

    await Order.create({
      userId: String(discordUser.id),
      serverId: `CHARGE-${Date.now()}`,
      plan: `VeloCoin_${requestedCoins}`,
      price: `${calculatedCost.toLocaleString()} ${targetMeta.curr}`,
      siteName: `شحن رصيد: ${requestedCoins} Velo Coin`,
      clientContact: cleanTransferCode, // تخزين رقم الحوالة مباشرة دون بادئة مضللة
      description: `طريقة الدفع: [${targetMeta.name}] | المبلغ: ${calculatedCost.toLocaleString()} ${targetMeta.curr} | الحوالة: ${cleanTransferCode}`,
      estimatedTotal: calculatedCost,
      status: 'pending',
      createdAt: new Date()
    });

    // إشعار تيليجرام
    try {
      const subs = await TelegramSubscriber.find().lean();
      let recipients = (subs && subs.length > 0) ? subs.map(s => s.chatId) : [];
      if (recipients.length === 0 && process.env.TELEGRAM_CHAT_ID) recipients.push(process.env.TELEGRAM_CHAT_ID);

      if (recipients.length > 0) {
        const message = 
`⚡ طلب شحن رصيد جديد في فيلوكرا!
───────────────────
👤 العضو: ${discordUser.global_name || discordUser.username} (${discordUser.id})
💰 الكمية المطلوبة: ${requestedCoins} Velo Coin
💳 طريقة الدفع: ${targetMeta.name}
💵 المبلغ المحول: ${calculatedCost.toLocaleString()} ${targetMeta.curr}
🔢 رقم الحوالة: ${cleanTransferCode}
───────────────────`;

        await Promise.all(recipients.map(chatId => 
          fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message })
          }).catch(err => console.error('Telegram error:', err))
        ));
      }
    } catch (tErr) {}

    res.json({ success: true, message: 'تم إرسال طلب الشحن بنجاح وهو قيد التدقيق' });
  } catch (err) {
    console.error('Charge submit error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم أثناء تسجيل الطلب' });
  }
});

app.post('/profile/customize/save', requireCustomizationAccess, async (req, res) => {
    try {
        const discordId = req.session.user.id;
        const {
            customSlug,
            themeEnabled,
            bgType,
            bgValue,
            cardBg,
            cardBlur,
            textColor,
            accentColor,
            fontFamily,
            customCursorUrl,
            audioUrl,
            aboutText,
            customTextsJson,
            socialLinksJson,
            displayedBadges,
            entryOverlayEnabled,
            entryOverlayText,
            entryOverlayBgType,
            entryOverlayBgValue,
            entryOverlayTextColor
        } = req.body;

        const cleanSlug = (customSlug || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (cleanSlug) {
            const existingSlug = await DiscordUser.findOne({ customSlug: cleanSlug, discordId: { $ne: discordId } });
            if (existingSlug) {
                return res.status(400).json({ success: false, message: "الرابط المخصص مستخدم بالفعل من قبل عضو آخر!" });
            }
        }

        let customTexts = [];
        try {
            if (customTextsJson) customTexts = JSON.parse(customTextsJson);
        } catch(e) {}

        let socialLinks = [];
        try {
            if (socialLinksJson) socialLinks = JSON.parse(socialLinksJson);
        } catch(e) {}

        const finalDisplayedBadges = Array.isArray(displayedBadges) 
            ? displayedBadges.map(k => String(k).trim().toLowerCase()) 
            : (displayedBadges ? [String(displayedBadges).trim().toLowerCase()] : []);

        await DiscordUser.findOneAndUpdate(
            { discordId },
            {
                customSlug: cleanSlug,
                about: (aboutText || '').trim(),
                displayedBadges: finalDisplayedBadges,
                customTheme: {
                    enabled: themeEnabled === 'true',
                    bgType: bgType || 'color',
                    bgValue: bgValue || '#0a122c',
                    cardBg: cardBg || 'rgba(255, 255, 255, 0.05)',
                    cardBlur: cardBlur || '16px',
                    textColor: textColor || '#ffffff',
                    accentColor: accentColor || '#ffd000',
                    fontFamily: fontFamily || 'IBM Plex Sans Arabic',
                    customCursorUrl: (customCursorUrl || '').trim(),
                    audioUrl: (audioUrl || '').trim(),
                    entryOverlay: {
                        enabled: entryOverlayEnabled === 'true',
                        text: (entryOverlayText || 'Click to enter').trim(),
                        bgType: entryOverlayBgType || 'color',
                        bgColor: entryOverlayBgValue || 'rgba(10, 18, 44, 0.96)',
                        textColor: entryOverlayTextColor || '#ffffff'
                    }
                },
                customTexts,
                socialLinks
            }
        );

        res.json({ success: true, message: "تم حفظ الإعدادات بنجاح" });
    } catch (err) {
        console.error("Customize Save Error:", err);
        res.status(500).json({ success: false, message: "حدث خطأ أثناء حفظ التعديلات" });
    }
});


const crypto = require('crypto');

// جلب المفاتيح من متغيرات البيئة المخفية
const BINGX_HOST = 'https://open-api.bingx.com';
const BINGX_API_KEY = process.env.BINGX_API_KEY;
const BINGX_SECRET_KEY = process.env.BINGX_SECRET_KEY;

// دالة التوقيع الرقمي لطلبات BingX (HMAC SHA256)
function signBingX(queryString, secret) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}


const STATIC_USDT_BEP20_ADDRESS = "0x87e078ad95416c278ea4327842947ea5bb1ea7c6";

// 1. مسار جلب عنوان المحفظة لشبكة BEP20
app.get('/api/charge/crypto/address', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول أولاً' });
  }

  try {
    const coin = 'USDT';
    const network = 'BSC'; // رمز شبكة BEP20 المعتمد في BingX
    const timestamp = Date.now();

    // ترتيب المعاملات أبجدياً إلزامي في BingX لنجاح التوقيع
    const queryString = `coin=${coin}&network=${network}&timestamp=${timestamp}`;
    const signature = signBingX(queryString, BINGX_SECRET_KEY);

    const apiRes = await axios.get(`${BINGX_HOST}/openApi/wallets/v1/capital/deposit/address?${queryString}&signature=${signature}`, {
      headers: {
        'X-BX-APIKEY': BINGX_API_KEY
      },
      timeout: 10000
    });

    console.log("BingX API Raw Response:", JSON.stringify(apiRes.data));

    // استخراج العنوان مهما كان هيكل الـ data المرتجع من BingX
    const resData = apiRes.data;
    let depositAddress = '';

    if (resData && resData.data) {
      if (typeof resData.data === 'string') {
        depositAddress = resData.data;
      } else if (resData.data.address) {
        depositAddress = resData.data.address;
      } else if (Array.isArray(resData.data) && resData.data.length > 0) {
        const found = resData.data.find(n => (n.network || '').toUpperCase() === 'BSC' || (n.network || '').toUpperCase() === 'BEP20');
        depositAddress = (found || resData.data[0]).address;
      }
    }

    if (!depositAddress) {
      return res.status(500).json({ 
        success: false, 
        message: 'فشل في استخراج العنوان من رد المنصة: ' + (resData?.msg || 'تأكد من تفعيل عملة USDT وشبكة BSC في حسابك بـ BingX') 
      });
    }

    res.json({
      success: true,
      address: depositAddress,
      network: 'BSC (BEP20)'
    });
  } catch (err) {
    const errorDetails = err.response?.data || err.message;
    console.error('BingX Address Fetch Error:', errorDetails);
    res.status(500).json({ 
      success: false, 
      message: 'خطأ من منصة BingX: ' + (err.response?.data?.msg || err.message) 
    });
  }
});

// 2. مسار فحص الحوالة والتأكد التلقائي وإيداع الرصيد
app.post('/api/charge/crypto/verify', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول أولاً' });
  }

  try {
    const { txId, expectedCoins } = req.body;
    const cleanTxId = String(txId || '').trim();
    const coinsTarget = Number(expectedCoins) || 100;
    const expectedUsdt = coinsTarget / 100;

    if (!cleanTxId || cleanTxId.length < 15) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال رمز المعاملة (TxID / Hash) بشكل صحيح' });
    }

    // منع تكرار نفس المعاملة نهائياً
    const alreadyUsed = await Order.findOne({ clientContact: `TXID:${cleanTxId}` });
    if (alreadyUsed) {
      return res.status(400).json({ success: false, message: 'رمز المعاملة هذا تم استخدامه وشحنه مسبقاً!' });
    }

    // جلب سجلات الإيداع من BingX
    const timestamp = Date.now();
    const params = `coin=USDT&timestamp=${timestamp}`;
    const signature = signBingX(params, BINGX_SECRET_KEY);

    const recordRes = await axios.get(`${BINGX_HOST}/openApi/wallets/v1/capital/deposit/hisrec?${params}&signature=${signature}`, {
      headers: { 'X-BX-APIKEY': BINGX_API_KEY }
    });

    const records = recordRes.data?.data || [];
    
    // البحث عن المعاملة المطابقة للـ TxID وحالتها مكتملة (status == 1)
    const matched = records.find(r => 
      (r.txId && r.txId.toLowerCase() === cleanTxId.toLowerCase()) && 
      (r.status === 1 || r.status === '1')
    );

    if (!matched) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم رصد المعاملة بعد في حساب BingX أو أنها ما زالت بانتظار تأكيدات البلوكتشين. انتظر دقيقة ثم أعد المحاولة.'
      });
    }

    const actualAmount = parseFloat(matched.amount);

    // التحقق من أن المبلغ لا يقل عن المطلوب
    if (actualAmount < expectedUsdt) {
      return res.status(400).json({
        success: false,
        message: `المبلغ المستلم (${actualAmount} USDT) أقل من المطلوب (${expectedUsdt} USDT).`
      });
    }

    const coinsToDeposit = actualAmount * 100;
    const discordUser = req.session.user;

    // 1. تسجيل العملية كطلب ناجح ومكتمل في جدول Order
    await Order.create({
      userId: String(discordUser.id),
      serverId: `CRYPTO-${Date.now()}`,
      plan: `VeloCoin_${coinsToDeposit}`,
      price: `${actualAmount} $`,
      siteName: `شحن تلقائي: ${coinsToDeposit} Velo Coin`,
      clientContact: `TXID:${cleanTxId}`,
      description: `شحن فوري ومؤكد عبر شبكة BEP20 بقيمة ${actualAmount} USDT. الهاش: ${cleanTxId}`,
      estimatedTotal: actualAmount,
      status: 'approved',
      createdAt: new Date()
    });

    // 2. إيداع الرصيد وتحديث المشتريات فوراً في حساب العضو كما في wallets.ejs
    await Seller.findOneAndUpdate(
      { discordId: String(discordUser.id) },
      {
        $inc: { veloCoins: actualAmount },$push: {
          purchases: {
            productName: `شحن فوري (${coinsToDeposit} Velo Coin)`,
            sellerName: 'BingX Automated Network',
            price: `${actualAmount} $`,
            currency: 'USDT',
            qty: 1,
            date: new Date()
          }
        }
      },
      { upsert: true }
    );

    res.json({
      success: true,
      message: `تم التحقق بنجاح! تم إيداع ${actualAmount}$ (${coinsToDeposit} Velo Coin) في محفظتك فوراً.`
    });
  } catch (err) {
    console.error('Verify BingX Error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء الاتصال بالمنصة للتحقق من المعاملة' });
  }
});

app.use((req, res) => {
    res.status(404).render('404', { 
        title: 'الصفحة غير موجودة',
        message: 'عذراً، الرابط المطلوب غير موجود.' 
    });
});

app.use((err, req, res, next) => {
    console.error("Server Error Caught:", err.stack);
    res.status(500).render('500', {
        title: 'خطأ في الخادم',
        message: 'حدث خطأ داخلي أثناء معالجة الطلب.'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 ديسكورد سيرفر يعمل على: http://localhost:${PORT}`);
});