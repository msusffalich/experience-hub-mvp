import io
import json
import sys
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
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


PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.55 * inch
BRAND = colors.HexColor("#10263f")
ACCENT = colors.HexColor("#0d7c66")
GOLD = colors.HexColor("#f2b84b")
MUTED = colors.HexColor("#526273")
SOFT = colors.HexColor("#f3f7f8")
LINE = colors.HexColor("#d8e0e8")


def clean(value):
    text = str(value or "").replace("\n", " ").replace("\r", " ")
    return " ".join(text.split())


def short(value, limit=260):
    text = clean(value)
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
    base.add(ParagraphStyle("CoverTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=34, leading=38, textColor=colors.white, alignment=TA_LEFT, spaceAfter=12))
    base.add(ParagraphStyle("CoverSubtitle", parent=base["Normal"], fontSize=12, leading=17, textColor=colors.HexColor("#eaf3f4")))
    base.add(ParagraphStyle("H1x", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=BRAND, spaceBefore=12, spaceAfter=10))
    base.add(ParagraphStyle("H2x", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=BRAND, spaceBefore=4, spaceAfter=6))
    base.add(ParagraphStyle("Bodyx", parent=base["BodyText"], fontSize=9.5, leading=13.5, textColor=colors.HexColor("#2d3742")))
    base.add(ParagraphStyle("Muted", parent=base["BodyText"], fontSize=8.5, leading=12, textColor=MUTED))
    base.add(ParagraphStyle("Small", parent=base["BodyText"], fontSize=7.5, leading=10, textColor=MUTED))
    base.add(ParagraphStyle("Metric", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=BRAND, alignment=TA_CENTER))
    base.add(ParagraphStyle("MetricLabel", parent=base["BodyText"], fontSize=7.5, leading=9, textColor=MUTED, alignment=TA_CENTER))
    return base


STYLES = style_sheet()


def para(text, style="Bodyx"):
    return Paragraph(clean(text), STYLES[style])


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#f8fafb"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(MARGIN, 0.32 * inch, "Vibe - Human Experience Intelligence Platform")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.32 * inch, f"Pagina {doc.page}")
    canvas.restoreState()


def cover(report):
    summary = report.get("summary") or {}
    generated = clean(report.get("generatedAt") or datetime.utcnow().isoformat())
    rows = report.get("rows") or []
    return [
        CoverBlock([
            para("Reporte ejecutivo de experiencias", "CoverTitle"),
            para("Lectura humana, evidencia multimodal y recomendaciones accionables.", "CoverSubtitle"),
            Spacer(1, 0.22 * inch),
            metric_grid([
                ("Experiencias", summary.get("totalExperiences", len(rows))),
                ("Horas", summary.get("capturedHours", 0)),
                ("Energia media", f"{summary.get('averageEnergy', 0)}/10"),
                ("Categoria dominante", summary.get("topCategory", "-")),
            ], dark=True),
            Spacer(1, 0.24 * inch),
            para(f"Generado: {generated}", "CoverSubtitle"),
        ]),
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
        canvas.roundRect(x, y, PAGE_WIDTH - 2 * MARGIN, 6.75 * inch, 18, fill=1, stroke=0)
        canvas.setFillColor(ACCENT)
        canvas.circle(x + PAGE_WIDTH - 2.1 * inch, y + 1.05 * inch, 1.15 * inch, fill=1, stroke=0)
        canvas.setFillColor(GOLD)
        canvas.circle(x + PAGE_WIDTH - 1.2 * inch, y + 5.85 * inch, 0.55 * inch, fill=1, stroke=0)
        canvas.restoreState()
        frame = Frame(x + 0.38 * inch, y + 0.55 * inch, PAGE_WIDTH - 2 * MARGIN - 0.76 * inch, 5.65 * inch, showBoundary=0)
        frame.addFromList(list(self.flowables), canvas)


def metric_grid(items, dark=False):
    cells = []
    for label, value in items:
        cells.append([para(str(value), "Metric"), para(label, "MetricLabel")])
    table = Table([cells], colWidths=[(PAGE_WIDTH - 2 * MARGIN) / 4 - 6] * 4)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white if not dark else colors.HexColor("#eaf3f4")),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def section_title(text):
    return [para(text, "H1x")]


def card(title, body, meta=None):
    data = [[para(title, "H2x")], [para(short(body, 280), "Bodyx")]]
    if meta:
        data.append([para(meta, "Small")])
    t = Table(data, colWidths=[PAGE_WIDTH - 2 * MARGIN], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def two_column_cards(items):
    rows = []
    for i in range(0, len(items), 2):
        row = []
        for item in items[i : i + 2]:
            row.append(card(item[0], item[1], item[2] if len(item) > 2 else None))
        while len(row) < 2:
            row.append("")
        rows.append(row)
    t = Table(rows, colWidths=[(PAGE_WIDTH - 2 * MARGIN - 8) / 2] * 2)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    return t


def bar_table(categories):
    rows = [[para("Categoria", "Small"), para("Volumen", "Small"), para("Energia", "Small")]]
    max_minutes = max([num(item.get("minutes")) for item in categories] + [1])
    for item in categories[:8]:
        width = max(4, int((num(item.get("minutes")) / max_minutes) * 100))
        bar = Table([[""]], colWidths=[2.7 * inch * width / 100], rowHeights=[0.12 * inch])
        bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
        rows.append([para(item.get("category", "-"), "Bodyx"), bar, para(f"{item.get('avgEnergy', 0)}/10", "Bodyx")])
    t = Table(rows, colWidths=[1.65 * inch, 3.1 * inch, 0.8 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


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
        title = f"{item.get('experienceTitle') or item.get('name') or 'Evidencia'}"
        meta = f"{item.get('kind', '')} - {item.get('name', '')}"
        body = item.get("analyticalText") or item.get("translatedText") or item.get("manualNote") or "Evidencia disponible para revisar."
        cards.append((title, body, meta))
    return two_column_cards(cards) if cards else para("No hay evidencia multimodal seleccionada para este filtro.", "Muted")


def short_register(rows):
    table_rows = [[para("Fecha", "Small"), para("Experiencia", "Small"), para("Categoria", "Small"), para("Energia", "Small"), para("Adj.", "Small")]]
    for row in rows[:16]:
        table_rows.append([
            para(row.get("fecha") or row.get("date") or "", "Small"),
            para(short(row.get("titulo") or row.get("title") or "", 55), "Small"),
            para(row.get("categoría") or row.get("categoria") or row.get("category") or "", "Small"),
            para(f"{row.get('energia') or row.get('energy') or ''}/10", "Small"),
            para(str(row.get("adjuntos") or row.get("attachments") or 0), "Small"),
        ])
    t = Table(table_rows, colWidths=[1.05 * inch, 2.45 * inch, 1.15 * inch, 0.62 * inch, 0.42 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def build_story(report):
    summary = report.get("summary") or {}
    rows = report.get("rows") or []
    integrated = report.get("integratedReading") or []
    predictive = report.get("predictiveOutlook") or {}
    kpis = report.get("humanKpis") or []
    categories = report.get("categoryBreakdown") or []
    routes = report.get("mapRoutes") or []
    evidence = report.get("multimodalEvidence") or []
    quality = report.get("dataQuality") or {}
    attachment_count = sum(int(num(row.get("adjuntos") or row.get("attachments"))) for row in rows)

    story = []
    story.extend(cover(report))
    story.extend(section_title("Resumen ejecutivo"))
    story.append(metric_grid([
        ("Experiencias", summary.get("totalExperiences", len(rows))),
        ("Adjuntos", attachment_count),
        ("Energia", f"{summary.get('averageEnergy', 0)}/10"),
        ("Confiabilidad", f"{quality.get('score', 0)}%"),
    ]))
    story.append(Spacer(1, 10))
    story.append(card("Lectura general", f"La libreria contiene {summary.get('totalExperiences', len(rows))} experiencias y {attachment_count} activos. La categoria dominante es {summary.get('topCategory', '-')}, con energia media {summary.get('averageEnergy', 0)}/10. Este reporte resume lo accionable y deja el detalle tecnico completo para JSON o CSV."))
    if predictive.get("title"):
        story.append(card("Proyeccion inicial", f"{predictive.get('title')}. {predictive.get('hypothesis', '')} Siguiente accion: {predictive.get('nextStep', '')}", f"Confianza: {predictive.get('confidence', 0)}%"))

    story.extend(section_title("Hallazgos prioritarios"))
    insight_cards = []
    for item in integrated[:4]:
        insight_cards.append((item.get("title", "Hallazgo"), f"{item.get('evidence', '')} Accion: {item.get('action', '')}", f"Prioridad: {item.get('priority', '-')}"))
    story.append(two_column_cards(insight_cards) if insight_cards else para("No hay hallazgos suficientes.", "Muted"))

    story.extend(section_title("Indicadores humanos"))
    kpi_cards = [(item.get("label", "Indicador"), f"{item.get('detail', '')}", f"{item.get('score', 0)}/100") for item in kpis[:4]]
    story.append(two_column_cards(kpi_cards) if kpi_cards else para("No hay indicadores suficientes.", "Muted"))

    story.extend(section_title("Categorias y balance"))
    story.append(bar_table(categories) if categories else para("No hay categorias suficientes.", "Muted"))

    story.extend(section_title("Rutas y conexiones"))
    route_cards = [(item.get("title", "Ruta"), f"{item.get('count', 0)} experiencias con energia media {item.get('avgEnergy', 0)}/10.", item.get("dominant", "")) for item in routes[:4]]
    story.append(two_column_cards(route_cards) if route_cards else para("No hay rutas suficientes.", "Muted"))

    story.extend(section_title("Evidencia multimodal curada"))
    story.append(evidence_cards(evidence))

    story.extend(section_title("Registro resumido"))
    story.append(short_register(rows))
    story.append(Spacer(1, 8))
    story.append(para("El registro completo, la evidencia extendida y los campos tecnicos se conservan en JSON y CSV. Este PDF es una lectura ejecutiva para revisar y decidir.", "Muted"))
    return story


def main():
    payload = json.load(sys.stdin)
    buffer = io.BytesIO()
    frame = Frame(MARGIN, MARGIN + 0.22 * inch, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN - 0.25 * inch, showBoundary=0)
    doc = BaseDocTemplate(buffer, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=draw_page)])
    doc.build(build_story(payload))
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
