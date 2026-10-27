"""Turns the site content (content/*.yaml, content/work/*.md) into searchable chunks,
and ranks them with a small BM25 implementation (no vector DB or embedding API needed)."""
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

import yaml

CONTENT = Path(__file__).resolve().parents[2] / "content"
TOKEN = re.compile(r"[a-z0-9]+(?:\.[0-9]+)?")
STOP = set("a an and are as at be by for from has have i in is it its of on or that the to was were what with you your he his him me my".split())


def tokenize(text):
    return [t for t in TOKEN.findall(text.lower()) if t not in STOP]


def _load(name):
    return yaml.safe_load((CONTENT / name).read_text(encoding="utf-8"))


def build_chunks():
    chunks = []
    add = lambda source, text: chunks.append({"source": source, "text": " ".join(text.split())})

    p = _load("profile.yaml")
    add("profile", f"{p['name']} is an {p['role']}. {p['headline']} {p['subline']} Status: {p['status']}. {p['about']}")
    add("contact", f"Contact {p['name']} through the contact form on this site (/#contact — pick a topic such as a role or one of the freelance services) or by email at {p['email']}. "
        + " ".join(f"{l['label']}: {l['url']}" for l in p["links"] if l["url"].startswith("http"))
        + f". Based in {p['location']}. Open to remote roles and freelance projects. Résumé: /resume/.")
    add("education", "Education: " + "; ".join(f"{e['degree']}, {e['school']} ({e['period']})" for e in p["education"]))
    add("certifications", "Certifications: " + "; ".join(f"{c['title']} by {c['issuer']}" for c in p["certifications"]))
    add("how-i-work", "How he works: " + " ".join(f"{x['title']}: {x['text']}" for x in p["principles"]))

    for e in _load("experience.yaml"):
        add(f"experience/{e['org']}", f"Experience: {e['role']} at {e['org']} ({e['period']}, {e['location']}). "
            + " ".join(e["points"]) + " Stack: " + ", ".join(e["stack"]))

    for g in _load("skills.yaml"):
        add("skills", f"Skills — {g['group']}: " + ", ".join(g["items"]))

    for s in _load("services.yaml"):
        add("services", f"Freelance service — {s['title']}: {s['text']} Stack: " + ", ".join(s["stack"]))

    for pr in _load("projects.yaml"):
        parts = [f"Project: {pr['title']} ({pr['org']}).", pr["summary"]]
        if pr.get("metrics"):
            parts.append("Metrics: " + ", ".join(f"{m['value']} {m['label']}" for m in pr["metrics"]))
        if pr.get("lesson"):
            parts.append("Lesson: " + pr["lesson"])
        parts.append("Stack: " + ", ".join(pr["stack"]))
        if pr.get("badge"):
            parts.append(f"Note: {pr['badge']}.")
        links = [l["url"] for l in pr.get("links", []) if l["url"].startswith("http")]
        if links:
            parts.append("Code: " + ", ".join(links))
        if pr.get("featured"):
            parts.append(f"Case study: /work/{pr['slug']}/")
        add(f"project/{pr['slug']}", " ".join(parts))

    for md in sorted((CONTENT / "work").glob("*.md")):
        title = md.stem.replace("-", " ")
        for section in re.split(r"^## ", md.read_text(encoding="utf-8"), flags=re.M):
            section = re.sub(r"<[^>]+>|!\[[^\]]*\]\([^)]*\)", "", section).strip()
            if section:
                head, _, body = section.partition("\n")
                add(f"case-study/{md.stem}", f"{title} — {head}: {body}")
    return chunks


class BM25:
    def __init__(self, docs, k1=1.5, b=0.75):
        self.docs = docs
        self.toks = [tokenize(d["source"].replace("/", " ") + " " + d["text"]) for d in docs]
        self.avgdl = sum(map(len, self.toks)) / len(self.toks)
        self.tf = [Counter(t) for t in self.toks]
        df = Counter(w for t in self.toks for w in set(t))
        n = len(docs)
        self.idf = {w: math.log(1 + (n - f + 0.5) / (f + 0.5)) for w, f in df.items()}
        self.k1, self.b = k1, b

    def search(self, query, k=5):
        q = tokenize(query)
        scores = []
        for i, tf in enumerate(self.tf):
            dl = len(self.toks[i])
            s = sum(
                self.idf.get(w, 0) * tf[w] * (self.k1 + 1) / (tf[w] + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
                for w in q if w in tf
            )
            if s > 0:
                scores.append((s, i))
        return [self.docs[i] for _, i in sorted(scores, reverse=True)[:k]]


@lru_cache(maxsize=1)
def index():
    return BM25(build_chunks())
