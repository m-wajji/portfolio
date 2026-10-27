# Muhammad Wajahat — Portfolio

Personal site of an AI Engineer (LLM agents & computer vision). Built in Python, hosted for $0.

- **Pages:** Jinja2 templates + YAML/Markdown content, rendered to static HTML by `build.py`. Plain CSS, no frameworks.
- **Live detector:** YOLO26n caries model exported to ONNX and run **in the browser** with `onnxruntime-web`. Images never leave the device.
- **Ask my agent:** a LangGraph agent (`api/chat.py`) — router → contact tool → BM25 retrieval over the site content → answer with Groq (`openai/gpt-oss-120b`, falling back to `gpt-oss-20b`). Runs as a Vercel Python function.

## Edit content
Everything you'd want to change is in `content/`:

| File | What it holds |
|---|---|
| `profile.yaml` | name, headline, status, links, proof metrics, certifications, education |
| `projects.yaml` | every project card (`featured: true` → gets a case study) |
| `work/<slug>.md` | case-study text for featured projects |
| `experience.yaml`, `skills.yaml`, `services.yaml` | timeline, skill groups, freelance offers |

The agent reads the same files, so it stays in sync automatically.

## Run locally
```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt -r requirements-build.txt uvicorn pillow pytest
cp .env.example .env        # add your GROQ_API_KEY
.venv/Scripts/python dev.py # site + agent on http://localhost:8000
.venv/Scripts/python -m pytest -q   # launch checklist: pages, links, every project shown, no phone/address leaked
```
`python build.py --serve` previews the static site without the agent.

## Deploy (free)
1. Push this folder to a new GitHub repo (the `.gitignore` keeps `.env`, PDFs, the DISC report and raw model weights out).
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Framework preset: **Other**. `vercel.json` already sets the build.
3. In **Settings → Environment Variables** add `GROQ_API_KEY`.
4. Deploy → `https://<project>.vercel.app`. This site lives at `muhammadwajahat-psi.vercel.app` (Vercel adds a suffix when a name is taken).
5. Optional free custom subdomain: open a PR to [is-a-dev/register](https://github.com/is-a-dev/register) adding `domains/muhammadwajahat.json` with a CNAME to `cname.vercel-dns.com`, then add the domain in Vercel → Domains. Write the PR yourself — AI-written PRs are rejected.

If you change the domain, update `site_url` in `content/profile.yaml`.

## Updating the model
```bash
yolo export model=best.pt format=onnx imgsz=640 simplify=True opset=17
cp best.onnx static/models/caries.onnx
```

Dental images: Aga Khan University intraoral dataset, *Scientific Data* (2025), CC BY 4.0.
