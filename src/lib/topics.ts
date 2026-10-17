export const TOPICS = {
  aqeedah: 'العقيدة والتوحيد',
  ibadat: 'الصلاة والعبادات',
  tazkiyah: 'تزكية النفس',
  tafsir: 'تأملات قرآنية',
  akhirah: 'اليوم الآخر',
  rizq: 'الرزق والبركة',
  dua: 'الدعاء',
} as const;

export type TopicSlug = keyof typeof TOPICS;
export const TOPIC_SLUGS = Object.keys(TOPICS) as [TopicSlug, ...TopicSlug[]];
