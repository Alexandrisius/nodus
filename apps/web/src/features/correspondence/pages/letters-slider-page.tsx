import { Outlet, useNavigate, useParams } from '@tanstack/react-router';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { LetterCard } from '../components/letter-card.js';

export function LettersSliderPage() {
  const { letterId } = useParams({ strict: false }) as { letterId: string };
  const navigate = useNavigate();

  return (
    <>
      <SliderPanel onClose={() => void navigate({ to: '/letters' })}>
        <LetterCard letterId={letterId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
