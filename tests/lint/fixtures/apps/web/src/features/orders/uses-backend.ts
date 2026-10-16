// Фикстура-нарушитель: веб импортирует код бэкенда (I1, I6).
import { BetaService } from '../../../../api/src/modules/beta/beta.service.js';

export const backend = BetaService;
