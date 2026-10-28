import type { LetterAttachment, LetterAttachmentRole } from '@nodus/contracts';
import { officeFormat } from '@nodus/contracts';

import { laid, lfid } from './letter-ids.js';

/** Файлы демо-писем (#55): статические ассеты `public/demo/letters/`
 *  (генерируются один раз; кириллица в PDF — системный шрифт). Подписанная
 *  ссылка в моке — путь ассета; офисный движок в моках выключен, у .docx
 *  есть PDF-копия (`pdfUrl`) — fallback просмотра (#139). */

const DEMO = '/demo/letters/';

/** Маршрут просмотрщика по имени и mime — как серверная классификация. */
export function previewKindOf(name: string, mime: string): LetterAttachment['previewKind'] {
  if (officeFormat(name)) return 'office';
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function demoAttachment(
  n: number,
  role: LetterAttachmentRole,
  name: string,
  asset: string,
  mime: string,
  size: number,
  pdfAsset: string | null = null,
  contentId: string | null = null,
  inline = false,
): LetterAttachment {
  return {
    id: laid(n),
    fileId: lfid(n),
    role,
    name,
    mime,
    size,
    contentId,
    inline,
    url: asset.startsWith('/') ? asset : `${DEMO}${asset}`,
    pdfUrl: pdfAsset ? `${DEMO}${pdfAsset}` : null,
    previewKind: previewKindOf(name, mime),
  };
}

const PDF = 'application/pdf';
const TEXT = 'text/plain';

/** Главные документы зарегистрированных писем Вх-2026/108…117 (по lid). */
export const registeredMain: Record<number, LetterAttachment> = {
  1: demoAttachment(
    1,
    'main',
    'Письмо 04-1-09-3512.pdf',
    'in-108-minstroy-proverka.pdf',
    PDF,
    64434,
  ),
  2: demoAttachment(
    2,
    'main',
    'Письмо 118-09.pdf',
    'in-109-stroyzakazchik-korpus-b.pdf',
    PDF,
    59737,
  ),
  4: demoAttachment(4, 'main', 'КП ТС-09-214.pdf', 'in-110-tehsnab-kp.pdf', PDF, 63992),
  5: demoAttachment(5, 'main', 'Письмо 0359-ОВ-61.pdf', 'in-111-galurgiya-ov.pdf', PDF, 63272),
  6: demoAttachment(6, 'main', 'Счёт-фактура 418.pdf', 'in-112-psm-schet.pdf', PDF, 59364),
  7: demoAttachment(7, 'main', 'Письмо ПСМ-09-77.pdf', 'in-113-psm-grafik.pdf', PDF, 60431),
  8: demoAttachment(8, 'main', 'Письмо 04-3-15-3790.pdf', 'in-114-minstroy-tnpa.pdf', PDF, 64867),
  3: demoAttachment(
    3,
    'main',
    'Письмо 0359-КЖ-147.pdf',
    'in-115-galurgiya-kzh-147.pdf',
    PDF,
    71784,
  ),
  9: demoAttachment(
    9,
    'main',
    'Письмо 131-10.pdf',
    'in-116-stroyzakazchik-dogovor.pdf',
    PDF,
    57379,
  ),
  10: demoAttachment(10, 'main', 'Письмо 0359-203.pdf', 'in-117-galurgiya-priemka.pdf', PDF, 64862),
};

/** Вх-2026/115 (lid 3): ведомость замечаний и текст письма почты. */
export const kzh147Extra: LetterAttachment[] = [
  demoAttachment(11, 'body', 'Текст письма.txt', 'in-115-galurgiya-kzh-147.txt', TEXT, 330),
  demoAttachment(
    12,
    'attachment',
    'Ведомость замечаний КЖ.pdf',
    'in-115-vedomost-zamechaniy.pdf',
    PDF,
    55798,
  ),
];

/** «Новые» (lid 21…26): шесть видов поступления (§7.6). */
export const newLetterFiles = {
  galurgiyaPdf: demoAttachment(
    21,
    'main',
    'Письмо 0359-КЖ-152.pdf',
    'new-galurgiya-kzh-152.pdf',
    PDF,
    68756,
  ),
  galurgiyaText: demoAttachment(
    22,
    'body',
    'Текст письма.txt',
    'new-galurgiya-kzh-152.txt',
    TEXT,
    540,
  ),
  inviteHtml: demoAttachment(
    23,
    'body',
    'Текст письма.html',
    'new-stroyzakazchik-invite.html',
    'text/html',
    3691,
  ),
  invitePlan: demoAttachment(
    24,
    'attachment',
    'Схема площадки.png',
    '/demo/site-1.png',
    'image/png',
    2146336,
  ),
  minstroyDocx: demoAttachment(
    25,
    'main',
    'Запрос сведений 04-2-12-3871.docx',
    'new-minstroy-zapros.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    1520,
    'new-minstroy-zapros.pdf',
  ),
  minstroyText: demoAttachment(
    26,
    'body',
    'Текст письма.txt',
    'new-minstroy-zapros.txt',
    TEXT,
    350,
  ),
  scanJpg: demoAttachment(
    27,
    'main',
    'Скан 22.10.jpg',
    'new-scan-minskenergo.jpg',
    'image/jpeg',
    57021,
  ),
  tehsnabText: demoAttachment(
    28,
    'body',
    'Текст письма.txt',
    'new-tehsnab-utochnenie.txt',
    TEXT,
    887,
  ),
  psmPdf: demoAttachment(
    29,
    'main',
    'График монтажа, ред. 2.pdf',
    'new-psm-grafik-r2.pdf',
    PDF,
    73703,
  ),
};

/** Почтовые письма #56 (lid 27…31) + исходящее lid 30. */
export const mailLetterFiles = {
  /** lid(27): ответ на исходящее — текст тела + подпись .p7s (метка). */
  replyBody: demoAttachment(30, 'body', 'Текст письма.txt', 'new-galurgiya-reply.txt', TEXT, 546),
  replySignature: demoAttachment(
    31,
    'attachment',
    'Подпись 0359-КЖ-152.p7s',
    'new-signature.p7s',
    'application/pkcs7-signature',
    63,
  ),
  /** lid(28): «на № 1 от …» — текст тела. */
  dopuskBody: demoAttachment(32, 'body', 'Текст письма.txt', 'new-galurgiya-dopusk.txt', TEXT, 598),
  /** lid(29): КП с inline-логотипом (cid), winmail.dat (метка Outlook). */
  partnerHtml: demoAttachment(
    33,
    'body',
    'Текст письма.html',
    'new-partner-kp.html',
    'text/html',
    1560,
  ),
  partnerLogo: demoAttachment(
    34,
    'attachment',
    'лого.png',
    'new-partner-logo.png',
    'image/png',
    282,
    null,
    'logo@psm-partner',
    true,
  ),
  partnerWinmail: demoAttachment(
    35,
    'attachment',
    'winmail.dat',
    'new-partner-winmail.dat',
    'application/ms-tnef',
    40,
  ),
  /** lid(30): главный документ исходящего Исх-2026/1. */
  outgoingOffer: demoAttachment(
    36,
    'main',
    'Оферта 131-10.pdf',
    'in-116-stroyzakazchik-dogovor.pdf',
    PDF,
    57379,
  ),
};
