// 抽卡吉时：按用户提供的3.0确认稿更新。
import type { LocaleMessages } from '../types'

export const fortuneTimeZh: LocaleMessages['fortuneTime'] = {
  title: '3.0版本抽卡吉时',
  close: '关闭抽卡吉时窗口',
  intro:
    '根据日期整体宜忌、黄道时辰、求财/交易属性和时辰财神方位。时间均为北京时间，方位以本人面朝方向为准。',
  disclaimer: '娱乐性玄学推演，仅供参考；实际出率仍以游戏概率为准，欧非程度作者不负责。',
  tableTitle: '3.0版本吉时',
  date: '日期推荐',
  time: '吉时',
  direction: '面朝方位',
  zodiac: '需避开生肖',
  rating: '适合程度',
  rows: [
    {
      date: '11月29日',
      time: '09:00—10:59',
      direction: '东北',
      zodiac: '属牛、属猪应避开',
      rating: '次选，前期尝鲜。玉堂，时宜祈福、求财；日忌开市，降级',
      highlighted: false
    },
    {
      date: '12月1日',
      time: '17:00—18:59',
      direction: '正南',
      zodiac: '属兔应避开',
      rating: '大吉，前期主抽。开日，玉堂，时宜祈福、求财，时忌无',
      highlighted: true
    },
    {
      date: '12月6日',
      time: '19:00—20:59',
      direction: '东北',
      zodiac: '属猴、属龙应避开',
      rating: '次选，周末补抽。司命，时宜求财、交易、祈福；日级忌祭祀，保守降级',
      highlighted: false
    },
    {
      date: '12月11日',
      time: '21:00—22:59',
      direction: '东北',
      zodiac: '属牛、属蛇应避开',
      rating: '吉，晚间可抽。明堂，时宜祈福、求财、交易',
      highlighted: false
    },
    {
      date: '12月14日',
      time: '21:00—22:59',
      direction: '正东',
      zodiac: '属龙、属蛇应避开',
      rating: '大吉，中期主抽。开日，玉堂，日宜祈福，时宜求财、开市，时忌无',
      highlighted: true
    },
    {
      date: '12月17日',
      time: '09:00—10:59',
      direction: '正东',
      zodiac: '属羊、属猪应避开',
      rating: '吉，适合补抽。玉堂，日期与时辰均有祈福、交易相关宜项',
      highlighted: false
    },
    {
      date: '12月21日',
      time: '13:00—14:59',
      direction: '正东',
      zodiac: '属猪、属牛应避开',
      rating: '吉，午后可抽。明堂，时宜祈福、求财，时忌无',
      highlighted: false
    },
    {
      date: '12月24日',
      time: '07:00—08:59',
      direction: '东北',
      zodiac: '属虎、属狗应避开',
      rating: '大吉，本版首推。成日，金匮，时宜祈福、求财、开市、交易，时忌无',
      highlighted: true
    },
    {
      date: '12月24日',
      time: '09:00—10:59',
      direction: '东北',
      zodiac: '属虎、属猪应避开',
      rating: '大吉，同日备选。天德，时宜祈福、求财、求嗣，时忌无',
      highlighted: false
    },
    {
      date: '12月29日',
      time: '09:00—10:59',
      direction: '东北',
      zodiac: '属羊、属猪应避开',
      rating: '吉，后期重点推荐。除日，日宜祈福、开市、交易；玉堂时同宜，时忌无',
      highlighted: true
    },
    {
      date: '2027年1月1日',
      time: '09:00—10:59',
      direction: '正东',
      zodiac: '属狗、属猪应避开',
      rating: '次选，元旦补抽。明堂，时宜祈福、交易；日忌开市，降级',
      highlighted: false
    },
    {
      date: '2027年1月2日',
      time: '13:00—14:59',
      direction: '东北',
      zodiac: '属猪、属牛应避开',
      rating: '吉，收尾可抽。明堂，时宜祈福、求财、交易，时忌无',
      highlighted: false
    },
    {
      date: '2027年1月5日',
      time: '19:00—20:59',
      direction: '东北',
      zodiac: '属虎、属龙应避开',
      rating: '吉，最后补抽窗口。司命，时宜祈福、求财、开市、交易',
      highlighted: false
    }
  ],
  recommendedTitle: '主推排序',
  recommendations: [
    {
      title: '12月24日 07:00—08:59，面朝东北',
      details: ['成日＋金匮，抽卡相关宜项最齐整。']
    },
    {
      title: '12月1日 17:00—18:59，面朝正南',
      details: ['前期首选，开日＋玉堂，适合版本初期集中抽。']
    },
    {
      title: '12月14日 21:00—22:59，面朝正东',
      details: ['中期首选，开日＋玉堂，晚间也方便安排。']
    },
    {
      title: '12月29日 09:00—10:59，面朝东北',
      details: ['后期重点窗口，日时均宜祈福、开市、交易。']
    },
    {
      title: '2027年1月2日 13:00—14:59，面朝东北',
      details: ['收尾首选，明堂时宜项完整。']
    }
  ],
  avoidTitle: '不建议日期',
  avoidDates:
    '11月27日开服当天：破日，日宜以解除、破屋、治病为主，不列正式推荐窗口。首个次选是11月29日09:00，首个大吉主推是12月1日17:00。',
  avoidItems: [
    '12月7日、9日、10日、12日：采用的黄历均标注日级“诸事不宜”，剔除；12月12日即使是成日，也不能据此评为大吉。',
    '2027年1月6日00:00—03:49：当天以祭祀、丧葬事项及“馀事勿取”为主，不硬凑截止前吉时。',
    '不同卡池可能提前结束：「菇灯萤梦」「何处寻青羽」公告截至12月16日09:59，不能等到月底窗口。'
  ],
  summaryTitle: '总结一下',
  summary:
    '前期主抽选12月1日17:00，中期选12月14日21:00，本版首推12月24日07:00，后期选12月29日09:00，收尾选2027年1月2日13:00。',
  footnote: '娱乐性抽卡时间表，不代表会改变游戏实际概率。'
}

export const fortuneTimeEn: LocaleMessages['fortuneTime'] = {
  ...fortuneTimeZh,
  intro:
    'Based on the day-level auspiciousness, zodiac hours, wealth/trade attributes, and the God of Wealth direction for each hour. All times are Beijing Time; face the listed direction while pulling.',
  disclaimer:
    'For entertainment and traditional-metaphysics speculation only. Actual drop rates follow the game probabilities; the author is not responsible for your luck.',
  rows: fortuneTimeZh.rows.map((row, index) => ({
    ...row,
    date: [
      'Nov 29',
      'Dec 1',
      'Dec 6',
      'Dec 11',
      'Dec 14',
      'Dec 17',
      'Dec 21',
      'Dec 24',
      'Dec 24',
      'Dec 29',
      'Jan 1, 2027',
      'Jan 2, 2027',
      'Jan 5, 2027'
    ][index]!,
    direction: row.direction === '东北' ? 'Northeast' : row.direction === '正南' ? 'South' : 'East',
    zodiac: [
      'Ox / Pig',
      'Rabbit',
      'Monkey / Dragon',
      'Ox / Snake',
      'Dragon / Snake',
      'Goat / Pig',
      'Pig / Ox',
      'Tiger / Dog',
      'Tiger / Pig',
      'Goat / Pig',
      'Dog / Pig',
      'Pig / Ox',
      'Tiger / Dragon'
    ][index]!,
    rating: [
      'Alternative, early trial. Jade Hall favors prayer and wealth; daily market-opening taboo lowers the rating.',
      'Highly auspicious, early main pulls. Open day and Jade Hall favor prayer and wealth; no hourly taboos.',
      'Alternative, weekend pulls. Life Governor favors wealth, trade and prayer; daily worship taboo lowers the rating.',
      'Auspicious evening. Bright Hall favors prayer, wealth and trade.',
      'Highly auspicious, mid-version main pulls. Open day and Jade Hall; daily prayer and hourly wealth/market opening favored; no hourly taboos.',
      'Auspicious extra pulls. Jade Hall; prayer and trade-related activities favored at day and hour levels.',
      'Auspicious afternoon. Bright Hall favors prayer and wealth; no hourly taboos.',
      'Highly auspicious, top pick. Success day and Golden Coffer favor prayer, wealth, market opening and trade; no hourly taboos.',
      'Highly auspicious alternative. Heavenly Virtue favors prayer, wealth and offspring blessings; no hourly taboos.',
      'Auspicious late-version pick. Remove day favors prayer, market opening and trade, as does Jade Hall hour; no hourly taboos.',
      'Alternative, New Year pulls. Bright Hall favors prayer and trade; daily market-opening taboo lowers the rating.',
      'Auspicious closing pick. Bright Hall favors prayer, wealth and trade; no hourly taboos.',
      'Auspicious final extra pulls. Life Governor favors prayer, wealth, market opening and trade.'
    ][index]!
  })),
  recommendations: [
    {
      title: 'Dec 24, 07:00–08:59 — Northeast',
      details: [
        'Top pick: Success day and Golden Coffer, with the most complete favorable activities.'
      ]
    },
    { title: 'Dec 1, 17:00–18:59 — South', details: ['Early main pick: Open day and Jade Hall.'] },
    {
      title: 'Dec 14, 21:00–22:59 — East',
      details: ['Mid-version evening pick: Open day and Jade Hall.']
    },
    {
      title: 'Dec 29, 09:00–10:59 — Northeast',
      details: ['Late-version pick: prayer, market opening and trade favored at both levels.']
    },
    {
      title: 'Jan 2, 2027, 13:00–14:59 — Northeast',
      details: ['Closing pick: Bright Hall with a full set of favorable activities.']
    }
  ],
  avoidDates:
    'November 27 is a Break day, primarily favoring release, demolition and healing; no formal window is recommended. First alternative: November 29 at 09:00. First highly auspicious main pick: December 1 at 17:00.',
  avoidItems: [
    'December 7, 9, 10 and 12 are marked unfavorable for all activities by the selected almanac. December 12 is excluded even though it is a Success day.',
    'January 6, 2027, 00:00–03:49 primarily favors worship and funeral matters, with other activities discouraged; no last-minute window is added.',
    'Some banners end earlier: 菇灯萤梦 and 何处寻青羽 end on December 16 at 09:59, so do not wait for late-month windows.'
  ],
  summary:
    'Early: Dec 1 at 17:00. Mid-version: Dec 14 at 21:00. Top pick: Dec 24 at 07:00. Late: Dec 29 at 09:00. Closing: Jan 2, 2027 at 13:00.',
  title: 'Version 3.0 Lucky Pull Times',
  close: 'Close lucky pull times',
  tableTitle: 'Version 3.0 Lucky Times',
  date: 'Date',
  time: 'Lucky time',
  direction: 'Face toward',
  zodiac: 'Zodiac to avoid',
  rating: 'Rating',
  recommendedTitle: 'Recommended ranking',
  avoidTitle: 'Dates to avoid',
  summaryTitle: 'Summary',
  footnote:
    'This is an entertainment-only pull-time table and does not change the game’s actual probabilities.'
}
