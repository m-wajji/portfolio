"""Build the portfolio into a static site in dist/.

    python build.py            # build
    python build.py --serve    # build, then serve dist/ on http://localhost:8000
"""
import argparse
import functools
import http.server
import re
import shutil
import time
from datetime import date
from pathlib import Path

import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).parent
CONTENT = ROOT / "content"
STATIC = ROOT / "static"
DIST = ROOT / "dist"
SOURCE_IMAGES = ROOT / "dental_images"

# Source image -> (published name, max width). Only rebuilt when the source is newer.
IMAGES = {
    "test_predictions.jpg": ("dental-predictions.jpg", 1400),
    "app_screenshot.png": ("dental-app.jpg", 1600),
    "training_curves.png": ("dental-training-curves.png", 1400),
    "F1_curve.png": ("dental-f1-curve.png", 1200),
}

TAG_ORDER = ["Agents", "Vision", "Healthcare", "Classic ML", "Audio", "NLP", "Automation", "DevOps", "GTM"]


def load_yaml(name):
    return yaml.safe_load((CONTENT / name).read_text(encoding="utf-8"))


def optimise_images():
    """Resize and compress the dental images into static/img (needs Pillow)."""
    try:
        from PIL import Image
    except ImportError:
        print("  ! Pillow not installed, skipping image optimisation")
        return
    out_dir = STATIC / "img"
    out_dir.mkdir(parents=True, exist_ok=True)
    for src_name, (out_name, max_w) in IMAGES.items():
        src, out = SOURCE_IMAGES / src_name, out_dir / out_name
        if not src.exists() or (out.exists() and out.stat().st_mtime >= src.stat().st_mtime):
            continue
        im = Image.open(src)
        if im.width > max_w:
            im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
        if out.suffix == ".jpg":
            im.convert("RGB").save(out, "JPEG", quality=82, optimize=True, progressive=True)
        else:
            im.save(out, "PNG", optimize=True)
        print(f"  image  {out_name}  ({out.stat().st_size // 1024} KB)")

    # Card + Open Graph images derived from the prediction grid.
    grid = out_dir / "dental-predictions.jpg"
    if grid.exists():
        im = Image.open(grid).convert("RGB")
        for name, size in (("og.jpg", (1200, 630)), ("dental-sample.jpg", (960, 540))):
            target = out_dir / name
            if target.exists() and target.stat().st_mtime >= grid.stat().st_mtime:
                continue
            ratio = size[0] / size[1]
            w, h = im.size
            crop = (0, 0, w, round(w / ratio)) if w / h < ratio else (0, 0, round(h * ratio), h)
            im.crop(crop).resize(size, Image.LANCZOS).save(target, "JPEG", quality=80, optimize=True)


def render_markdown(text, diagram_macro):
    html = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    # Swap diagram placeholders for the inline SVG partials.
    return re.sub(
        r'<div class="diagram" data-diagram="([\w-]+)"></div>',
        lambda m: str(diagram_macro(m.group(1))),
        html,
    )


def build():
    t0 = time.time()
    optimise_images()

    profile = load_yaml("profile.yaml")
    projects = load_yaml("projects.yaml")
    ctx = dict(
        profile=profile,
        projects=projects,
        experience=load_yaml("experience.yaml"),
        skills=load_yaml("skills.yaml"),
        services=load_yaml("services.yaml"),
        build_id=int(t0),
    )
    used = {t for p in projects for t in p["tags"]}
    ctx["project_tags"] = [t for t in TAG_ORDER if t in used] + sorted(used - set(TAG_ORDER))
    samples_dir = STATIC / "img" / "samples"
    ctx["samples"] = sorted(p.name for p in samples_dir.glob("*.jpg")) if samples_dir.exists() else []

    env = Environment(
        loader=FileSystemLoader(ROOT / "templates"),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(STATIC, DIST / "static")

    def write(path, template, **extra):
        out = DIST / path.lstrip("/") / "index.html" if not path.endswith(".html") else DIST / path.lstrip("/")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(env.get_template(template).render(**ctx, page_path=path, **extra), encoding="utf-8")
        return path

    pages = [write("/", "index.html"), write("/resume/", "resume.html")]
    write("404.html", "404.html")

    diagram = env.get_template("partials/diagrams.html").module.diagram
    featured = [p for p in projects if p.get("featured")]
    for i, p in enumerate(featured):
        md_file = CONTENT / "work" / f"{p['slug']}.md"
        body = render_markdown(md_file.read_text(encoding="utf-8"), diagram)
        others = [featured[(i + k) % len(featured)] for k in (1, 2)]
        pages.append(write(f"/work/{p['slug']}/", "work.html", p=p, body=body, others=others))

    site = profile["site_url"].rstrip("/")
    today = date.today().isoformat()
    (DIST / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{site}{p}</loc><lastmod>{today}</lastmod></url>\n" for p in pages)
        + "</urlset>\n",
        encoding="utf-8",
    )
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {site}/sitemap.xml\n", encoding="utf-8")

    print(f"Built {len(pages)} pages into dist/ in {time.time() - t0:.2f}s")


def serve(port=8000):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
    print(f"Serving dist/ at http://localhost:{port}  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--serve", action="store_true")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    build()
    if args.serve:
        serve(args.port)
