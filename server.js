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

// 1. فحص الاتصال بقاعدة البيانات
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("Database connection failure:", err);
        res.status(500).send("فشل الاتصال بقاعدة البيانات، يرجى المحاولة بعد لحظات.");
    }
});

// 2. الجلسات والكوكيز
app.set('trust proxy', 1);

app.use(cookieSession({
    name: 'veloqra_discord_session',
    keys: ['veloqra_discord_secret_auth_2026'],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true
}));

// 3. تمرير المستخدم لكل ملفات العرض
app.use((req, res, next) => {
    res.locals.user = req.session ? (req.session.user || null) : null;
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// =================== روابط التوجيه =================== //
app.get('/invite', (req, res) => res.redirect(301, 'https://discord.com/oauth2/authorize?client_id=697781426527010877'));
app.get('/join', (req, res) => res.redirect(301, 'https://discord.gg/BmwsgbSnk3'));
app.get('/_tg4a', (req, res) => res.redirect(301, '/users/1068278933532983370'));

// تحويلات المسارات القديمة إلى المسار الجذري المباشر
app.get('/discord', (req, res) => res.redirect('/'));

// =================== ميدلويرات الحماية =================== //
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

// =================== المسارات العامة (مباشرة) =================== //

// الصفحة الرئيسية لديسكورد
app.get('/', (req, res) => {
    res.render('index', { page: 'discord-home' });
});

// الشروط والأحكام
app.get('/terms', (req, res) => {
    res.render('terms', { page: 'terms' });
});

// فريق العمل
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

// تسجيل الدخول
app.get('/login', (req, res) => {
    if (req.session && req.session.user) return res.redirect('/profile');
    res.redirect('/auth/discord'); // ينقله للمصادقة فوراً بدون صفحة وسيطة
});

// الملف الشخصي للعضو
app.get('/profile', async (req, res) => {
    if (!req.session || !req.session.user) return res.redirect('/login');

    try {
        const discordId = req.session.user.id;
        const [userOrders, existingRecord, allJobs, dbUser, allBadges] = await Promise.all([
            Order.find({ userId: discordId }).sort({ createdAt: -1 }).lean(),
            Seller.findOne({ discordId }).lean(),
            Job.find({ "applications.userId": discordId }).lean(),
            DiscordUser.findOne({ discordId }).lean(),
            Badge.find().lean()
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
            seller: { veloCoins: 0, salesCount: 0, violations: [], purchases: [], ads: [] },
            isVerified: false,
            userBadges: [],
            systemBadges: []
        });
    }
});

// دليل الأعضاء
app.get('/users', async (req, res) => {
    try {
        const now = new Date();
        const [users, teamAbouts, allBadges, verifiedSellers, activePremiums] = await Promise.all([
            DiscordUser.find().sort({ lastLogin: -1 }).lean(),
            TeamAbout.find().lean(),
            Badge.find().lean(),
            Seller.find({ isVerifiedSeller: true }).select('discordId').lean(),
            BotPremium.find({ is_active: true }).lean()
        ]);

        const verifiedIds = new Set(verifiedSellers.map(s => String(s.discordId)));
        VELOQRA_STAFF_IDS.forEach(id => verifiedIds.add(id));

        const premiumUserIds = new Set();
        (activePremiums || []).forEach(p => {
            const baseDate = new Date(p.lastRenewedAt || p.createdAt);
            const expiryDate = new Date(baseDate.getTime() + (30 * 24 * 60 * 60 * 1000));
            if (now <= expiryDate && p.userId && p.userId !== 'غير محدد') {
                premiumUserIds.add(String(p.userId));
            }
        });

        const enrichedUsers = users.map(u => {
            const badgesList = Array.isArray(u.badges) ? [...u.badges] : [];
            const uid = String(u.discordId);

            if (verifiedIds.has(uid) && !badgesList.includes('verified_seller')) {
                badgesList.push('verified_seller');
            }
            if (premiumUserIds.has(uid) && !badgesList.includes('premium')) {
                badgesList.push('premium');
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

// بروفايل العضو التفصيلي
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

// الوظائف العامة
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

// تقديم طلب وظيفة
app.post('/jobs/apply', async (req, res) => {
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
});

// مصادقة ديسكورد OAuth2
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

// =================== مسارات الإدارة (Staff Admin Panel) =================== //

// لوحة الإدارة الرئيسية
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

// تخصيص بروفايلات الأعضاء والصور
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

// إدارة إعلانات البائعين
app.get('/admin/requests', requireStaffAuth, async (req, res) => {
    try {
        const sellers = await Seller.find({ "ads.0": { $exists: true } }).lean();
        
        const pendingAds = [];
        const approvedAds = [];

        sellers.forEach(s => {
            (s.ads || []).forEach(ad => {
                const entry = {
                    sellerId: s._id,
                    sellerDiscordId: s.discordId,
                    sellerName: s.username,
                    sellerAvatar: s.avatar,
                    ad: ad
                };
                if (ad.status === 'approved') {
                    approvedAds.push(entry);
                } else if (ad.status === 'pending' || !ad.status) {
                    pendingAds.push(entry);
                }
            });
        });

        res.render('admin/requests', {
            page: 'admin-requests',
            activeTab: 'requests',
            user: req.session.user,
            isMasterAdmin: req.isMasterAdmin,
            customOrders: [], // منفصل عن المشروع الرئيسي
            pendingAds,
            approvedAds
        });
    } catch (err) {
        console.error("Admin Requests Error:", err);
        res.status(500).send("خطأ في تحميل صفحة الطلبات");
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

// إدارة الشارات
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

// إدارة الوظائف من لوحة الأدمن
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
        const { title, icon, department, description, requirements, salary, status } = req.body;
        if (!title) return res.redirect('/admin/jobs');

        const reqsList = requirements 
            ? requirements.split('\n').map(r => r.trim()).filter(Boolean)
            : [];

        await Job.create({
            title: title.trim(),
            icon: icon || 'work',
            department: department ? department.trim() : 'عام',
            description: (description || '').trim(),
            requirements: reqsList,
            salary: salary ? salary.trim() : 'تحدد بعد المقابلة',
            status: status || 'open',
            applications: []
        });

        res.redirect('/admin/jobs');
    } catch (err) {
        console.error("Create Job Error:", err);
        res.redirect('/admin/jobs');
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

// إدارة البائعين والمخالفات
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


// ميدلوير للتحقق من امتلاك العضو صلاحية التخصيص (Veloqra Pro أو Staff)
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

// 1. صفحة تخصيص البروفايل الخاصة بالعضو
// 1. صفحة تخصيص البروفايل الخاصة بالعضو
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

// 2. حفظ تخصيصات العضو لنفسه
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


// صفحات الخطأ
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