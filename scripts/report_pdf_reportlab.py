import io
import json
import math
import re
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Flowable,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from pdf_context_sections import build_context_digest
from pdf_i18n import natural_date, set_locale, t


PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.55 * inch
BRAND = colors.HexColor("#10263f")
ACCENT = colors.HexColor("#0d7c66")
GOLD = colors.HexColor("#f2b84b")
MUTED = colors.HexColor("#526273")
SOFT = colors.HexColor("#f3f7f8")
LINE = colors.HexColor("#d8e0e8")
NAVY = colors.HexColor("#0d1b2e")
NAVY_CARD = colors.HexColor("#1a2d47")
NAVY_LINE = colors.HexColor("#1f3554")
LOGO_PATH = Path(__file__).resolve().parents[1] / "icons" / "vibe-logo-pdf.png"
ICON_PATH = Path(__file__).resolve().parents[1] / "icons" / "vibe-icon-192.png"


def register_pdf_fonts():
    regular_candidates = [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("C:/Windows/Fonts/arial.ttf")]
    bold_candidates = [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")]
    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)
    if regular and bold:
        pdfmetrics.registerFont(TTFont("VibeSans", str(regular)))
        pdfmetrics.registerFont(TTFont("VibeSansBold", str(bold)))
        return "VibeSans", "VibeSansBold"
    return "Helvetica", "Helvetica-Bold"


FONT_REGULAR, FONT_BOLD = register_pdf_fonts()


def text_of(value, limit=600):
    """Convierte cualquier valor en texto legible y ACOTADO.

    Antes se hacia str(value), asi que una lista de diccionarios se renderizaba
    como su repr de Python y generaba una celda de 475.825 puntos de alto:
    ReportLab lanzaba LayoutError y no se producia ningun PDF de hallazgos.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    elif isinstance(value, bool):
        text = "si" if value else "no"
    elif isinstance(value, (int, float)):
        text = str(value)
    elif isinstance(value, dict):
        text = str(value.get("title") or value.get("name") or value.get("label")
                   or value.get("text") or value.get("summary") or "")
        if not text:
            text = ", ".join(f"{k}: {text_of(v, 60)}" for k, v in list(value.items())[:4])
    elif isinstance(value, (list, tuple, set)):
        items = list(value)
        parts = [text_of(item, 120) for item in items[:6]]
        text = " \u00b7 ".join(p for p in parts if p)
        if len(items) > 6:
            text += f" (+{len(items) - 6})"
    else:
        text = str(value)
    text = text.replace("\n", " ").replace("\r", " ")
    if len(text) > limit:
        text = text[:limit].rstrip() + "\u2026"
    return text


def clean(value):
    text = text_of(value)
    if any(marker in text for marker in (chr(0x00C3), chr(0x00C2), chr(0xFFFD))):
        try:
            text = text.encode("latin1").decode("utf-8")
        except Exception:
            pass
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
    text = text.replace("Uso: evidencia consultable para reportes, memoria y publicaciones. Revisar antes de publicar.", "")
    return " ".join(text.split())


def polish(value):
    return (
        clean(value)
        .replace("Energia", "Energía")
        .replace("energia", "energía")
        .replace("Categoria", "Categoría")
        .replace("categoria", "categoría")
        .replace("Categorias", "Categorías")
        .replace("categorias", "categorías")
        .replace("libreria", "librería")
        .replace("tecnico", "técnico")
        .replace("tecnicos", "técnicos")
        .replace("accion", "acción")
        .replace("Accion", "Acción")
        .replace("acciónable", "accionable")
        .replace("acciónables", "accionables")
        .replace("acciónes", "acciones")
        .replace("Acciónes", "Acciones")
        .replace("Proyeccion", "Proyección")
        .replace("Proporcion", "Proporción")
        .replace("proporcion", "proporción")
        .replace("Evolucion", "Evolución")
        .replace("evolucion", "evolución")
        .replace("proxima", "próxima")
        .replace("ubicacion", "ubicación")
    )


def short(value, limit=260):
    text = polish(value)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


def num(value, default=0):
    try:
        return float(value)
    except Exception:
        return default


def style_sheet():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("CoverTitle", parent=base["Title"], fontName=FONT_BOLD, fontSize=24, leading=29, textColor=colors.white, alignment=TA_LEFT, spaceAfter=10))
    base.add(ParagraphStyle("CoverSubtitle", parent=base["Normal"], fontName=FONT_REGULAR, fontSize=12, leading=17, textColor=colors.HexColor("#eaf3f4")))
    base.add(ParagraphStyle("H1x", parent=base["Heading1"], fontName=FONT_BOLD, fontSize=20, leading=24, textColor=BRAND, spaceBefore=12, spaceAfter=10))
    base.add(ParagraphStyle("H2x", parent=base["Heading2"], fontName=FONT_BOLD, fontSize=13, leading=16, textColor=BRAND, spaceBefore=4, spaceAfter=6))
    base.add(ParagraphStyle("Bodyx", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=9.2, leading=13.2, textColor=colors.HexColor("#2d3742"), wordWrap="CJK"))
    base.add(ParagraphStyle("Muted", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=8.3, leading=11.5, textColor=MUTED, wordWrap="CJK"))
    base.add(ParagraphStyle("Small", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=7.2, leading=9.4, textColor=MUTED, wordWrap="CJK"))
    base.add(ParagraphStyle("Metric", parent=base["BodyText"], fontName=FONT_BOLD, fontSize=18, leading=22, textColor=BRAND, alignment=TA_CENTER))
    base.add(ParagraphStyle("MetricLabel", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=7.5, leading=9, textColor=MUTED, alignment=TA_CENTER))
    base.add(ParagraphStyle("MetricWhite", parent=base["BodyText"], fontName=FONT_BOLD, fontSize=18, leading=22, textColor=colors.white, alignment=TA_CENTER))
    base.add(ParagraphStyle("MetricLabelWhite", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=7.5, leading=9, textColor=colors.HexColor("#dbe7f3"), alignment=TA_CENTER))
    return base


STYLES = style_sheet()


def para(text, style="Bodyx"):
    return Paragraph(escape(polish(text_of(text, 3000))), STYLES[style])


def draw_logo(canvas, x, y, width=1.25 * inch):
    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), x, y, width=width, height=width * 0.545, preserveAspectRatio=True, mask="auto")


def draw_icon(canvas, x, y, size=0.62 * inch):
    if ICON_PATH.exists():
        canvas.drawImage(str(ICON_PATH), x, y, width=size, height=size, preserveAspectRatio=True, mask="auto")


def icon_flowable(size=0.78 * inch):
    if not ICON_PATH.exists():
        return para("Vibe", "CoverSubtitle")
    image = Image(str(ICON_PATH))
    image.drawWidth = size
    image.drawHeight = size
    return image


def logo_flowable(width=1.3 * inch):
    if not LOGO_PATH.exists():
        return para("Vibe", "CoverSubtitle")
    image = Image(str(LOGO_PATH))
    image.drawWidth = width
    image.drawHeight = width * 0.545
    return image


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#f8fafb"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#edf4f7"))
    canvas.rect(0, PAGE_HEIGHT - 0.18 * inch, PAGE_WIDTH, 0.18 * inch, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, PAGE_HEIGHT - 0.035 * inch, PAGE_WIDTH, 0.035 * inch, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont(FONT_BOLD, 8)
    canvas.drawString(MARGIN, 0.32 * inch, t("report_footer"))
    canvas.setFillColor(ACCENT)
    canvas.roundRect(MARGIN, 0.22 * inch, 0.38 * inch, 0.035 * inch, 1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT_REGULAR, 8)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.32 * inch, t("page", number=doc.page))
    canvas.restoreState()


def cover(report):
    summary = report.get("summary") or {}
    output_scope = report.get("outputScope") or {}
    inventory = report.get("evidenceInventory") or {}
    is_inventory = output_scope.get("presentationMode") == "evidence_inventory"
    generated = natural_date(report.get("generatedAt") or datetime.now(timezone.utc))
    rows = report.get("rows") or []
    title = t("inventory_title") if is_inventory else t("report_title")
    subtitle = t("inventory_subtitle") if is_inventory else t("report_subtitle")
    content_width = PAGE_WIDTH - 2 * MARGIN
    logo_column = 1.62 * inch
    title_block = Table(
        [[
            [para(title, "CoverTitle"), para(subtitle, "CoverSubtitle")],
            logo_flowable(1.18 * inch),
        ]],
        colWidths=[content_width - logo_column, logo_column],
    )
    title_block.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 20),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 30),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 30),
        ("LINEBELOW", (0, -1), (-1, -1), 3, ACCENT),
        ("BOX", (0, 0), (-1, -1), 0, NAVY),
    ]))
    return [
        title_block,
        Spacer(1, 0.24 * inch),
        executive_kpi_strip(
            [
                (t("evidence"), inventory.get("evidence", 0)),
                (t("contexts"), inventory.get("context", 0)),
                (t("readable_text"), inventory.get("readable", 0)),
            ]
            if is_inventory
            else [
                (t("stories"), summary.get("totalExperiences", len(rows))),
                (t("hours"), summary.get("capturedHours", 0)),
                (t("average_energy"), f"{summary.get('averageEnergy')}/10" if summary.get("averageEnergy") is not None else t("no_data")),
            ]
        ),
        Spacer(1, 0.18 * inch),
        card(
            t("inventory_scope") if is_inventory else t("main_life_area"),
            (
                t("no_life_area_balance")
                if is_inventory
                else summary.get("topCategory") or t("no_life_area")
            ),
            body_limit=360,
        ),
        Spacer(1, 0.12 * inch),
        card(
            t("document_scope"),
            f"{t('generated', date=generated)}. {t('inventory_scope_body') if is_inventory else t('report_scope_body')}",
            body_limit=320,
        ),
        PageBreak(),
    ]


class CoverBlock(Flowable):
    def __init__(self, flowables):
        super().__init__()
        self.flowables = flowables

    def wrap(self, avail_width, avail_height):
        return avail_width, 6.8 * inch

    def draw(self):
        canvas = self.canv
        x = 0
        y = 0
        canvas.saveState()
        canvas.setFillColor(BRAND)
        canvas.roundRect(x, y, self.width, 6.75 * inch, 18, fill=1, stroke=0)
        logo_panel_x = x + self.width - 0.98 * inch
        logo_panel_y = y + 5.45 * inch
        canvas.setFillColor(colors.white)
        canvas.roundRect(logo_panel_x, logo_panel_y, 0.68 * inch, 0.68 * inch, 8, fill=1, stroke=0)
        draw_icon(canvas, logo_panel_x + 0.06 * inch, logo_panel_y + 0.06 * inch, 0.56 * inch)
        canvas.restoreState()
        frame = Frame(x + 0.38 * inch, y + 0.55 * inch, PAGE_WIDTH - 2 * MARGIN - 0.76 * inch, 5.65 * inch, showBoundary=0)
        frame.addFromList(list(self.flowables), canvas)


class VisualTile(Flowable):
    def __init__(self, title, kind, values=None, labels=None, note=""):
        super().__init__()
        self.title = clean(title)
        self.kind = kind
        self.values = values or []
        self.labels = labels or []
        self.note = clean(note)

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 1.85 * inch
        return avail_width, self.height

    def draw(self):
        c = self.canv
        w = self.width
        h = self.height
        c.saveState()
        c.setFillColor(colors.white)
        c.setStrokeColor(LINE)
        c.roundRect(0, 0, w, h, 10, fill=1, stroke=1)
        c.setFillColor(BRAND)
        c.setFont(FONT_BOLD, 8.5)
        c.drawString(10, h - 18, self.title[:48])
        if self.kind == "donut":
            self._draw_donut(c, w, h)
        elif self.kind == "sparkline":
            self._draw_sparkline(c, w, h)
        elif self.kind == "waffle":
            self._draw_waffle(c, w, h)
        elif self.kind == "radar":
            self._draw_radar(c, w, h)
        c.setFillColor(MUTED)
        c.setFont(FONT_REGULAR, 7)
        c.drawString(10, 9, polish(self.note)[:70])
        c.restoreState()

    def _draw_donut(self, c, w, h):
        values = [max(0, num(v)) for v in self.values[:4]]
        total = sum(values) or 1
        cx, cy, r = 0.34 * w, 0.52 * h, 0.38 * inch
        start = 90
        palette = [ACCENT, GOLD, colors.HexColor("#4f83cc"), colors.HexColor("#9a67d6")]
        for index, value in enumerate(values):
            extent = 360 * value / total
            c.setFillColor(palette[index % len(palette)])
            c.wedge(cx - r, cy - r, cx + r, cy + r, start, start - extent, fill=1, stroke=0)
            start -= extent
        c.setFillColor(colors.white)
        c.circle(cx, cy, r * 0.56, fill=1, stroke=0)
        c.setFillColor(BRAND)
        c.setFont(FONT_BOLD, 13)
        c.drawCentredString(cx, cy - 4, f"{int(round(values[0] / total * 100))}%")
        c.setFont(FONT_REGULAR, 6.8)
        c.setFillColor(MUTED)
        legend_x = 0.58 * w
        legend_y = h - 38
        labels = [short(label, 30) for label in (self.labels or [])[:4]]
        while len(labels) < len(values):
            labels.append(t("life_area_number", number=len(labels) + 1))
        for index, (label, value) in enumerate(zip(labels, values)):
            y = legend_y - index * 15
            c.setFillColor(palette[index % len(palette)])
            c.roundRect(legend_x, y - 1, 7, 7, 1.5, fill=1, stroke=0)
            c.setFillColor(MUTED)
            share = int(round(value / total * 100))
            c.drawString(legend_x + 11, y - 1, f"{label}: {share}%")

    def _draw_sparkline(self, c, w, h):
        values = [num(v) for v in self.values[:12]]
        if len(values) < 2:
            values = [0, values[0] if values else 0]
        left, bottom, chart_w, chart_h = 14, 28, w - 28, h - 58
        lo, hi = min(values), max(values)
        span = hi - lo or 1
        points = []
        for index, value in enumerate(values):
            x = left + chart_w * index / max(1, len(values) - 1)
            y = bottom + chart_h * (value - lo) / span
            points.append((x, y))
        c.setStrokeColor(colors.HexColor("#dfe7ee"))
        for step in range(3):
            y = bottom + chart_h * step / 2
            c.line(left, y, left + chart_w, y)
        c.setStrokeColor(ACCENT)
        c.setLineWidth(2)
        for first, second in zip(points, points[1:]):
            c.line(first[0], first[1], second[0], second[1])
        c.setFillColor(GOLD)
        x, y = points[-1]
        c.circle(x, y, 3, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.setFont(FONT_REGULAR, 6.5)
        c.drawString(left, bottom - 10, t("start"))
        c.drawRightString(left + chart_w, bottom - 10, t("recent"))
        c.drawString(left - 6, bottom + chart_h + 3, t("energy"))

    def _draw_waffle(self, c, w, h):
        value = max(0, min(100, num(self.values[0] if self.values else 0)))
        active = int(round(value / 4))
        size = 7
        gap = 3
        left = (w - (5 * size + 4 * gap)) / 2
        top = h - 38
        for index in range(25):
            row = index // 5
            col = index % 5
            c.setFillColor(ACCENT if index < active else colors.HexColor("#e6edf4"))
            c.roundRect(left + col * (size + gap), top - row * (size + gap), size, size, 1.5, fill=1, stroke=0)
        c.setFillColor(BRAND)
        c.setFont(FONT_BOLD, 14)
        c.drawCentredString(w / 2, 30, f"{int(round(value))}%")

    def _draw_radar(self, c, w, h):
        values = [max(0, min(100, num(v))) for v in self.values[:6]]
        if len(values) < 3:
            values = values + [0] * (3 - len(values))
        count = len(values)
        cx, cy, r = w / 2, h / 2 - 2, 0.48 * inch
        c.setStrokeColor(colors.HexColor("#dfe7ee"))
        for scale in [0.33, 0.66, 1.0]:
            pts = []
            for index in range(count):
                angle = -math.pi / 2 + 2 * math.pi * index / count
                pts.append((cx + math.cos(angle) * r * scale, cy + math.sin(angle) * r * scale))
            for a, b in zip(pts, pts[1:] + pts[:1]):
                c.line(a[0], a[1], b[0], b[1])
        pts = []
        for index, value in enumerate(values):
            angle = -math.pi / 2 + 2 * math.pi * index / count
            pts.append((cx + math.cos(angle) * r * value / 100, cy + math.sin(angle) * r * value / 100))
        path = c.beginPath()
        path.moveTo(pts[0][0], pts[0][1])
        for x, y in pts[1:]:
            path.lineTo(x, y)
        path.close()
        c.setFillColor(colors.Color(0.05, 0.49, 0.4, alpha=0.22))
        c.setStrokeColor(ACCENT)
        c.drawPath(path, fill=1, stroke=1)
        labels = [short(label, 18) for label in (self.labels or [])[:count]]
        while len(labels) < count:
            labels.append(t("axis_number", number=len(labels) + 1))
        c.setFont(FONT_REGULAR, 6.2)
        c.setFillColor(MUTED)
        for index, label in enumerate(labels[:count]):
            angle = -math.pi / 2 + 2 * math.pi * index / count
            lx = cx + math.cos(angle) * (r + 0.12 * inch)
            ly = cy + math.sin(angle) * (r + 0.10 * inch)
            if lx < cx - 3:
                c.drawRightString(lx, ly, label)
            elif lx > cx + 3:
                c.drawString(lx, ly, label)
            else:
                c.drawCentredString(lx, ly, label)


def metric_grid(items, dark=False):
    cells = []
    for label, value in items:
        cells.append([para(value, "Metric"), para(label, "MetricLabel")])
    col_count = max(1, len(items))
    table = Table([cells], colWidths=[(PAGE_WIDTH - 2 * MARGIN) / col_count - 6] * col_count)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white if not dark else colors.HexColor("#eaf3f4")),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def executive_kpi_strip(items):
    cells = [[para(str(value), "MetricWhite"), para(label, "MetricLabelWhite")] for label, value in items]
    count = max(1, len(cells))
    table = Table([cells], colWidths=[(PAGE_WIDTH - 2 * MARGIN) / count] * count)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY_CARD),
        ("BOX", (0, 0), (-1, -1), 0.6, NAVY_LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, NAVY_LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return table


def section_title(text):
    return [para(text, "H1x")]


def card(title, body, meta=None, width=None, body_limit=210):
    width = width or (PAGE_WIDTH - 2 * MARGIN)
    data = [[para(title, "H2x")], [para(short(body, body_limit), "Bodyx")]]
    if meta:
        data.append([para(short(meta, 90), "Small")])
    table = Table(data, colWidths=[width], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f8fa")),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def two_column_cards(items):
    card_width = (PAGE_WIDTH - 2 * MARGIN - 12) / 2
    rows = []
    for i in range(0, len(items), 2):
        row = []
        for item in items[i : i + 2]:
            row.append(card(item[0], item[1], item[2] if len(item) > 2 else None, width=card_width))
        while len(row) < 2:
            row.append("")
        rows.append(row)
    table = Table(rows, colWidths=[card_width] * 2)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def bar_table(categories):
    rows = [[para(t("life_area"), "Small"), para(t("volume"), "Small"), para(t("energy"), "Small")]]
    max_minutes = max([num(item.get("minutes")) for item in categories] + [1])
    for item in categories[:8]:
        width = max(4, int((num(item.get("minutes")) / max_minutes) * 100))
        bar = Table([[""]], colWidths=[2.7 * inch * width / 100], rowHeights=[0.12 * inch])
        bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
        rows.append([para(item.get("category", "-"), "Bodyx"), bar, para(f"{item.get('avgEnergy', 0)}/10", "Bodyx")])
    table = Table(rows, colWidths=[1.65 * inch, 3.1 * inch, 0.8 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def visual_dashboard(summary, rows, kpis, categories, quality):
    category_values = [num(item.get("count") or item.get("minutes")) for item in categories[:4]]
    category_labels = [item.get("category") or item.get("label") or item.get("title") for item in categories[:4]]
    if not category_values:
        category_values = [num(summary.get("totalExperiences")), 1]
        category_labels = [t("experiences"), t("reference")]
    energy_values = [num(row.get("energia") or row.get("energy")) for row in rows[:12]]
    if len(energy_values) < 2:
        energy_values = [num(summary.get("averageEnergy")), num(summary.get("averageEnergy"))]
    kpi_values = [num(item.get("score")) for item in kpis[:6]]
    kpi_labels = [item.get("label") or item.get("title") or item.get("name") for item in kpis[:6]]
    if len(kpi_values) < 3:
        kpi_values = [num(summary.get("averageEnergy")) * 10, num(quality.get("score")), 60]
        kpi_labels = [t("energy"), t("confidence"), t("balance")]
    tiles = [
        VisualTile(t("life_area_share"), "donut", category_values, note=t("legend_share")),
        VisualTile(t("energy_evolution"), "sparkline", energy_values, note=t("legend_recent")),
        VisualTile(t("data_reliability"), "waffle", [quality.get("score", 0)], note=t("legend_completeness")),
        VisualTile(t("human_axis_radar"), "radar", kpi_values, labels=kpi_labels, note=t("legend_axis")),
    ]
    tiles[0].labels = category_labels
    table = Table([[tiles[0], tiles[1]], [tiles[2], tiles[3]]], colWidths=[(PAGE_WIDTH - 2 * MARGIN - 8) / 2] * 2)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def full_legend_table(categories, kpis):
    category_names = [clean(item.get("category") or "-") for item in categories[:6]]
    kpi_names = [clean(item.get("label") or item.get("title") or item.get("name") or "-") for item in kpis[:6]]
    rows = [[para(t("chart"), "Small"), para(t("full_names"), "Small")]]
    rows.append([para(t("life_area_share"), "Small"), para(", ".join(category_names) or t("no_life_areas"), "Small")])
    rows.append([para(t("human_axis_radar"), "Small"), para(", ".join(kpi_names) or ", ".join([t("energy"), t("confidence"), t("balance")]), "Small")])
    rows.append([para(t("energy_evolution"), "Small"), para(t("period_start_recent"), "Small")])
    rows.append([para(t("data_reliability"), "Small"), para(t("completeness_fields"), "Small")])
    table = Table(rows, colWidths=[1.65 * inch, 4.05 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def evidence_cards(items):
    selected = []
    seen = set()
    for item in items:
        key = (item.get("name"), item.get("experienceTitle"), item.get("kind"))
        if key in seen:
            continue
        seen.add(key)
        selected.append(item)
        if len(selected) == 4:
            break
    cards = []
    for item in selected:
        title = f"{item.get('experienceTitle') or t('supporting_item')}"
        meta = f"{item.get('kind', '') or t('context')}"
        body = item.get("analyticalText") or item.get("translatedText") or item.get("manualNote") or t("evidence_review")
        body = body.replace("Extracción local automática para", "Texto extraído de")
        body = body.replace("Uso: evidencia consultable para reportes, memoria y publicaciones. Revisar antes de publicar.", "")
        cards.append((title, short(body, 155), meta))
    return two_column_cards(cards) if cards else para(t("no_multimodal_evidence"), "Muted")


def short_register(rows):
    table_rows = [[para(t("date"), "Small"), para(t("story"), "Small"), para(t("life_area"), "Small"), para(t("energy"), "Small"), para(t("attachments"), "Small")]]
    for row in rows[:16]:
        table_rows.append([
            para(natural_date(row.get("fecha") or row.get("date") or row.get("timestamp")), "Small"),
            para(short(row.get("titulo") or row.get("title") or "", 55), "Small"),
            para(row.get("categoría") or row.get("categoria") or row.get("category") or "", "Small"),
            para(f"{row.get('energia') or row.get('energy') or ''}/10", "Small"),
            para(str(row.get("adjuntos") or row.get("attachments") or 0), "Small"),
        ])
    table = Table(table_rows, colWidths=[1.05 * inch, 2.45 * inch, 1.15 * inch, 0.62 * inch, 0.42 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def evidence_register(items):
    table_rows = [[para(t("date"), "Small"), para(t("item"), "Small"), para(t("type"), "Small"), para(t("status"), "Small")]]
    for item in items[:24]:
        readable = clean(item.get("analyticalText") or item.get("translatedText") or item.get("manualNote") or "")
        table_rows.append([
            para(natural_date(item.get("capturedAt") or item.get("timestamp")), "Small"),
            para(short(item.get("name") or item.get("experienceTitle") or t("unnamed_item"), 58), "Small"),
            para(item.get("kind") or t("evidence"), "Small"),
            para(t("with_reading") if readable else t("available"), "Small"),
        ])
    table = Table(table_rows, colWidths=[1.15 * inch, 2.95 * inch, 0.95 * inch, 0.8 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def contextual_snapshot(report, include_biometrics=True):
    digest = build_context_digest(report)
    if not digest["has_context"]:
        return []
    flow = section_title(t("context_period"))
    if include_biometrics and digest["biometrics"]:
        flow.append(metric_grid(digest["biometrics"][:4]))
        flow.append(Spacer(1, 8))
    if digest["cards"]:
        flow.append(two_column_cards(digest["cards"]))
    flow.append(Spacer(1, 4))
    flow.append(para(
        t("context_explanation"),
        "Muted",
    ))
    return flow


def build_evidence_inventory_story(report):
    inventory = report.get("evidenceInventory") or {}
    measurements = inventory.get("measurements") or {}
    metrics = measurements.get("metrics") or {}
    evidence = report.get("multimodalEvidence") or []
    context_evidence = report.get("contextEvidence") or []
    all_items = list(evidence) + list(context_evidence)
    records = int(num(measurements.get("records")))
    has_measurements = bool(measurements.get("hasMeasurements"))

    story = []
    story.extend(cover(report))
    story.extend(section_title(t("period_inventory")))
    story.append(metric_grid([
        (t("evidence"), inventory.get("evidence", 0)),
        (t("contexts"), inventory.get("context", 0)),
        (t("readable_text"), inventory.get("readable", 0)),
        (t("biometric_records"), records if has_measurements else "-"),
    ]))
    story.append(Spacer(1, 10))
    story.append(card(
        t("how_read_inventory"),
        t("inventory_explanation"),
    ))
    story.extend(section_title(t("available_measurements")))
    story.append(metric_grid([
        (t("heart_rate"), f"{round(num(metrics.get('heartAvg')))} bpm" if num(metrics.get("heartAvg")) else "-"),
        (t("steps"), f"{int(round(num(metrics.get('steps')))):,}" if num(metrics.get("steps")) else "-"),
        (t("sleep"), f"{num(metrics.get('sleepMinutes')) / 60:.1f} h" if num(metrics.get("sleepMinutes")) else "-"),
        (t("active_energy"), f"{round(num(metrics.get('activeEnergy')))} kcal" if num(metrics.get("activeEnergy")) else "-"),
    ]))
    story.append(Spacer(1, 8))
    story.append(para(
        t("measurement_rule"),
        "Muted",
    ))
    story.extend(contextual_snapshot(report, include_biometrics=False))
    story.extend(section_title(t("available_evidence")))
    story.append(evidence_cards(all_items))
    story.extend(section_title(t("evidence_register")))
    story.append(evidence_register(all_items) if all_items else para(t("no_evidence_period"), "Muted"))
    story.append(Spacer(1, 8))
    story.append(para(t("inventory_closing"), "Muted"))
    return story


def build_story(report):
    summary = report.get("summary") or {}
    rows = report.get("rows") or []
    integrated = report.get("integratedReading") or []
    predictive = report.get("predictiveOutlook") or {}
    kpis = report.get("humanKpis") or []
    categories = report.get("categoryBreakdown") or []
    routes = report.get("mapRoutes") or []
    evidence = report.get("multimodalEvidence") or []
    context_evidence = report.get("contextEvidence") or []
    output_scope = report.get("outputScope") or {}
    quality = report.get("dataQuality") or {}
    attachment_count = sum(int(num(row.get("adjuntos") or row.get("attachments"))) for row in rows)

    if output_scope.get("presentationMode") == "evidence_inventory":
        return build_evidence_inventory_story(report)

    story = []
    story.extend(cover(report))
    story.extend(section_title(t("executive_summary")))
    story.append(metric_grid([
        (t("stories"), output_scope.get("stories", summary.get("totalExperiences", len(rows)))),
        (t("evidence"), output_scope.get("evidence", attachment_count)),
        (t("energy"), f"{summary.get('averageEnergy')}/10" if summary.get("averageEnergy") is not None else t("no_data")),
        (t("confidence"), f"{quality.get('score', 0)}%"),
    ]))
    story.append(Spacer(1, 10))
    top_category = summary.get("topCategory") or t("no_dominant_area")
    average_energy = summary.get("averageEnergy")
    energy_sentence = t("energy_recorded", value=average_energy) if average_energy is not None else t("energy_unavailable")
    story.append(card(
        t("general_reading"),
        t(
            "general_reading_body",
            stories=summary.get("totalExperiences", len(rows)),
            assets=attachment_count,
            area=top_category,
            energy=energy_sentence,
        ),
    ))
    story.append(Spacer(1, 8))
    story.append(visual_dashboard(summary, rows, kpis, categories, quality))
    story.append(Spacer(1, 8))
    story.append(full_legend_table(categories, kpis))
    story.extend(contextual_snapshot(report))
    if predictive.get("title"):
        story.append(card(
            t("initial_projection"),
            f"{predictive.get('title')}. {predictive.get('hypothesis', '')} {t('next_action')}: {predictive.get('nextStep', '')}",
            f"{t('confidence')}: {predictive.get('confidence', 0)}%",
        ))

    story.extend(section_title(t("priority_findings")))
    insight_cards = []
    for item in integrated[:4]:
        insight_cards.append((
            item.get("title", t("insight")),
            f"{item.get('evidence', '')} {t('next_action')}: {item.get('action', '')}",
            f"{t('priority')}: {item.get('priority', '-')}",
        ))
    story.append(two_column_cards(insight_cards) if insight_cards else para(t("no_findings"), "Muted"))

    story.extend(section_title(t("human_indicators")))
    kpi_cards = [(item.get("label", t("indicator")), f"{item.get('detail', '')}", f"{item.get('score', 0)}/100") for item in kpis[:4]]
    story.append(two_column_cards(kpi_cards) if kpi_cards else para(t("no_indicators"), "Muted"))

    story.extend(section_title(t("life_areas_balance")))
    story.append(bar_table(categories) if categories else para(t("no_life_areas"), "Muted"))

    story.extend(section_title(t("routes_connections")))
    route_cards = [(
        item.get("title", t("route")),
        t("route_summary", count=item.get("count", 0), energy=item.get("avgEnergy", 0)),
        item.get("dominant", ""),
    ) for item in routes[:4]]
    story.append(two_column_cards(route_cards) if route_cards else para(t("no_routes"), "Muted"))

    story.extend(section_title(t("selected_evidence")))
    story.append(evidence_cards(evidence))

    story.extend(section_title(t("summary_register")))
    story.append(short_register(rows))
    story.append(Spacer(1, 8))
    story.append(para(t("report_closing"), "Muted"))
    return story


def main():
    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    set_locale(payload.get("language") or payload.get("locale"))
    buffer = io.BytesIO()
    frame = Frame(MARGIN, MARGIN + 0.22 * inch, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN - 0.25 * inch, showBoundary=0)
    doc = BaseDocTemplate(buffer, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=draw_page)])
    doc.build(build_story(payload))
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
