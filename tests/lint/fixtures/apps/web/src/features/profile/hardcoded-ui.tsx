// Фикстура-нарушитель (I15): строки интерфейса литералами вместо i18n.
declare const toast: { error: (message: string) => void };

export function Hardcoded({ name }: { name: string }) {
  toast.error('Не удалось сохранить');
  return (
    <div title="Профиль">
      Сохранить
      {`Привет, ${name}`}
    </div>
  );
}
