/**
 * Veloqra Badges & Staff Central Registry
 * ملف مركزي موحد لإدارة الشارات وفريق العمل
 */

// 1. قاموس الشارات الرسمي وتفاصيلها البصرية
const VELOQRA_BADGES = {
  staff: {
    key: 'staff',
    name: 'Veloqra Staff',
    icon: 'construction',
    desc: 'تمنح هذه الشارة فقط لمن هم إدارة في منصة فيلوكرا وموثقين رسمياً من قبل المنصة',
    color: '#2563eb',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  premium: {
    key: 'premium',
    name: 'Premium',
    icon: 'diamond',
    desc: 'تمنح هذه الشارة فقط لمن اشترك في بريموم فيلوكرا لكلا الخطتين',
    color: '#d9d206',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  verified_seller: {
    key: 'verified_seller',
    name: 'Verified Seller',
    icon: 'verified',
    desc: 'تمنح هذه الشارة فقط لمن هم بائعون معتمدون في منصة فيلوكرا',
    color: '#68ff8b',
    badgeClass: 'bg-lime-50 text-lime-700 border-lime-200'
  }
};

// 2. قائمة أعضاء الإدارة والشارات المنسوبة لكل شخص
const VELOQRA_STAFF_MEMBERS = [
  {
    roleName: 'المؤسسين',
    members: [
      {
        id: '691044838459834430',
        name: 'Mohammad',
        tag: '@mohammad339',
        avatar: 'https://cdn.discordapp.com/avatars/691044838459834430/7e4996804ec38d84c3ab22f349626084.png',
        about: '',
        badges: ['staff']
      },
      {
        id: '1068278933532983370',
        name: 'Captin !',
        tag: '@_tg4a',
        avatar: 'https://cdn.discordapp.com/avatars/1068278933532983370/a_8c44f4e65995b0eb1e36fd3faff1ccc8.gif',
        about: '',
        badges: ['staff']
      }
    ]
  }
];

// دالة مساعدة لجلب شارات العضو عبر الـ ID أو اسم المستخدم / التاغ
function getUserBadges(userId, userTag) {
  const cleanId = (userId || '').trim();
  const cleanTag = (userTag || '').replace(/^@/, '').toLowerCase().trim();

  for (const group of VELOQRA_STAFF_MEMBERS) {
    const found = group.members.find(m => {
      const memberCleanTag = (m.tag || '').replace(/^@/, '').toLowerCase().trim();
      return (m.id && m.id === cleanId) || memberCleanTag === cleanTag;
    });

    if (found && Array.isArray(found.badges)) {
      return found.badges;
    }
  }

  return [];
}