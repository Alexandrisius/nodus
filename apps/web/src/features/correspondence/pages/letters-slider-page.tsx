import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { useShellStore } from '../../../app/shell/shell-store.js';
import { useLetterDetail } from '../api/letters-api.js';
import { LetterCard } from '../components/letter-card.js';

/** Слайдер письма: раскрытие из rect строки журнала (shared-element),
 *  название — в хроме рядом с X; закрытие возвращает папку журнала
 *  (search-параметр не теряется). */
export function LettersSliderPage() {
  const { letterId } = useParams({ strict: false }) as { letterId: string };
  const navigate = useNavigate();
  const [source] = useState(() => useShellStore.getState().lastSource);
  const { data: letter } = useLetterDetail(letterId);

  useEffect(() => {
    useShellStore.getState().setLastSource(null);
  }, []);

  return (
    <>
      <SliderPanel
        title={letter?.subject ?? ui.letters.letter}
        sourceRect={source ?? undefined}
        onClose={() => void navigate({ to: '/letters', search: (prev) => prev })}
      >
        <LetterCard letterId={letterId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
