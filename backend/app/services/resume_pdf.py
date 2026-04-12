"""Resume PDF generation using reportlab."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.platypus.para import Paragraph as ParagraphObj
from io import BytesIO
import json


SAMSUNG_BLUE = HexColor("#1428a0")
DARK_TEXT = HexColor("#1d1d1f")
GRAY_TEXT = HexColor("#666666")
LIGHT_GRAY = HexColor("#f5f5f7")


def generate_resume_pdf(resume_data: dict) -> bytes:
    """Generate a professional resume PDF from resume data."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.5 * inch,
        leftMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )

    styles = getSampleStyleSheet()
    story = []

    # Custom styles
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=DARK_TEXT,
        spaceAfter=3,
        fontName="Helvetica-Bold",
    )

    name_style = ParagraphStyle(
        "NameStyle",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=SAMSUNG_BLUE,
        spaceAfter=6,
        fontName="Helvetica-Bold",
    )

    section_header_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=SAMSUNG_BLUE,
        spaceAfter=8,
        spaceBefore=6,
        fontName="Helvetica-Bold",
        borderColor=SAMSUNG_BLUE,
        borderWidth=1,
        borderPadding=4,
    )

    body_style = ParagraphStyle(
        "CustomBody",
        parent=styles["BodyText"],
        fontSize=9,
        textColor=DARK_TEXT,
        spaceAfter=4,
        leading=11,
    )

    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["BodyText"],
        fontSize=9,
        textColor=GRAY_TEXT,
        spaceAfter=2,
        fontName="Helvetica-Bold",
    )

    # Header with name and contact
    name = resume_data.get("title", "Resume").split(" ")[0]  # Use profile name if available
    story.append(Paragraph(name, name_style))

    # Contact info
    contact_parts = []
    if resume_data.get("email"):
        contact_parts.append(resume_data["email"])
    if resume_data.get("phone"):
        contact_parts.append(resume_data["phone"])
    if resume_data.get("location"):
        contact_parts.append(resume_data["location"])
    if resume_data.get("website"):
        contact_parts.append(resume_data["website"])

    if contact_parts:
        contact = " • ".join(contact_parts)
        story.append(Paragraph(contact, body_style))
        story.append(Spacer(1, 0.1 * inch))

    # Professional Summary
    if resume_data.get("summary"):
        story.append(Paragraph("PROFESSIONAL SUMMARY", section_header_style))
        story.append(Paragraph(resume_data["summary"], body_style))
        story.append(Spacer(1, 0.1 * inch))

    # Experience
    experience = resume_data.get("experience", [])
    if experience:
        story.append(Paragraph("EXPERIENCE", section_header_style))
        for exp in experience:
            title_text = f"<b>{exp.get('title', '')}</b>"
            if exp.get("company"):
                title_text += f" • {exp['company']}"
            story.append(Paragraph(title_text, subtitle_style))

            if exp.get("dates"):
                story.append(Paragraph(f"<i>{exp['dates']}</i>", body_style))

            if exp.get("description"):
                story.append(Paragraph(exp["description"], body_style))

            story.append(Spacer(1, 0.08 * inch))
        story.append(Spacer(1, 0.05 * inch))

    # Education
    education = resume_data.get("education", [])
    if education:
        story.append(Paragraph("EDUCATION", section_header_style))
        for edu in education:
            degree_text = edu.get("degree", "")
            if edu.get("field"):
                degree_text += f" in {edu['field']}"
            if degree_text:
                story.append(Paragraph(f"<b>{degree_text}</b>", subtitle_style))

            if edu.get("school"):
                story.append(Paragraph(edu["school"], body_style))

            if edu.get("dates"):
                story.append(Paragraph(f"<i>{edu['dates']}</i>", body_style))

            story.append(Spacer(1, 0.08 * inch))
        story.append(Spacer(1, 0.05 * inch))

    # Skills
    skills = resume_data.get("skills", [])
    if skills:
        story.append(Paragraph("SKILLS", section_header_style))
        skills_text = ", ".join(skills)
        story.append(Paragraph(skills_text, body_style))
        story.append(Spacer(1, 0.1 * inch))

    # Certifications
    certs = resume_data.get("certifications", [])
    if certs:
        story.append(Paragraph("CERTIFICATIONS", section_header_style))
        for cert in certs:
            cert_name = f"<b>{cert.get('name', '')}</b>"
            if cert.get("issuer"):
                cert_name += f" • {cert['issuer']}"
            story.append(Paragraph(cert_name, subtitle_style))
            if cert.get("date"):
                story.append(Paragraph(f"<i>{cert['date']}</i>", body_style))
            story.append(Spacer(1, 0.08 * inch))

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def tailor_resume_summary_sync(original_summary: str, job_title: str, job_description: str, llm_client, llm_model: str) -> str:
    """
    Use LLM to tailor the resume summary for a specific job.
    Returns the tailored summary text.
    """
    prompt = f"""You are an expert resume writer. Tailor this professional summary to match the job requirements.

Original Summary:
{original_summary}

Job Title: {job_title}
Job Description: {job_description}

Please provide a revised professional summary (2-3 sentences) that:
1. Highlights relevant experience and skills from the original
2. Uses keywords and terminology from the job description
3. Emphasizes how the candidate is a strong fit for THIS specific role
4. Maintains authenticity - don't add false claims

Return ONLY the revised summary text, no other commentary."""

    try:
        response = llm_client.messages.create(
            model=llm_model,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip()
    except Exception as e:
        # If LLM fails, return original
        return original_summary
