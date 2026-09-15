/**
 * Модальность ввода (мышь/клавиатура) — install-once трекер окна.
 * Потребитель — SliderPanel (аудит #45, баг-вердикт 15.09.2026): возврат
 * фокуса триггеру при закрытии карточки — ТОЛЬКО если карточка открыта
 * клавиатурой; иначе строка-источник после Esc получает focus-visible
 * рамку — мышевому пользователю читалось «жирной толстой рамкой».
 */
let modality: 'mouse' | 'keyboard' = 'mouse';
let installed = false;

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', () => (modality = 'keyboard'), {
    capture: true,
    passive: true,
  });
  window.addEventListener('pointerdown', () => (modality = 'mouse'), {
    capture: true,
    passive: true,
  });
}

export function inputModality(): 'mouse' | 'keyboard' {
  install();
  return modality;
}
