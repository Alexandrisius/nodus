// Фикстура: кириллица в логике (сравнение, ключ) — не строка интерфейса, правило молчит.
export function isDraft(status: string): boolean {
  return status === 'Черновик';
}

export function Label({ text }: { text: string }) {
  return <span data-kind={isDraft(text) ? 'draft' : 'final'}>{text}</span>;
}
