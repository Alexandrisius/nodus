// Фикстура-нарушитель: промис без await/catch (потерянная ошибка).
async function save(): Promise<void> {}

export function handler(): void {
  save();
}
