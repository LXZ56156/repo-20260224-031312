function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

const EVENT_DEFINITIONS = deepFreeze({
  analytics_view: {
    src: ['analytics'],
    a: ['view']
  },
  clone_tournament_success: {
    src: ['home'],
    a: ['clone'],
    r: ['success']
  },
  home_clone_tournament_click: {
    src: ['home'],
    a: ['clone']
  },
  home_finished_review_click: {
    src: ['home'],
    a: ['review_card', 'review']
  },
  lobby_first_guide_close: {
    src: ['lobby'],
    a: ['close']
  },
  lobby_first_guide_show: {
    src: ['lobby'],
    a: ['show']
  },
  match_open: {
    src: ['match'],
    a: ['open']
  },
  ranking_copy_share_text: {
    src: ['ranking'],
    a: ['copy']
  },
  ranking_generate_poster_click: {
    src: ['ranking'],
    a: ['generate_poster', 'top_rank']
  },
  ranking_generate_poster_success: {
    src: ['ranking'],
    a: ['generate_poster'],
    r: ['success']
  },
  ranking_save_poster_success: {
    src: ['ranking'],
    a: ['save_poster'],
    r: ['success']
  },
  ranking_view: {
    src: ['ranking'],
    a: ['view']
  },
  schedule_finished_share_click: {
    src: ['schedule'],
    a: ['click']
  },
  score_submit_success: {
    src: ['match'],
    a: ['submit_score'],
    r: ['success']
  },
  share_entry_go_ranking: {
    src: ['share_entry'],
    a: ['click']
  },
  share_entry_go_schedule: {
    src: ['share_entry'],
    a: ['click']
  },
  share_entry_join_success: {
    src: ['share_entry'],
    a: ['join'],
    r: ['success']
  },
  share_entry_primary_click: {
    src: ['share_entry'],
    a: [
      'analytics',
      'click',
      'enter',
      'identity_pending',
      'join',
      'lobby_view',
      'ranking',
      'retry',
      'schedule',
      'view'
    ]
  },
  share_entry_view: {
    src: ['share_entry'],
    a: ['view']
  }
});

const EVENT_NAMES = Object.freeze(Object.keys(EVENT_DEFINITIONS).sort());
const PROPERTY_KEYS = Object.freeze(['t', 's', 'm', 'src', 'a', 'r']);

module.exports = Object.freeze({
  enabled: false,
  cloudFunctionName: 'reportProductEvents',
  queueStorageKey: 'product_events_queue_v1',
  installIdStorageKey: 'product_events_install_id_v1',
  maxBatchSize: 20,
  maxQueueSize: 200,
  requestTimeoutMs: 10000,
  retryBaseMs: 1000,
  retryMaxMs: 60000,
  eventNames: EVENT_NAMES,
  eventDefinitions: EVENT_DEFINITIONS,
  propertyKeys: PROPERTY_KEYS
});
