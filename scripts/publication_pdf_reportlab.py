import io
import json
import re
import sys
import base64
import urllib.request
from html import unescape
from pathlib import Path

from PIL import Image as PILImage, ImageFile, ImageOps
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle


PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.58 * inch
BRAND = colors.HexColor("#10263f")
BLUE = colors.HexColor("#1f78d1")
LINE = colors.HexColor("#d8e0e8")
MUTED = colors.HexColor("#526273")
WARM = colors.HexColor("#1a1510")
CARD = colors.HexColor("#1f1a14")
GOLD = colors.HexColor("#d4a853")
CREAM = colors.HexColor("#f5efe4")
RUST = colors.HexColor("#c0603a")
LOGO_PATH = Path(__file__).resolve().parents[1] / "icons" / "vibe-logo-pdf.png"
ImageFile.LOAD_TRUNCATED_IMAGES = True


def register_pdf_fonts():
    regular_candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    bold_candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
    ]
    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)
    if regular and bold:
        pdfmetrics.registerFont(TTFont("VibeSans", str(regular)))
        pdfmetrics.registerFont(TTFont("VibeSansBold", str(bold)))
        return "VibeSans", "VibeSansBold"
    return "Helvetica", "Helvetica-Bold"


FONT_REGULAR, FONT_BOLD = register_pdf_fonts()


def clean_html(value):
    text = re.sub(r"<style[\s\S]*?</style>", " ", str(value or ""), flags=re.I)
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    if any(marker in text for marker in (chr(0x00C3), chr(0x00C2), chr(0xFFFD))):
        try:
            text = text.encode("latin1").decode("utf-8")
        except Exception:
            pass
    noise = [
        "Uso: evidencia consultable para reportes, memoria y publicaciones. Revisar antes de publicar.",
        "Si necesitas conservar diseno visual completo, usa tambien la exportacion HTML.",
    ]
    for item in noise:
        text = text.replace(item, " ")
    text = re.sub(r"\blabels\.categoryLabels\.", "", text, flags=re.I)
    text = re.sub(r"\b(vibeapp-native|Storage privado|Supabase|URL firmada|sincronizado con Storage privado)\b", "", text, flags=re.I)
    text = re.sub(r"\bSe(?:ñ|\u00c3\u00b1)al\s+(?:location|ubicaci(?:o|ó|\u00c3\u00b3)n)\s+recibida\s+desde\s+", "", text, flags=re.I)
    text = re.sub(r"\bUbicaci(?:o|ó|\u00c3\u00b3)n\s+desde\s+", "", text, flags=re.I)
    text = re.sub(r"\bCaptura\s+m(?:o|ó|\u00c3\u00b3)vil\b", "", text, flags=re.I)
    text = re.sub(r"\bprimary-user[-\w]*\b", "", text, flags=re.I)
    text = re.sub(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", "", text, flags=re.I)
    text = re.sub(r"\b[\w.-]+\.(?:jpg|jpeg|png|gif|webp|heic|mp4|mov|webm|mp3|wav|m4a|pdf|docx?|txt|csv|json|zip)\b", "", text, flags=re.I)
    text = text.replace("Extracción local automática para", "Lectura de")
    text = text.replace("Extracci\u00c3\u00b3n local autom\u00c3\u00a1tica para", "Lectura de")
    return " ".join(text.split())


def polish(value):
    text = clean_html(value)
    replacements = {
        "Publicacion": "Publicación",
        "publicacion": "publicación",
        "Aprobacion": "Aprobación",
        "energia": "energía",
        "revision": "revisión",
        "tecnica": "técnica",
        "auditoria": "auditoría",
        "version": "versión",
        "diseno": "diseño",
        "tambien": "también",
        "exportacion": "exportación",
        "album": "álbum",
        "Album": "Álbum",
        "extension": "extensión",
        "segun": "según",
        "compartira": "compartirá",
        "automaticamente": "automáticamente",
        "esta configurada": "esté configurada",
        "imagenes": "imágenes",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text


def short(value, limit=420):
    text = polish(value)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


def sentence_summary(text, max_sentences=2, limit=360):
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean_html(text)) if part.strip()]
    selected = " ".join(parts[:max_sentences]) or clean_html(text)
    return short(selected, limit)


def editorial_body(text, limit=900):
    cleaned = clean_html(text)
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    body = " ".join(parts[2:9]) if len(parts) > 2 else cleaned
    return short(body, limit)


def styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("Titlex", parent=base["Title"], fontName=FONT_BOLD, fontSize=29, leading=34, textColor=colors.white, alignment=TA_LEFT))
    base.add(ParagraphStyle("Subx", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=12, leading=17, textColor=colors.HexColor("#eef4ff")))
    base.add(ParagraphStyle("H1x", parent=base["Heading1"], fontName=FONT_BOLD, fontSize=19, leading=23, textColor=BRAND))
    base.add(ParagraphStyle("H2x", parent=base["Heading2"], fontName=FONT_BOLD, fontSize=13, leading=16, textColor=BRAND))
    base.add(ParagraphStyle("Bodyx", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=9.1, leading=12.8, textColor=colors.HexColor("#26313d"), wordWrap="CJK"))
    base.add(ParagraphStyle("Muted", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=8, leading=10.6, textColor=MUTED, wordWrap="CJK"))
    base.add(ParagraphStyle("Center", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=8.8, leading=11.8, textColor=MUTED, alignment=TA_CENTER, wordWrap="CJK"))
    return base


ST = styles()


def para(text, style="Bodyx"):
    safe = polish(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe, ST[style])


def draw_logo(canvas, x, y, width=1.25 * inch):
    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), x, y, width=width, height=width * 0.545, preserveAspectRatio=True, mask="auto")


def logo_flowable(width=1.5 * inch):
    if not LOGO_PATH.exists():
        return para("Vibe", "Subx")
    image = Image(str(LOGO_PATH))
    image.drawWidth = width
    image.drawHeight = width * 0.545
    return image


def page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#fbfcfe"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#f8efe3"))
    canvas.rect(0, PAGE_HEIGHT - 0.2 * inch, PAGE_WIDTH, 0.2 * inch, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_HEIGHT - 0.035 * inch, PAGE_WIDTH, 0.035 * inch, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont(FONT_BOLD, 8)
    canvas.drawString(MARGIN, 0.32 * inch, "Vibe - Documento editado ReportLab")
    canvas.setFillColor(GOLD)
    canvas.roundRect(MARGIN, 0.22 * inch, 0.38 * inch, 0.035 * inch, 1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT_REGULAR, 8)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.32 * inch, f"Página {doc.page}")
    canvas.restoreState()


def hero(title, subtitle):
    left_width = PAGE_WIDTH - 2 * MARGIN - 2.15 * inch
    table = Table(
        [
            [para(title, "Titlex"), logo_flowable(1.55 * inch)],
            [para(subtitle, "Subx"), ""],
        ],
        colWidths=[left_width, 1.55 * inch],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARM),
        ("SPAN", (1, 0), (1, 1)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 26),
        ("RIGHTPADDING", (0, 0), (-1, -1), 24),
        ("TOPPADDING", (0, 0), (-1, -1), 30),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 34),
        ("LINEBELOW", (0, -1), (-1, -1), 3, GOLD),
        ("BOX", (0, 0), (-1, -1), 0, WARM),
    ]))
    return table


def card(title, body, width=None):
    width = width or (PAGE_WIDTH - 2 * MARGIN)
    t = Table([[para(title, "H2x")], [para(body, "Bodyx")]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fbf6ed")),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t


class PublicationDashboard(Flowable):
    def __init__(self, stats, media_count=0, highlights_count=0):
        super().__init__()
        self.stats = stats or {}
        self.media_count = media_count
        self.highlights_count = highlights_count

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 1.58 * inch
        return avail_width, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        values = [
            ("Experiencias", self.stats.get("experiences", "-"), BLUE),
            ("Evidencias", self.stats.get("evidence", self.media_count), colors.HexColor("#0d7c66")),
            ("Momentos", self.highlights_count, colors.HexColor("#f2b84b")),
            ("Contextos", self.stats.get("context", 0), colors.HexColor("#7a5cc8")),
        ]
        gap = 7
        card_w = (w - gap * 3) / 4
        for idx, (label, value, color) in enumerate(values):
            x = idx * (card_w + gap)
            c.setFillColor(CARD)
            c.setStrokeColor(colors.HexColor("#2e2820"))
            c.roundRect(x, 0, card_w, h, 8, fill=1, stroke=1)
            c.setFillColor(color)
            c.roundRect(x + 8, h - 18, card_w - 16, 6, 3, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont(FONT_BOLD, 15)
            c.drawCentredString(x + card_w / 2, h / 2 + 4, str(value))
            c.setFillColor(colors.HexColor("#b0a090"))
            c.setFont(FONT_REGULAR, 7.5)
            c.drawCentredString(x + card_w / 2, 18, label)


def editorial_cards(rows):
    table_rows = []
    card_width = (PAGE_WIDTH - 2 * MARGIN - 10) / 2
    for index in range(0, len(rows), 2):
        row = []
        for title, body, accent in rows[index:index + 2]:
            row.append(text_card(title, body, accent, width=card_width))
        while len(row) < 2:
            row.append("")
        table_rows.append(row)
    table = Table(table_rows, colWidths=[card_width, card_width])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


class MemoryTimeline(Flowable):
    def __init__(self, highlights):
        super().__init__()
        self.highlights = (highlights or [])[:5]

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 1.15 * inch
        return avail_width, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        if not self.highlights:
            c.setFillColor(MUTED)
            c.setFont(FONT_REGULAR, 9)
            c.drawString(0, h / 2, "Sin momentos seleccionados.")
            return
        y = h - 22
        step = w / max(1, len(self.highlights))
        c.setStrokeColor(LINE)
        c.setLineWidth(2)
        c.line(18, y, w - 18, y)
        for index, item in enumerate(self.highlights):
            x = step * index + step / 2
            c.setFillColor(BLUE if index % 2 == 0 else colors.HexColor("#0d7c66"))
            c.circle(x, y, 8, fill=1, stroke=0)
            c.setFillColor(BRAND)
            c.setFont(FONT_BOLD, 7.4)
            title = short(item.get("title") or "Momento", 28)
            c.drawCentredString(x, y - 22, title)
            c.setFillColor(MUTED)
            c.setFont(FONT_REGULAR, 6.8)
            meta = short(item.get("category") or item.get("location") or "", 24)
            c.drawCentredString(x, y - 34, meta)


class MediaMosaic(Flowable):
    def __init__(self, media):
        super().__init__()
        self.media = (media or [])[:8]

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 1.35 * inch
        return avail_width, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        if not self.media:
            c.setFillColor(MUTED)
            c.setFont(FONT_REGULAR, 9)
            c.drawString(0, h / 2, "Sin multimedia seleccionada.")
            return
        cols = 4
        gap = 6
        tile_w = (w - gap * (cols - 1)) / cols
        tile_h = (h - gap) / 2
        for index, item in enumerate(self.media):
            row = index // cols
            col = index % cols
            x = col * (tile_w + gap)
            y = h - (row + 1) * tile_h - row * gap
            kind = human_kind(item)
            color = {
                "Imagen": colors.HexColor("#1f78d1"),
                "Video": colors.HexColor("#7a5cc8"),
                "Audio": colors.HexColor("#0d7c66"),
                "Documento": colors.HexColor("#f2b84b"),
            }.get(kind, colors.HexColor("#526273"))
            c.setFillColor(colors.white)
            c.setStrokeColor(LINE)
            c.roundRect(x, y, tile_w, tile_h, 7, fill=1, stroke=1)
            c.setFillColor(color)
            c.roundRect(x + 7, y + tile_h - 18, tile_w - 14, 6, 3, fill=1, stroke=0)
            c.setFillColor(BRAND)
            c.setFont(FONT_BOLD, 8)
            c.drawString(x + 8, y + tile_h - 34, kind)
            c.setFillColor(MUTED)
            c.setFont(FONT_REGULAR, 6.8)
            c.drawString(x + 8, y + 11, f"Activo {index + 1}")


def paragraph_block(title, text, width=None, max_parts=5, part_limit=420):
    width = width or (PAGE_WIDTH - 2 * MARGIN)
    paragraphs = [part.strip() for part in str(text or "").split("\n") if part.strip()]
    if not paragraphs:
        paragraphs = [str(text or "Sin contenido disponible.")]
    rows = [[para(title, "H2x")]]
    for part in paragraphs[:max_parts]:
        if part.startswith("- "):
            continue
        rows.append([para(short(part, part_limit), "Bodyx")])
    t = Table(rows, colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def section_heading(title, subtitle=""):
    rows = [[para(title, "H1x")]]
    if subtitle:
        rows.append([para(subtitle, "Muted")])
    table = Table(rows, colWidths=[PAGE_WIDTH - 2 * MARGIN])
    table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def story_paragraphs(body):
    parts = [part.strip() for part in str(body or "").split("\n") if part.strip()]
    cleaned = []
    skip_labels = {
        "Momentos seleccionados:",
        "Selected moments:",
        "Dirección editorial",
        "Editorial direction",
        "Interpretación clara",
        "Readable interpretation",
        "Contexto",
        "Context",
        "Evidencia e interpretación multimedia",
        "Evidence and media interpretation",
        "Plan de diseño y publicación",
        "Design and publication plan",
    }
    for part in parts:
        if part in skip_labels or part.startswith("- "):
            continue
        if part.lower().startswith("reporte narrativo:") or part.lower().startswith("album") or part.lower().startswith("memoria"):
            continue
        cleaned.append(part)
    return cleaned[:4]


def text_card(title, text, accent=BLUE, width=None):
    width = width or PAGE_WIDTH - 2 * MARGIN
    table = Table([[para(title, "H2x")], [para(text, "Bodyx")]], colWidths=[width])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def image_bytes_from_media(item):
    source = str((item or {}).get("dataUrl") or (item or {}).get("url") or "")
    if not source:
        return None
    try:
        if source.startswith("data:"):
            _, encoded = source.split(",", 1)
            return base64.b64decode(encoded)
        if source.startswith("http://") or source.startswith("https://"):
            request = urllib.request.Request(source, headers={"User-Agent": "Vibe-PDF/1.0"})
            with urllib.request.urlopen(request, timeout=8) as response:
                return response.read(6_000_000)
        path = Path(source)
        if path.exists() and path.is_file():
            return path.read_bytes()
    except Exception:
        return None
    return None


def image_flowable_from_media(item, width=PAGE_WIDTH - 2 * MARGIN, max_height=3.25 * inch):
    if not str((item or {}).get("type") or "").startswith("image/"):
        return None
    data = image_bytes_from_media(item)
    if not data:
        return None
    try:
        source = io.BytesIO(data)
        with PILImage.open(source) as pil:
            pil = ImageOps.exif_transpose(pil)
            pil.load()
            pil.thumbnail((1600, 1200), PILImage.Resampling.LANCZOS)
            normalized = io.BytesIO()
            pil.convert("RGB").save(normalized, format="JPEG", quality=84, optimize=True)
        normalized.seek(0)
        image = Image(normalized)
        ratio = image.imageHeight / max(1, image.imageWidth)
        image.drawWidth = width
        image.drawHeight = min(max_height, width * ratio)
        if width * ratio > max_height:
            image.drawWidth = max_height / ratio
        h_align = "CENTER"
        image.hAlign = h_align
        return image
    except Exception:
        return None


def friendly_media_name(item):
    kind = human_kind(item)
    title = clean_html((item or {}).get("experienceTitle") or "")
    return f"{kind} de {title}" if title else kind


def media_caption(item):
    pieces = [
        friendly_media_name(item),
    ]
    context = item.get("manualNote") or item.get("analyticalText") or item.get("translatedText") or ""
    if context:
        pieces.append(short(context, 160))
    if not str((item or {}).get("type") or "").startswith("image/"):
        pieces.append(media_action_note(item))
    return " - ".join([piece for piece in pieces if piece])


def media_action_note(item):
    kind = human_kind(item).lower()
    if kind == "audio":
        return "Audio disponible para reproducir en la app; el PDF conserva la transcripcion o resumen."
    if kind == "video":
        return "Video disponible para reproducir en la app; el PDF conserva la lectura editorial."
    if kind == "documento":
        return "Documento disponible para abrir en la app; el PDF resume el contenido interpretado."
    return "Archivo disponible para descarga desde la app."

def media_gallery(media):
    flow = []
    images = [item for item in media if str(item.get("type") or "").startswith("image/") and item.get("included", True) is not False]
    non_images = [item for item in media if item not in images and item.get("included", True) is not False]
    rendered = 0
    for item in images[:12]:
        image = image_flowable_from_media(item)
        if image:
            flow.append(KeepTogether([
                image,
                Spacer(1, 4),
                para(media_caption(item), "Muted"),
                Spacer(1, 10),
            ]))
            rendered += 1
        else:
            non_images.insert(0, item)
    if not rendered:
        flow.append(text_card("Imágenes", "No fue posible incrustar imágenes en el PDF. Revisa que el activo tenga URL firmada o data URL disponible al exportar.", colors.HexColor("#f2b84b")))
        flow.append(Spacer(1, 8))
    if non_images:
        flow.append(Spacer(1, 4))
        for item in non_images[:18]:
            body = item.get("manualNote") or item.get("analyticalText") or item.get("translatedText") or item.get("experienceTitle") or "Disponible para revisar."
            flow.append(KeepTogether([
                text_card(
                    friendly_media_name(item),
                    f"{short(body, 260)} {media_action_note(item)}",
                    colors.HexColor("#0d7c66"),
                ),
                Spacer(1, 7),
            ]))
    if not media:
        flow.append(text_card("Multimedia", "No hay multimedia seleccionada para esta publicación.", colors.HexColor("#f2b84b")))
    return flow


def timeline_items_from_draft(draft, highlights):
    items = draft.get("timeline") or []
    if items:
        return sorted(items, key=lambda item: str(item.get("date") or ""))
    fallback = []
    for index, item in enumerate(highlights or [], 1):
        fallback.append({
            "order": index,
            "title": item.get("title") or "Momento",
            "date": item.get("date") or "",
            "category": item.get("category") or "",
            "location": item.get("location") or "",
            "note": item.get("note") or "",
            "energy": item.get("energy"),
            "mediaSummary": [],
        })
    return sorted(fallback, key=lambda item: str(item.get("date") or ""))


def format_timeline_date(value):
    text = str(value or "").strip()
    if not text:
        return "-"
    return text[:16].replace("T", " ")


def timeline_card(item, media_lookup):
    title = clean_html(item.get("title") or "Momento registrado")
    date = format_timeline_date(item.get("date"))
    category = clean_html(item.get("category") or "")
    location = clean_html(item.get("location") or "")
    note = clean_html(item.get("note") or item.get("objective") or "")
    energy = item.get("energy")
    media_ids = item.get("mediaIds") or []
    media_rows = []
    for media_id in media_ids[:8]:
        asset = media_lookup.get(media_id)
        if not asset:
            continue
        kind = human_kind(asset)
        name = clean_html(asset.get("name") or friendly_media_name(asset))
        reading = clean_html(asset.get("translatedText") or asset.get("analyticalText") or asset.get("manualNote") or asset.get("originalText") or "")
        media_rows.append(f"{kind}: {name}. {short(reading, 150) if reading else media_action_note(asset)}")
    for raw in item.get("mediaSummary") or []:
        if len(media_rows) >= 8:
            break
        media_rows.append(f"{clean_html(raw.get('kind') or 'Activo')}: {clean_html(raw.get('name') or '')}. {short(raw.get('text') or '', 150)}")
    event_lines = []
    for event in item.get("internalEvents") or []:
        event_title = clean_html(event.get("title") or "")
        event_note = clean_html(event.get("note") or "")
        if event_title or event_note:
            event_lines.append(f"{event_title}: {event_note}".strip(": "))
    body_parts = [
        f"Fecha: {date}",
        f"Categoria: {category}" if category else "",
        f"Lugar: {location}" if location else "",
        f"Energia percibida: {energy}/10" if energy not in (None, "", 0) else "",
        f"Nota: {short(note, 260)}" if note else "",
    ]
    if event_lines:
        body_parts.append("Eventos internos: " + " | ".join(event_lines[:4]))
    if media_rows:
        body_parts.append("Activos vinculados: " + " | ".join(media_rows))
    return text_card(title, "\n".join([part for part in body_parts if part]), BLUE)


def build_chronological_timeline_section(draft, highlights, media):
    items = timeline_items_from_draft(draft, highlights)
    media_lookup = {item.get("id"): item for item in media if item.get("id")}
    flow = [section_heading("Cronologia completa", "Eventos, notas, mediciones y activos ordenados de inicio a fin.")]
    if not items:
        flow.append(text_card("Sin eventos", "No hay eventos cronologicos disponibles para esta publicacion.", GOLD))
        return flow
    for item in items:
        flow.append(KeepTogether([timeline_card(item, media_lookup), Spacer(1, 8)]))
    return flow


def list_lines(items, empty="Sin elementos seleccionados."):
    lines = []
    for item in items or []:
        if isinstance(item, dict):
            title = item.get("title") or item.get("name") or item.get("experienceTitle") or "Elemento"
            note = item.get("note") or item.get("manualNote") or item.get("analyticalText") or item.get("translatedText") or ""
            lines.append(f"- {title}: {short(note, 120) if note else 'registrado'}")
        else:
            lines.append(f"- {short(item, 140)}")
    return "\n".join(lines[:6]) or empty


def human_kind(item):
    mime = str((item or {}).get("type") or "")
    kind = str((item or {}).get("kind") or "").lower()
    if mime.startswith("image/") or kind == "image":
        return "Imagen"
    if mime.startswith("video/") or kind == "video":
        return "Video"
    if mime.startswith("audio/") or kind == "audio":
        return "Audio"
    if "pdf" in mime or "text" in mime or "document" in kind:
        return "Documento"
    return "Activo"


def simple_table(headers, rows, col_widths):
    table_rows = [[para(header, "H2x") for header in headers]]
    for row in rows:
        table_rows.append([para(cell, "Bodyx") for cell in row])
    table = Table(table_rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef4ff")),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def moment_rows(highlights):
    rows = []
    for index, item in enumerate((highlights or [])[:7], 1):
        rows.append([
            str(index),
            item.get("title") or "Momento",
            item.get("category") or "-",
            short(item.get("note") or item.get("location") or "Registrado para memoria.", 190),
        ])
    return rows or [["-", "Sin momentos", "-", "Genera una publicación desde experiencias con notas o multimedia."]]


def media_rows(media):
    rows = []
    for item in [item for item in (media or []) if item.get("included", True) is not False][:8]:
        role = item.get("publicationRoleLabel") or "Rol editorial por revisar"
        rows.append([
            f"{human_kind(item)} / {role}",
            item.get("name") or "Activo",
            item.get("experienceTitle") or "-",
            evidence_plain_language(item),
        ])
    return rows or [["-", "Sin multimedia", "-", "No se seleccionó multimedia para esta publicación."]]


def selected_media(media):
    return [item for item in (media or []) if item.get("included", True) is not False]


def media_selection_label(all_media, media):
    if not all_media:
        return "Sin multimedia disponible"
    if not media:
        return "Sin multimedia seleccionada"
    if len(media) == len(all_media):
        return "Toda la multimedia incluida"
    return f"{len(media)} de {len(all_media)} activos seleccionados"


def evidence_plain_language(item):
    text = item.get("translatedText") or item.get("analyticalText") or item.get("manualNote") or item.get("originalText") or ""
    name = item.get("name") or ""
    role = item.get("publicationRoleLabel") or ""
    role_detail = item.get("publicationRoleDetail") or ""
    health = re.search(r"salud|medic|doctor|examen|laboratorio|diagnost|glucosa|colesterol|presion|sangre|health|medical|lab", f"{text} {name}", re.I)
    if health:
        prefix = "Lectura de salud: presentar lo observado en lenguaje claro, sin diagnosticar."
    elif item.get("externalTransportOnly") or str(item.get("publicationRole") or "") == "transport":
        prefix = "Archivo de soporte: conservarlo como referencia, sin convertirlo en conclusion."
    elif str(item.get("type") or "").startswith("image/"):
        prefix = "Lectura visual: usarlo para ubicar el momento y reforzar la memoria."
    elif str(item.get("type") or "").startswith(("audio/", "video/")):
        prefix = "Memoria audiovisual: rescatar el tono, la escena y lo que se quiso registrar."
    else:
        prefix = "Documento de soporte: resumir lo importante en lenguaje claro."
    detail = short(text, 170)
    return " ".join(part for part in [prefix, detail] if part)


def editorial_plan_rows(draft, media, all_media):
    publication_type = draft.get("type") or "Publicacion"
    channel = draft.get("channel") or "Canal por definir"
    style = draft.get("style") or "Tono por revisar"
    return [
        ["Tipo de pieza", publication_type, "Define si el resultado debe sentirse como álbum, resumen ejecutivo, historia breve o memoria documental."],
        ["Canal", channel, "Ajusta extensión, portada y llamado a la acción según donde se compartirá."],
        ["Tono", style, "Mantiene coherencia entre texto, imágenes y nivel de detalle."],
        ["Multimedia", media_selection_label(all_media, media), "El usuario decide si incluye todo, algunos activos o ninguno antes de aprobar."],
        ["Portada", cover_direction(draft, media), "La primera pantalla debe explicar el tema sin obligar a leer todo el documento."],
    ]


def cover_direction(draft, media):
    if media:
        first_image = next((item for item in media if str(item.get("type") or "").startswith("image/")), None)
        if first_image:
            return f"Usar imagen principal: {short(first_image.get('name') or 'imagen seleccionada', 55)}."
    title = draft.get("title") or "la experiencia"
    return f"Crear portada tipografica con titulo breve sobre {short(title, 60)}."


def channel_rows(channel):
    status = {
        "WhatsApp": "Asistido: copia el texto y abre WhatsApp; el usuario revisa y envia.",
        "Email": "Asistido: prepara asunto y cuerpo; el usuario revisa y envia.",
        "Facebook": "Manual por ahora: copia contenido y abre la red para pegar.",
        "Instagram": "Manual por ahora: copia contenido y abre la red para pegar.",
        "PDF/HTML": "Listo: exporta documento estable para lectura, impresion o envio.",
    }.get(channel or "", "Exportacion manual revisada por el usuario.")
    return [
        ["Canal elegido", channel or "-", status],
        ["Privacidad", "Revisión humana", "La limpieza automática ayuda, pero nombres, rostros y datos sensibles se revisan antes de compartir."],
        ["Salida principal", "PDF ReportLab", "Documento editado, estable e imprimible. HTML/Markdown/JSON quedan como apoyo técnico."],
    ]


def decision_cards(rows):
    flow = []
    for label, value, criterion in rows:
        flow.append(KeepTogether([
            text_card(
                f"{label}: {value}",
                criterion,
                GOLD if label in ("Tipo de pieza", "Portada") else colors.HexColor("#0d7c66"),
            ),
            Spacer(1, 7),
        ]))
    return flow


def evidence_cards(media):
    selected = [item for item in (media or []) if item.get("included", True) is not False][:6]
    if not selected:
        return [text_card("Evidencia multimedia", "No se seleccionó multimedia para esta publicación.", GOLD)]
    flow = []
    for item in selected:
        title = friendly_media_name(item)
        context = item.get("experienceTitle") or "Sin experiencia vinculada"
        body = f"{context}. {evidence_plain_language(item)}"
        flow.append(KeepTogether([
            text_card(title, short(body, 380), colors.HexColor("#7a5cc8")),
            Spacer(1, 7),
        ]))
    return flow


def channel_cards(rows):
    flow = []
    for label, value, meaning in rows:
        flow.append(KeepTogether([
            text_card(f"{label}: {value}", meaning, colors.HexColor("#f2b84b")),
            Spacer(1, 7),
        ]))
    return flow


def distribution_kit(draft, media, all_media):
    kit = draft.get("distributionKit") or {}
    channel = draft.get("channel") or "PDF/HTML"
    subject = kit.get("subject") or short(draft.get("title") or "Publicacion Vibe", 90)
    short_copy = kit.get("shortCopy") or short(draft.get("summary") or draft.get("body") or "", 260)
    long_copy = kit.get("longCopy") or short(draft.get("body") or draft.get("summary") or "", 520)
    caption = kit.get("caption") or f"{short(subject, 80)} - {media_selection_label(all_media, media)}"
    format_name = kit.get("format") or channel
    action = kit.get("action") or "Revisar y compartir manualmente"
    media_instruction = kit.get("mediaInstruction") or media_selection_label(all_media, media)
    checklist = kit.get("checklist") or [
        "Revisar privacidad y nombres.",
        "Confirmar medios seleccionados.",
        "Usar PDF como registro final.",
    ]
    deliverables = kit.get("deliverables") or []
    deliverable_rows = [
        (item.get("label") or "Entregable", item.get("value") or "-", item.get("detail") or "-")
        for item in deliverables[:6]
    ]
    return [
        section_heading("Paquete PDF premium", f"{format_name}. Accion: {action}."),
        section_heading("Entregables del canal", "Que recibe el usuario, que puede copiar y que queda como revision manual.") if deliverable_rows else Spacer(1, 0),
        editorial_cards([
            (label, f"{value}. {detail}", colors.HexColor("#0d7c66") if index % 2 else GOLD)
            for index, (label, value, detail) in enumerate(deliverable_rows)
        ]) if deliverable_rows else Spacer(1, 0),
        Spacer(1, 10) if deliverable_rows else Spacer(1, 0),
        editorial_cards([
            ("Asunto o titulo", subject, GOLD),
            ("Texto corto", short_copy, colors.HexColor("#0d7c66")),
            ("Texto ampliado", long_copy, BLUE),
            ("Leyenda o gancho", caption, colors.HexColor("#7a5cc8")),
        ]),
        Spacer(1, 10),
        text_card("Manejo multimedia", media_instruction, colors.HexColor("#0d7c66")),
        Spacer(1, 8),
        checklist_cards("\n".join(checklist), colors.HexColor("#f2b84b")),
    ]


def channel_studio_cards(draft):
    studio = draft.get("channelStudio") or {}
    if not studio:
        return []
    checklist = studio.get("checklist") or []
    checklist_text = "\n".join(checklist[:5]) if checklist else "Revisar formato, multimedia, texto y salida antes de publicar."
    return [
        section_heading("Criterios de publicacion", "Decision editorial por canal antes de exportar o compartir."),
        editorial_cards([
            ("Formato recomendado", studio.get("format") or "-", GOLD),
            ("Decision multimedia", studio.get("mediaDecision") or "-", colors.HexColor("#0d7c66")),
            ("Salida", studio.get("outputAction") or "-", BLUE),
            ("Foco de edicion", studio.get("editorFocus") or "-", colors.HexColor("#7a5cc8")),
            ("Audiencia del canal", studio.get("audience") or "-", colors.HexColor("#0d7c66")),
            ("Ritmo del canal", studio.get("rhythm") or "-", GOLD),
        ]),
        Spacer(1, 10),
        checklist_cards(checklist_text, colors.HexColor("#f2b84b")),
    ]


def media_for_page(media, page):
    ids = set(page.get("mediaIds") or [])
    if not ids:
        return []
    return [item for item in media if item.get("id") in ids]


def page_layout_note(page):
    layout = page.get("layoutTemplate") or "editorial"
    page_type = page.get("pageType") or "story"
    labels = {
        "cover": "Portada: explica el tema en pocos segundos.",
        "summary": "Resumen: sintetiza lo importante antes del detalle.",
        "story": "Historia: convierte datos en una lectura humana.",
        "timeline": "Momentos: ordena la secuencia de la experiencia.",
        "media": "Multimedia: muestra imagenes y resume otros activos.",
        "evidence": "Evidencia: traduce documentos, audio, video o imagenes a lenguaje claro.",
        "channel": "Canal: indica como se comparte y que queda pendiente.",
        "closing": "Cierre: deja una accion o recuerdo final.",
        "slides": "Laminas: ordena una idea por pantalla.",
        "captions": "Textos: prepara copys breves para pegar.",
        "people_places": "Personas y lugares: conserva contexto humano.",
        "memory": "Memoria: resume lo que vale la pena recordar.",
        "scenes": "Escenas: sugiere una secuencia para video o story.",
        "voiceover": "Voz: prepara narracion o texto en pantalla.",
        "letter": "Carta: organiza un mensaje personal.",
        "annex": "Anexos: lista medios y documentos de apoyo.",
        "chapters": "Capitulos: arma una estructura larga.",
        "actions": "Acciones: convierte lectura en pasos concretos.",
        "findings": "Hallazgos: sintetiza lo que importa.",
        "questions": "Preguntas: prepara dudas para revisar.",
        "work-summary": "Jornada: resume contexto, objetivo y resultado operativo.",
        "agreements": "Acuerdos: separa decisiones, compromisos y evidencias.",
        "pending": "Pendientes: convierte el cierre en seguimiento claro.",
        "dashboard": "Dashboard: resume KPIs, tendencias y lectura ejecutiva.",
        "charts": "Cuadros: explica visualizaciones, proporciones e infografias.",
    }
    return f"{labels.get(page_type, 'Pagina editorial.')} Maqueta: {layout}."


def render_publication_page(page, media):
    title = page.get("title") or "Pagina"
    subtitle = page.get("subtitle") or ""
    body = page.get("body") or "Sin texto editorial."
    accent_map = {
        "cover": GOLD,
        "summary": RUST,
        "story": BLUE,
        "timeline": colors.HexColor("#7a5cc8"),
        "media": colors.HexColor("#0d7c66"),
        "evidence": colors.HexColor("#7a5cc8"),
        "channel": colors.HexColor("#f2b84b"),
        "closing": GOLD,
        "slides": colors.HexColor("#7a5cc8"),
        "captions": colors.HexColor("#0d7c66"),
        "people_places": colors.HexColor("#0d7c66"),
        "memory": GOLD,
        "scenes": colors.HexColor("#7a5cc8"),
        "voiceover": BLUE,
        "letter": GOLD,
        "annex": colors.HexColor("#0d7c66"),
        "chapters": BLUE,
        "actions": colors.HexColor("#f2b84b"),
        "findings": RUST,
        "questions": colors.HexColor("#7a5cc8"),
        "work-summary": BLUE,
        "agreements": colors.HexColor("#0d7c66"),
        "pending": colors.HexColor("#f2b84b"),
        "dashboard": BLUE,
        "charts": colors.HexColor("#7a5cc8"),
    }
    page_media = media_for_page(media, page)
    page_type = page.get("pageType")
    accent = accent_map.get(page_type, BLUE)
    flow = [
        section_heading(title, subtitle),
        Spacer(1, 8),
    ]
    if page_type == "cover":
        if page_media:
            flow.extend(media_gallery(page_media[:1]))
            flow.append(Spacer(1, 8))
        flow.append(cover_statement_card(title, body, accent))
        return flow
    if page_type in ("slides", "scenes"):
        flow.append(sequence_cards(body, accent, label="Lamina" if page_type == "slides" else "Escena"))
        return flow
    if page_type in ("captions", "voiceover"):
        flow.extend(quote_cards(body, accent))
        return flow
    if page_type in ("timeline", "chapters"):
        flow.append(sequence_cards(body, accent, label="Paso" if page_type == "chapters" else "Momento"))
        return flow
    if page_type in ("questions", "actions", "findings", "agreements", "pending"):
        flow.append(checklist_cards(body, accent))
        return flow
    if page_type == "dashboard":
        flow.append(paragraph_block("Lectura del dashboard", body, max_parts=5, part_limit=420))
        if page_media:
            flow.append(Spacer(1, 8))
            flow.extend(media_gallery(page_media[:4]))
        return flow
    if page_type == "charts":
        flow.append(sequence_cards(body, accent, label="Visual"))
        if page_media:
            flow.append(Spacer(1, 8))
            flow.extend(media_gallery(page_media[:4]))
        return flow
    if page_type == "letter":
        flow.append(letter_block(title, body))
        return flow
    if page_media:
        flow.extend(media_gallery(page_media))
        flow.append(Spacer(1, 8))
    if page_type == "media":
        flow.append(paragraph_block("Evidencia seleccionada", body, max_parts=8, part_limit=360))
    elif page_type == "evidence":
        flow.append(evidence_summary_grid(body, accent))
    else:
        flow.append(paragraph_block("Relato editado", body, max_parts=6, part_limit=520))
    return flow


def split_editorial_lines(body, limit=9):
    raw_lines = []
    for part in str(body or "").split("\n"):
        item = clean_html(part).strip()
        if not item:
            continue
        item = re.sub(r"^\s*(?:[-*]|\d+[.)]|Lamina\s+\d+:|Escena\s+\d+:|Paso\s+\d+:|Momento\s+\d+:)\s*", "", item, flags=re.I)
        if item:
            raw_lines.append(item)
    if len(raw_lines) <= 1:
        raw_lines = [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean_html(body)) if part.strip()]
    return raw_lines[:limit] or ["Sin contenido editorial."]


def sequence_cards(body, accent, label="Item"):
    rows = []
    card_width = (PAGE_WIDTH - 2 * MARGIN - 10) / 2
    lines = split_editorial_lines(body, limit=8)
    for index in range(0, len(lines), 2):
        row = []
        for offset, text in enumerate(lines[index:index + 2]):
            number = index + offset + 1
            row.append(text_card(f"{label} {number}", short(text, 260), accent, width=card_width))
        while len(row) < 2:
            row.append("")
        rows.append(row)
    table = Table(rows, colWidths=[card_width, card_width])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def quote_cards(body, accent):
    lines = split_editorial_lines(body, limit=5)
    flow = []
    for index, text in enumerate(lines, 1):
        flow.append(KeepTogether([
            text_card(f"Texto {index}", f'"{short(text, 330)}"', accent),
            Spacer(1, 8),
        ]))
    return flow


def checklist_cards(body, accent):
    lines = split_editorial_lines(body, limit=7)
    rows = []
    for index, text in enumerate(lines, 1):
        rows.append([para(str(index), "H2x"), para(short(text, 260), "Bodyx")])
    table = Table(rows, colWidths=[0.34 * inch, PAGE_WIDTH - 2 * MARGIN - 0.34 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef4ff")),
        ("TEXTCOLOR", (0, 0), (0, -1), accent),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("GRID", (0, 0), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def evidence_summary_grid(body, accent):
    return sequence_cards(body, accent, label="Evidencia")


def cover_statement_card(title, body, accent):
    table = Table(
        [[para(title, "H1x")], [para(short(body, 620), "Bodyx")]],
        colWidths=[PAGE_WIDTH - 2 * MARGIN],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fbf6ed")),
        ("LINEBEFORE", (0, 0), (0, -1), 7, accent),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
    ]))
    return table


def letter_block(title, body):
    return paragraph_block(title, body, max_parts=8, part_limit=560)


def public_page_text(page):
    text = "\n".join([
        page.get("title") or "",
        page.get("subtitle") or "",
        page.get("body") or "",
    ])
    blocked = (
        "channel",
        "closing",
    )
    if page.get("pageType") in blocked:
        return ""
    return clean_html(text)


def editorial_story_from_draft(draft, summary, body):
    pages = draft.get("pages") or []
    preferred = [
        page for page in pages
        if page.get("pageType") in ("story", "memory", "letter", "work-summary", "dashboard", "findings", "chapters")
    ]
    source = "\n\n".join(public_page_text(page) for page in preferred) or body or summary
    lines = []
    blocked = re.compile(r"(direccion editorial|contrato editorial|plan de diseno|plan de publicacion|canal recomendado|decision multimedia|kit de salida|entregables|maqueta|layout|html|markdown|json|reportlab|pdf/html)", re.I)
    skip_next = False
    for part in re.split(r"\n+|(?<=[.!?])\s+", source):
        item = clean_html(part).strip()
        item = re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", item)
        if skip_next:
            skip_next = False
            continue
        if blocked.search(item):
            skip_next = True
            continue
        if len(item) < 18:
            continue
        if item not in lines:
            lines.append(item)
    if not lines:
        lines = [clean_html(summary or "Publicacion preparada para revision humana.")]
    return lines[:7]


def build_story_section(title, summary, body_lines):
    flow = [
        section_heading("Historia editada", "Lectura narrativa preparada para compartir."),
        text_card("Idea central", summary, RUST),
        Spacer(1, 8),
    ]
    for index, line in enumerate(body_lines[:5], 1):
        flow.append(KeepTogether([
            text_card(f"Parte {index}", short(line, 520), BLUE if index % 2 else colors.HexColor("#0d7c66")),
            Spacer(1, 7),
        ]))
    return flow


def build_moment_section(highlights):
    flow = [section_heading("Momentos que sostienen la historia", "Seleccionados por relevancia narrativa, no como inventario.")]
    rows = []
    for index, item in enumerate((highlights or [])[:6], 1):
        title = clean_html(item.get("title") or "Momento")
        note = clean_html(item.get("note") or item.get("location") or "Registro disponible para memoria.")
        rows.append([str(index), title, short(note, 230)])
    if not rows:
        rows = [["-", "Sin momentos destacados", "Agrega notas, fotos o audio para enriquecer la publicacion."]]
    flow.append(simple_table(["#", "Momento", "Por que importa"], rows, [0.35 * inch, 1.8 * inch, PAGE_WIDTH - 2 * MARGIN - 2.15 * inch]))
    return flow


def build_publication_closing(draft, purpose):
    text = draft.get("summary") or purpose or "Documento preparado para revision final."
    return [
        section_heading("Cierre editorial", "Antes de compartir, revisa privacidad, permisos y coherencia narrativa."),
        text_card(
            "Lectura final",
            f"{short(text, 420)} Revisa nombres, rostros, datos sensibles y derechos de los medios antes de enviar o publicar.",
            colors.HexColor("#f2b84b"),
        ),
    ]


def build_paged_publication(title, summary, draft, stats, highlights, all_media, media, purpose, people, locations):
    context_lines = [purpose]
    if people and people.lower() not in ("sin personas indicadas", "not specified"):
        context_lines.append(f"Personas: {people}")
    if locations and locations.lower() not in ("sin ubicacion indicada", "no location specified"):
        context_lines.append(f"Lugares: {locations}")
    first_image = next((item for item in media if str(item.get("type") or "").startswith("image/")), None)
    story_lines = editorial_story_from_draft(draft, summary, draft.get("body") or "")
    flow = [
        hero(title, "PDF revista premium - memoria cronologica editada."),
        Spacer(1, 14),
    ]
    if first_image:
        cover_image = image_flowable_from_media(first_image, width=PAGE_WIDTH - 2 * MARGIN, max_height=3.7 * inch)
        if cover_image:
            flow.extend([cover_image, Spacer(1, 8), para(media_caption(first_image), "Muted"), Spacer(1, 12)])
    flow.extend([
        editorial_cards([
            ("Enfoque", "\n".join(context_lines), GOLD),
            ("Resumen", summary, RUST),
            ("Material usado", media_selection_label(all_media, media), colors.HexColor("#0d7c66")),
            ("Salida", "PDF cronologico con notas, imagenes, videos, documentos y mediciones disponibles.", BLUE),
        ]),
        PageBreak(),
        *build_story_section(title, summary, story_lines),
        PageBreak(),
        *build_chronological_timeline_section(draft, highlights, media),
    ])
    if media:
        flow.extend([
            PageBreak(),
            section_heading("Galeria y soportes", "Imagenes curadas primero; audio, video y documentos se interpretan en lenguaje claro."),
            *media_gallery(media),
        ])
        flow.extend([
            PageBreak(),
            section_heading("Lectura de la evidencia", "Que aporta cada medio a la historia."),
            *evidence_cards(media),
        ])
    flow.extend([
        PageBreak(),
        *build_publication_closing(draft, purpose),
    ])
    return flow


def build(payload):
    html = payload.get("html") or ""
    draft = payload.get("draft") or {}
    title = draft.get("title") or payload.get("title") or "Publicación inteligente"
    text = clean_html(html)
    summary = draft.get("summary") or sentence_summary(text, max_sentences=2, limit=360) or "Contenido preparado para revisión humana."
    body = draft.get("body") or editorial_body(text, limit=940)
    stats = draft.get("stats") or {}
    highlights = draft.get("highlights") or []
    all_media = draft.get("media") or []
    media = selected_media(all_media)
    purpose = draft.get("purpose") or "Pieza preparada para compartir una memoria viva, no un reporte técnico."
    people = ", ".join(draft.get("people") or []) or "Sin personas indicadas"
    locations = ", ".join(draft.get("locations") or []) or "Sin ubicacion indicada"
    return build_paged_publication(title, summary, draft, stats, highlights, all_media, media, purpose, people, locations)


def main():
    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    buffer = io.BytesIO()
    frame = Frame(MARGIN, MARGIN + 0.22 * inch, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN - 0.25 * inch, showBoundary=0)
    doc = BaseDocTemplate(buffer, pagesize=letter)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=page)])
    doc.build(build(payload))
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
