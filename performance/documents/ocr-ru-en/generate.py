# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow==11.3.0", "numpy==2.3.4"]
# ///
"""Renders the synthetic page set: 8 documents x 7 scan and photo variants, plus the expected text of each document.

All names, numbers and addresses are invented. The pages are rebuilt from the seed, so no image is committed.
"""

import hashlib
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SEED = 20261124
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / ".cache/wirecat-ocr-bench/pages")
FONTS = {
  "serif": "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
  "sans": "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "sans_bold": "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "dejavu": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "mono": "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
  "noto_serif": "/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf",
  "noto_sans": "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
}
DPI = 300
A4 = (2480, 3508)
MARGIN = 220


def pt(size):
  return round(size * DPI / 72)


def font(name, size):
  return ImageFont.truetype(FONTS[name], pt(size))


class Page:
  def __init__(self, size=A4, margin=MARGIN):
    self.img = Image.new("L", size, 255)
    self.draw = ImageDraw.Draw(self.img)
    self.margin = margin
    self.y = margin
    self.lines = []

  def wrap(self, text, f, width):
    words, lines, line = text.split(), [], ""
    for word in words:
      probe = f"{line} {word}".strip()
      if self.draw.textlength(probe, font=f) <= width:
        line = probe
      else:
        lines.append(line)
        line = word
    if line:
      lines.append(line)
    return lines

  def para(self, text, f, x=None, width=None, align="left", gap=0.5, record=True):
    x = self.margin if x is None else x
    width = (self.img.width - 2 * self.margin) if width is None else width
    step = round(f.size * 1.25)
    for line in self.wrap(text, f, width):
      lx = x
      if align == "center":
        lx = x + (width - self.draw.textlength(line, font=f)) / 2
      elif align == "right":
        lx = x + width - self.draw.textlength(line, font=f)
      self.draw.text((lx, self.y), line, font=f, fill=0)
      if record:
        self.lines.append(line)
      self.y += step
    self.y += round(step * gap)

  def line(self, text, f):
    """One line drawn as written, spaces kept (a receipt aligns its sums with spaces)."""
    self.draw.text((self.margin, self.y), text, font=f, fill=0)
    self.lines.append(" ".join(text.split()))
    self.y += round(f.size * 1.25)

  def row(self, cells, f, widths, border=True):
    """A table row: cells left to right; the expected text reads a table row by row."""
    x = self.margin
    h = round(f.size * 1.9)
    for cell, w in zip(cells, widths):
      if border:
        self.draw.rectangle([x, self.y, x + w, self.y + h], outline=0, width=3)
      self.draw.text((x + 14, self.y + round(f.size * 0.35)), cell, font=f, fill=0)
      x += w
    self.lines.append(" ".join(cells))
    self.y += h

  def text(self):
    return "\n".join(self.lines)


def ru_contract():
  p = Page()
  p.para("ДОГОВОР № 47/2026 ОКАЗАНИЯ УСЛУГ", font("sans_bold", 13), align="center", gap=0.2)
  p.para("г. Екатеринбург «14» марта 2026 г.", font("serif", 11), align="right", gap=1)
  body = font("serif", 11)
  p.para(
    "Общество с ограниченной ответственностью «Северный Ветер», именуемое в дальнейшем «Исполнитель», в лице "
    "генерального директора Колесникова Игоря Петровича, действующего на основании Устава, с одной стороны, и "
    "индивидуальный предприниматель Морозова Анна Сергеевна, именуемая в дальнейшем «Заказчик», с другой стороны, "
    "заключили настоящий договор о нижеследующем.",
    body,
  )
  p.para("1. ПРЕДМЕТ ДОГОВОРА", font("sans_bold", 11), gap=0.2)
  p.para(
    "1.1. Исполнитель обязуется по заданию Заказчика оказать услуги по бухгалтерскому сопровождению, а Заказчик "
    "обязуется принять и оплатить эти услуги в порядке и сроки, установленные настоящим договором.",
    body,
  )
  p.para(
    "1.2. Срок оказания услуг: с 01.04.2026 по 31.12.2026. Объём работ определяется в приложении № 1, которое "
    "является неотъемлемой частью договора.",
    body,
  )
  p.para("2. СТОИМОСТЬ УСЛУГ И ПОРЯДОК РАСЧЁТОВ", font("sans_bold", 11), gap=0.2)
  p.para(
    "2.1. Стоимость услуг составляет 38 500 (тридцать восемь тысяч пятьсот) рублей 00 копеек в месяц, НДС не "
    "облагается в связи с применением упрощённой системы налогообложения.",
    body,
  )
  p.para(
    "2.2. Оплата производится ежемесячно не позднее 5-го числа месяца, следующего за отчётным, путём перечисления "
    "денежных средств на расчётный счёт Исполнителя. Обязательство Заказчика по оплате считается исполненным с "
    "момента зачисления средств на корреспондентский счёт банка Исполнителя.",
    body,
  )
  p.para("3. ОТВЕТСТВЕННОСТЬ СТОРОН", font("sans_bold", 11), gap=0.2)
  p.para(
    "3.1. За просрочку оплаты Исполнитель вправе потребовать уплаты пени в размере 0,1% от неоплаченной суммы за "
    "каждый день просрочки, но не более 10% от стоимости услуг за месяц.",
    body,
  )
  p.para(
    "3.2. Стороны освобождаются от ответственности за частичное или полное неисполнение обязательств, если оно "
    "явилось следствием обстоятельств непреодолимой силы: пожара, наводнения, землетрясения, решений органов "
    "государственной власти.",
    body,
  )
  return p, "ru"


def ru_invoice():
  p = Page()
  p.para("ООО «Техносфера-Юг»", font("sans_bold", 12), gap=0.1)
  p.para("ИНН 6164123456 КПП 616401001", font("sans", 10), gap=0.1)
  p.para("344002, г. Ростов-на-Дону, ул. Береговая, д. 8, офис 312", font("sans", 10), gap=1)
  p.para("СЧЁТ НА ОПЛАТУ № 1186 от 21 октября 2026 г.", font("sans_bold", 14), align="center", gap=1)
  p.para("Покупатель: ООО «Зелёная Долина», ИНН 2310987654, г. Краснодар, ул. Северная, д. 41", font("sans", 10))
  f = font("sans", 10)
  widths = [120, 900, 220, 170, 300, 330]
  p.row(["№", "Наименование товара", "Кол-во", "Ед.", "Цена", "Сумма"], font("sans_bold", 10), widths)
  rows = [
    ["1", "Ноутбук Lenovo ThinkPad E14", "3", "шт.", "74 900,00", "224 700,00"],
    ["2", "Монитор Dell 27 дюймов", "3", "шт.", "21 450,00", "64 350,00"],
    ["3", "Кабель HDMI 2.1, 1,8 м", "6", "шт.", "690,00", "4 140,00"],
    ["4", "Установка и настройка ПО", "1", "усл.", "12 000,00", "12 000,00"],
    ["5", "Доставка по городу", "1", "усл.", "1 500,00", "1 500,00"],
  ]
  for r in rows:
    p.row(r, f, widths)
  p.y += 40
  p.para("Итого: 306 690,00", font("sans_bold", 11), align="right", gap=0.1)
  p.para("В том числе НДС (20%): 51 115,00", font("sans", 11), align="right", gap=0.1)
  p.para("Всего к оплате: 306 690,00 руб.", font("sans_bold", 11), align="right", gap=1)
  p.para(
    "Всего наименований 5, на сумму 306 690,00 руб. Триста шесть тысяч шестьсот девяносто рублей 00 копеек.",
    font("sans", 10),
  )
  p.para(
    "Оплата данного счёта означает согласие с условиями поставки товара. Товар отпускается по факту прихода денег "
    "на р/с Поставщика, самовывозом, при наличии доверенности и паспорта.",
    font("sans", 9),
  )
  p.para("Руководитель ____________ Гончаренко В. А.   Бухгалтер ____________ Ильина Т. М.", font("sans", 10))
  return p, "ru"


def ru_letter():
  p = Page()
  p.para("Министерство образования Ярославской области", font("noto_serif", 10), align="right", gap=0.1)
  p.para("Директору МОУ СОШ № 12 Смирновой Е. В.", font("noto_serif", 10), align="right", gap=1.5)
  p.para("Уважаемая Елена Викторовна!", font("noto_serif", 12), align="center", gap=1)
  body = font("noto_serif", 11)
  for text in [
    "Сообщаем, что в соответствии с планом мероприятий на 2026/2027 учебный год в период с 16 по 20 ноября в "
    "Вашей школе будет проведена плановая выездная проверка соблюдения требований к организации питания "
    "обучающихся.",
    "Просим подготовить к началу проверки следующие документы: приказ об организации горячего питания, "
    "двухнедельное цикличное меню, журнал бракеража готовой продукции, договоры с поставщиками продуктов, а "
    "также акты лабораторных исследований за последние шесть месяцев.",
    "Ответственным за взаимодействие с комиссией прошу назначить заместителя директора по хозяйственной части. "
    "Контактное лицо со стороны министерства: Белова Ольга Николаевна, телефон (4852) 40-17-93, кабинет 214.",
    "Обращаем внимание, что выявленные нарушения должны быть устранены в течение тридцати календарных дней с "
    "момента получения акта проверки, а отчёт об их устранении направлен в адрес министерства.",
  ]:
    p.para(text, body)
  p.y += 80
  p.para("Заместитель министра                                   А. Д. Ершов", font("noto_serif", 11), gap=0.2)
  p.para("Исп. Белова О. Н., 40-17-93", font("noto_serif", 8))
  return p, "ru"


def ru_receipt():
  p = Page(size=(945, 1500), margin=50)
  f = font("mono", 8)
  lines = [
    "ООО «ПРОДУКТЫ У ДОМА»",
    "г. Казань, ул. Чистопольская, 19",
    "ИНН 1657000111",
    "КАССОВЫЙ ЧЕК № 0381",
    "Смена № 112  03.11.2026 18:42",
    "Кассир: Галиева Р.",
    "--------------------------",
    "Молоко 3,2% 1 л",
    "  2 x 89,90       =179,80",
    "Хлеб Бородинский",
    "  1 x 54,00        =54,00",
    "Сыр Российский 0,412 кг",
    "  1 x 271,50      =271,50",
    "Яблоки Голден 1,250 кг",
    "  1 x 149,99      =149,99",
    "Пакет-майка",
    "  1 x 7,00          =7,00",
    "--------------------------",
    "ИТОГ              =662,29",
    "Безналичными      =662,29",
    "НДС 10%            =48,37",
    "НДС 20%             =1,17",
    "--------------------------",
    "ФН 7380440700123456",
    "ФД 50417  ФП 2869013377",
    "СПАСИБО ЗА ПОКУПКУ!",
  ]
  for line in lines:
    p.line(line, f)
  return p, "ru"


def en_letter():
  p = Page()
  p.para("Harbor & Finch Legal LLP", font("serif", 14), gap=0.1)
  p.para("221 Wexley Street, Suite 400, Portland, OR 97205", font("serif", 10), gap=1.5)
  p.para("October 7, 2026", font("serif", 11), gap=1)
  p.para("Ms. Rebecca Holloway, Operations Director, Brightwater Logistics Inc.", font("serif", 11), gap=1)
  p.para("Re: Notice of Lease Renewal, Unit 14B, Riverside Industrial Park", font("serif", 11), gap=1)
  body = font("serif", 11)
  for text in [
    "Dear Ms. Holloway,",
    "We write on behalf of our client, Riverside Holdings LLC, regarding the commercial lease dated March 1, 2023 "
    "for the warehouse premises known as Unit 14B. Under Section 12.3 of the lease, the current term expires on "
    "February 28, 2027, and your company holds an option to renew for one additional term of three years.",
    "To exercise the option, written notice must reach our client no later than November 30, 2026. The base rent "
    "for the renewal term will be adjusted to $18.75 per square foot per year, an increase of 4.2% over the "
    "current rate, with all other terms remaining unchanged.",
    "Please note that the landlord intends to replace the loading dock doors during the second quarter of 2027. "
    "The work is expected to take approximately ten business days, and access to the premises will be maintained "
    "through the east entrance throughout that period.",
    "If you have any questions, please contact me directly at (503) 555-0148 or by email at "
    "j.mercer@harborfinch.example.",
    "Sincerely,",
    "Jonathan Mercer, Partner",
  ]:
    p.para(text, body)
  return p, "en"


def en_invoice():
  p = Page()
  p.para("INVOICE", font("dejavu", 20), align="right", gap=0.3)
  p.para("Invoice No. INV-2026-0917    Date: 09/17/2026    Due: 10/17/2026", font("dejavu", 10), align="right", gap=1)
  p.para("Bill to: Northwind Analytics GmbH, Lindenstrasse 12, 10969 Berlin, Germany", font("dejavu", 10), gap=0.2)
  p.para("VAT ID: DE298765432", font("dejavu", 10), gap=1)
  widths = [1000, 230, 380, 410]
  p.row(["Description", "Qty", "Unit price", "Amount"], font("dejavu", 10), widths)
  f = font("dejavu", 10)
  for r in [
    ["Cloud hosting, Standard plan (Sep)", "1", "$1,240.00", "$1,240.00"],
    ["Additional storage, 500 GB", "2", "$45.50", "$91.00"],
    ["Priority support hours", "6", "$120.00", "$720.00"],
    ["Data migration service", "1", "$2,350.00", "$2,350.00"],
    ["SSL certificate, wildcard", "1", "$189.99", "$189.99"],
  ]:
    p.row(r, f, widths)
  p.y += 40
  p.para("Subtotal: $4,590.99", font("dejavu", 11), align="right", gap=0.1)
  p.para("Discount (5%): -$229.55", font("dejavu", 11), align="right", gap=0.1)
  p.para("Total due: $4,361.44", font("dejavu", 12), align="right", gap=1)
  p.para(
    "Payment terms: net 30 days. Please include the invoice number in the payment reference. Late payments are "
    "subject to a fee of 1.5% per month on the outstanding balance.",
    font("dejavu", 9),
  )
  p.para("Bank: First Coastal Bank, IBAN US00 FCBK 0000 1234 5678 90, SWIFT FCBKUS33", font("dejavu", 9))
  return p, "en"


def mix_two_columns():
  p = Page()
  p.para("Положение о защите данных / Data Protection Policy", font("noto_sans", 13), align="center", gap=1)
  gutter = 90
  col = (p.img.width - 2 * p.margin - gutter) // 2
  f = font("noto_sans", 10)
  left = [
    "1. Компания обрабатывает персональные данные клиентов только для исполнения договора и выполнения "
    "требований закона. Данные хранятся на серверах в Российской Федерации.",
    "2. Доступ к данным имеют только сотрудники, которым он необходим для работы. Каждый доступ записывается "
    "в журнал и хранится не менее одного года.",
    "3. Клиент вправе запросить копию своих данных, их исправление или удаление, направив письмо на адрес "
    "privacy@severveter.example. Ответ направляется в течение 10 рабочих дней.",
    "4. Резервные копии создаются ежедневно и шифруются по алгоритму AES-256. Ключи хранятся отдельно от копий.",
  ]
  right = [
    "1. The company processes personal data of its clients only to perform the contract and to comply with the "
    "law. The data is stored on servers located in the Russian Federation.",
    "2. Only employees who need the data for their work have access to it. Every access is logged and the log "
    "is kept for at least one year.",
    "3. A client may request a copy of their data, its correction or deletion by writing to "
    "privacy@severveter.example. A reply is sent within 10 business days.",
    "4. Backups are made daily and encrypted with AES-256. The keys are kept separately from the backups.",
  ]
  top = p.y
  for text in left:
    p.para(text, f, width=col)
  p.y = top
  for text in right:
    p.para(text, f, x=p.margin + col + gutter, width=col)
  return p, "mixed"


def mix_contract():
  p = Page()
  p.para("Приложение № 2 к договору № SLA-118 от 02.09.2026", font("sans", 10), align="right", gap=1)
  p.para("Соглашение об уровне обслуживания (SLA)", font("sans_bold", 13), align="center", gap=1)
  body = font("sans", 11)
  for text in [
    "1. Исполнитель обеспечивает доступность сервиса CloudDesk Pro не ниже 99,9% в календарный месяц. "
    "Доступность измеряется системой мониторинга Uptime Robot с интервалом проверки 60 секунд.",
    "2. Обращения принимаются через портал support.clouddesk.example, по e-mail help@clouddesk.example или по "
    "телефону +7 (495) 123-45-67. Каждому обращению присваивается номер вида TKT-000000.",
    "3. Время реакции: критический инцидент (Severity 1) — 30 минут, высокий приоритет (Severity 2) — 2 часа, "
    "обычный запрос (Severity 3) — 1 рабочий день.",
    "4. Плановые работы проводятся в окно обслуживания: воскресенье с 02:00 до 06:00 по московскому времени, с "
    "уведомлением не менее чем за 72 часа через Telegram-канал и рассылку.",
    "5. При нарушении доступности Заказчику предоставляется скидка (service credit): 5% от ежемесячного платежа "
    "за каждые 0,5% ниже целевого уровня, но не более 30%.",
    "6. Интеграции с Microsoft 365, Google Workspace и Slack поддерживаются в рамках тарифа Enterprise; API "
    "версии v2 доступен по адресу api.clouddesk.example/v2.",
  ]:
    p.para(text, body)
  return p, "mixed"


DOCS = {
  "ru-contract": ru_contract,
  "ru-invoice": ru_invoice,
  "ru-letter": ru_letter,
  "ru-receipt": ru_receipt,
  "en-letter": en_letter,
  "en-invoice": en_invoice,
  "mix-two-columns": mix_two_columns,
  "mix-contract": mix_contract,
}


def to_rgb(img):
  return img.convert("RGB")


def clean300(img, rng):
  return to_rgb(img), "png"


def dpi150(img, rng):
  return to_rgb(img.resize((img.width // 2, img.height // 2), Image.LANCZOS)), "png"


def noise_blur(img, rng):
  arr = np.asarray(img.filter(ImageFilter.GaussianBlur(1.6)), dtype=np.float32)
  arr += np.random.default_rng(rng.randrange(1 << 30)).normal(0, 28, arr.shape)
  return to_rgb(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))), "png"


def rotate_small(img, rng):
  angle = rng.uniform(2, 5) * rng.choice([-1, 1])
  return to_rgb(img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=255)), "png"


def rotate90(img, rng):
  return to_rgb(img.rotate(90, expand=True)), "png"


def perspective_coeffs(src, dst):
  rows = []
  for (x, y), (u, v) in zip(dst, src):
    rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
    rows.append([0, 0, 0, x, y, 1, -v * x, -v * y])
  a = np.array(rows, dtype=np.float64)
  b = np.array(src, dtype=np.float64).reshape(8)
  return np.linalg.solve(a, b).tolist()


def photo_of(img, rng):
  """A page on a darker desk, shot at a slant, with light falling off towards one corner."""
  w, h = img.size
  pad = int(0.08 * w)
  canvas = Image.new("L", (w + 2 * pad, h + 2 * pad), 95)
  canvas.paste(img, (pad, pad))
  cw, ch = canvas.size

  def j(s):
    return rng.uniform(0.01, 0.05) * s

  corners = [(pad, pad), (pad + w, pad), (pad + w, pad + h), (pad, pad + h)]
  moved = [
    (corners[0][0] + j(w), corners[0][1] + j(h)),
    (corners[1][0] - j(w), corners[1][1] + j(h) * 0.5),
    (corners[2][0] - j(w) * 0.3, corners[2][1] - j(h) * 0.3),
    (corners[3][0] + j(w) * 0.6, corners[3][1] - j(h) * 0.2),
  ]
  warped = canvas.transform(
    (cw, ch), Image.PERSPECTIVE, perspective_coeffs(corners, moved), Image.BICUBIC, fillcolor=95
  )
  yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
  cx, cy = rng.uniform(0, cw), rng.uniform(0, ch)
  dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / math.hypot(cw, ch)
  light = 1.05 - 0.55 * dist
  arr = np.asarray(warped, dtype=np.float32) * light
  rgb = np.stack([arr * 1.0, arr * 0.97, arr * 0.9], axis=-1)
  out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
  return out


def photo(img, rng):
  return photo_of(img, rng), "png"


def phone_jpeg(img, rng):
  shot = photo_of(img, rng)
  scale = 1600 / max(shot.size)
  return shot.resize((round(shot.width * scale), round(shot.height * scale)), Image.LANCZOS), "jpg"


VARIANTS = {
  "clean-300dpi": clean300,
  "scan-150dpi": dpi150,
  "noise-blur": noise_blur,
  "rotated-2-5deg": rotate_small,
  "rotated-90deg": rotate90,
  "photo-perspective": photo,
  "phone-jpeg": phone_jpeg,
}


def main():
  OUT.mkdir(parents=True, exist_ok=True)
  # Reading a blank picture times the start and the model load alone.
  Image.new("RGB", (64, 64), "white").save(OUT / "blank.png")
  manifest = {"seed": SEED, "fonts": {}, "pages": []}
  for name, path in FONTS.items():
    manifest["fonts"][name] = {"path": path, "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest()}
  for doc, build in DOCS.items():
    page, lang = build()
    (OUT / f"{doc}.txt").write_text(page.text() + "\n", encoding="utf-8")
    for variant, make in VARIANTS.items():
      rng = random.Random(f"{SEED}:{doc}:{variant}")
      img, ext = make(page.img, rng)
      file = f"{doc}__{variant}.{ext}"
      if ext == "jpg":
        img.save(OUT / file, "JPEG", quality=35)
      else:
        img.save(OUT / file, dpi=(DPI // 2, DPI // 2) if variant == "scan-150dpi" else (DPI, DPI))
      manifest["pages"].append({"file": file, "doc": doc, "variant": variant, "lang": lang, "size": img.size})
  (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
  print(f"{len(manifest['pages'])} pages in {OUT}")


if __name__ == "__main__":
  main()
