import { Link, Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';

import { SliderPanel } from '../../../app/shell/slider-panel.js';
import { LetterCard } from '../components/letter-card.js';

export function LettersSliderPage() {
  const { letterId } = useParams({ strict: false }) as { letterId: string };
  const navigate = useNavigate();

  return (
    <>
      <SliderPanel
        breadcrumbs={
          <>
            <Link to="/letters" className="hover:text-foreground">
              {ui.letters.title}
            </Link>
            <span>/</span>
            <span className="text-foreground">{ui.letters.letter}</span>
          </>
        }
        onClose={() => void navigate({ to: '/letters' })}
      >
        <LetterCard letterId={letterId} />
      </SliderPanel>
      <Outlet />
    </>
  );
}
