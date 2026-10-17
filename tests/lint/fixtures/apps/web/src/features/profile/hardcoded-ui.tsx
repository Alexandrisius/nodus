// Фикстура-нарушитель (I15): строки интерфейса литералами вместо i18n.
declare const toast: { error: (message: string) => void };

export function Hardcoded({ name, ok }: { name: string; ok: boolean }) {
  toast.error('Не удалось сохранить');
  return (
    <div title="Профиль">
      Сохранить
      {`Привет, ${name}`}
      <span aria-label={ok ? 'Готово' : 'Ошибка'}>{name || 'Без имени'}</span>
    </div>
  );
}
