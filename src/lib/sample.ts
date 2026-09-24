import type { WordInput } from './types';

/** A starter set so a new user can try the app immediately. Pinyin is generated on load. */
export const sampleWords: Omit<WordInput, 'pinyin'>[] = [
  { hanzi: '你好', meaning: 'hello', example: '你好，我叫小明。', tags: ['HSK1', 'greetings'] },
  { hanzi: '谢谢', meaning: 'thank you', example: '谢谢你的帮助。', tags: ['HSK1', 'greetings'] },
  { hanzi: '再见', meaning: 'goodbye', tags: ['HSK1', 'greetings'] },
  { hanzi: '朋友', meaning: 'friend', example: '他是我的好朋友。', tags: ['HSK1', 'people'] },
  { hanzi: '老师', meaning: 'teacher', example: '我们的老师很好。', tags: ['HSK1', 'people'] },
  { hanzi: '学生', meaning: 'student', tags: ['HSK1', 'people'] },
  { hanzi: '吃', meaning: 'to eat', example: '你想吃什么？', tags: ['HSK1', 'verbs'] },
  { hanzi: '喝', meaning: 'to drink', example: '我喝茶。', tags: ['HSK1', 'verbs'] },
  { hanzi: '水', meaning: 'water', tags: ['HSK1', 'food'] },
  { hanzi: '米饭', meaning: 'cooked rice', tags: ['HSK1', 'food'] },
  { hanzi: '中国', meaning: 'China', example: '我想去中国。', tags: ['HSK1', 'places'] },
  { hanzi: '今天', meaning: 'today', example: '今天天气很好。', tags: ['HSK1', 'time'] },
];
