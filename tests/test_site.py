"""Launch checklist as tests:  .venv/Scripts/python -m pytest -q"""
import re
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))

import build  # noqa: E402

PROJECTS = yaml.safe_load((ROOT / "content" / "projects.yaml").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def dist():
    build.build()
    return ROOT / "dist"


def test_pages_exist(dist):
    for page in ["index.html", "resume/index.html", "404.html", "sitemap.xml", "robots.txt"]:
        assert (dist / page).exists(), page
    for p in PROJECTS:
        if p.get("featured"):
            assert (dist / "work" / p["slug"] / "index.html").exists(), p["slug"]


def test_every_resume_project_is_on_home_and_resume(dist):
    home = (dist / "index.html").read_text(encoding="utf-8")
    resume = (dist / "resume" / "index.html").read_text(encoding="utf-8")
    for title in ["Dental Caries Detection", "The Intelligent Assistant of SHU", "What&#39;s Cooking",
                  "Credit Card Fraud Detection", "Diabetes Prediction", "Baby Cry Analyzer",
                  "OTA Commands Automation", "Social DM Sales Agent"]:
        assert title in home, title
        assert title in resume, title


def test_no_private_contact_details_published(dist):
    text = "\n".join(f.read_text(encoding="utf-8", errors="ignore") for f in dist.rglob("*") if f.suffix in {".html", ".xml", ".txt", ".js"})
    assert not re.search(r"(\+92|\b0)\s?3\d{2}[\s-]?\d{7}\b", text), "a Pakistani mobile number was published"
    # Exact private strings (address etc.) live in a git-ignored file, one per line.
    private = ROOT / "tests" / "private_terms.txt"
    for term in (private.read_text(encoding="utf-8").splitlines() if private.exists() else []):
        assert not term.strip() or term.strip() not in text, "a private term was published"


def test_internal_links_resolve(dist):
    for page in dist.rglob("*.html"):
        for href in re.findall(r'href="(/[^"#?]*)', page.read_text(encoding="utf-8")):
            target = dist / href.lstrip("/")
            assert target.exists() or (target / "index.html").exists(), f"{page.relative_to(dist)} -> {href}"


def test_retrieval_finds_the_right_project():
    from _agent.knowledge import index
    top = index().search("how was data leakage prevented in the tooth decay model", k=3)
    assert any("dental" in d["source"] for d in top)
    top = index().search("terraform ansible deployment", k=3)
    assert any("shu" in d["source"] for d in top)


def test_router():
    from _agent.graph import router
    assert router({"question": "Can I hire him?"})["route"] == "contact"
    assert router({"question": "What is his phone number?"})["route"] == "contact"
    assert router({"question": "Explain the baby cry model"})["route"] == "knowledge"


def test_contact_form_offers_every_service(dist):
    home = (dist / "index.html").read_text(encoding="utf-8")
    assert 'id="contact-form"' in home
    services = yaml.safe_load((ROOT / "content" / "services.yaml").read_text(encoding="utf-8"))
    for s in services:
        assert f"<option>{s['title'].replace('&', '&amp;')}</option>" in home, s["title"]
        assert f'data-topic="{s["title"].replace("&", "&amp;")}"' in home, s["title"]
