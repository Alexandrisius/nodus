import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { useLetterDetail } from '../api/letters-api.js';
import { LetterCard } from '../components/letter-card.js';

export function LettersSliderPage() {
  const { letterId } = useParams({ strict: false }) as { letterId: string };
  const navigate = useNavigate();
  const { data: letter } = useLetterDetail(letterId);

  return (
    <>
      <SliderPanel
        title={letter?.subject ?? ui.letters.letter}
        onClose={() => void navigate({ to: '/letters' })}
      >
        <LetterCard letterId={letterId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
