import { ui } from '@nodus/contracts';

/**
 * Галочки отправлено/прочитано (вердикт владельца 14.09.2026, канон
 * Телеграма/Битрикс24): одна — отправлено, две — прочитано; рядом с временем
 * ВНУТРИ пузыря, только у своих сообщений. Геометрия по вердикту владельца:
 * ЛЕВАЯ галочка видна вся и рисуется ПОСЛЕДНЕЙ (поверх), ПРАВАЯ рисуется
 * первой и у неё КОРОТКАЯ левая ножка — читаются только длинная палочка и
 * крошечный уголок поворота, остальное прячется за левой галочкой. Цвет —
 * currentColor (тон времени пузыря): без нового цветового акцента.
 */
export function ReadTicks({ read }: { read: boolean }) {
  return (
    <svg
      role="img"
      aria-label={read ? ui.chat.read : ui.chat.sent}
      width="15"
      height="10"
      viewBox="0 0 15 10"
      className="shrink-0"
    >
      {read ? (
        <path
          d="M7.5 6.5 L9.5 8.5 L14.5 1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <path
        d="M1.5 5.5 L4.5 8.5 L10.5 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
