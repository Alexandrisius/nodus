// Фикстура-нарушитель: импорт чужого модуля запрещён (I3, I6).
import { BetaService } from '../beta/beta.service.js';

export class AlphaService {
  readonly beta = new BetaService();
}
