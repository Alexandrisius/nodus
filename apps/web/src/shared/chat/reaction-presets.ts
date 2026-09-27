/**
 * Пресеты эмодзи реакций (#124): быстрый ряд ховер-попапа и раскрываемая
 * сетка. Эмодзи-строка — идентификатор (хранится в БД/контракте); отрисовка —
 * АНИМИРОВАННЫМ WebP из официального набора Microsoft Fluent Emoji Animated
 * (MIT; 256px APNG переконвертированы в 64px WebP, self-hosted /reactions/*,
 * браузеры играют нативно — без библиотек; лицензия и примечание о
 * конвертации — public/reactions/LICENSE-FluentEmojiAnimated.txt).
 * Пресет собран из анимированных в наборе глифов (не все Unicode покрыты
 * Microsoft — взяты равнозначные замены). Эмодзи без ассета (чужая реакция
 * вне пресета) рендерится текстовым глифом браузера.
 */

/** Быстрый ряд попапа (набор — реф Битрикс24). */
export const REACTION_QUICK = ['👍', '❤️', '😂', '🔥', '😄', '🎉'] as const;

/** Сетка за шевроном: ходовые деловые/эмоциональные. */
export const REACTION_MORE = [
  '👏',
  '🙏',
  '🤝',
  '👌',
  '✅',
  '⭐',
  '💯',
  '🚀',
  '🤔',
  '😮',
  '😉',
  '😎',
  '🥳',
  '🙌',
  '😊',
  '😅',
  '🙂',
  '😢',
  '😭',
  '😠',
  '🤯',
  '👀',
  '💗',
  '🫠',
  '🥲',
  '💡',
] as const;

/** Юникод → анимированный APNG (Fluent Emoji Animated, MIT). */
export const REACTION_ASSETS: Readonly<Record<string, string>> = {
  '👍': '/reactions/thumbs_up.webp',
  '❤️': '/reactions/red_heart.webp',
  '😂': '/reactions/face_with_tears_of_joy.webp',
  '🔥': '/reactions/fire.webp',
  '😄': '/reactions/grinning_face_with_big_eyes.webp',
  '🎉': '/reactions/party_popper.webp',
  '👏': '/reactions/clapping_hands.webp',
  '🙏': '/reactions/folded_hands.webp',
  '🤝': '/reactions/handshake.webp',
  '👌': '/reactions/ok_hand.webp',
  '⭐': '/reactions/star.webp',
  '💯': '/reactions/hundred_points.webp',
  '🚀': '/reactions/rocket.webp',
  '🤔': '/reactions/thinking_face.webp',
  '😮': '/reactions/face_with_open_mouth.webp',
  '😉': '/reactions/winking_face.webp',
  '😎': '/reactions/smiling_face_with_sunglasses.webp',
  '🙌': '/reactions/raising_hands.webp',
  '😊': '/reactions/smiling_face_with_smiling_eyes.webp',
  '😅': '/reactions/grinning_face_with_sweat.webp',
  '🙂': '/reactions/slightly_smiling_face.webp',
  '😢': '/reactions/crying_face.webp',
  '😭': '/reactions/loudly_crying_face.webp',
  '😠': '/reactions/angry_face.webp',
  '🤯': '/reactions/exploding_head.webp',
  '👀': '/reactions/eyes.webp',
  '💗': '/reactions/sparkling_heart.webp',
  '😘': '/reactions/face_blowing_a_kiss.webp',
  '🫠': '/reactions/melting_face.webp',
  '🥲': '/reactions/smiling_face_with_tear.webp',
  '✅': '/reactions/check_mark_button.webp',
  '🥳': '/reactions/party_face.webp',
  '💡': '/reactions/light_bulb.webp',
};

/** Путь анимированного ассета реакции (null — рендерить текстовый глиф). */
export function reactionAsset(emoji: string): string | null {
  return REACTION_ASSETS[emoji] ?? null;
}
