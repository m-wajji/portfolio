"""LangGraph agent that answers questions about Muhammad Wajahat.

    router ──► contact ──┐
       │                 ▼
       └──► retrieve ──► generate
"""
import os
import re
from typing import TypedDict

from groq import Groq, RateLimitError, APIStatusError
from langgraph.graph import END, START, StateGraph

from .knowledge import index

MODELS = [m for m in (os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"), "openai/gpt-oss-20b") if m]
CONTACT_WORDS = re.compile(r"\b(hire|hiring|contact|email|reach|freelance|available|availability|rate|rates|price|cost|resume|cv|work with|get in touch|linkedin|github|phone|call|number)\b", re.I)

SYSTEM = """You are the assistant on Muhammad Wajahat's portfolio website. Visitors are recruiters, engineers and potential clients.

Rules:
- Answer ONLY from the CONTEXT below. If the answer isn't there, say you don't know and suggest emailing Wajahat.
- Never invent numbers, employers, dates, clients or skills. Codet AI and TPL Trakker work is private: describe it, but don't make up metrics.
- Never share a phone number or home address. To reach him, point visitors to the contact form at [the contact section](/#contact), or his email / LinkedIn.
- Refer to him as "Wajahat" (third person). Be direct, warm and brief: 2–5 sentences or a short list. Use plain text with simple markdown (bold, lists), no tables or headings.
- When relevant, link to a page on the site as a markdown link, e.g. [the case study](/work/dental-caries-detection/). The ONLY valid paths are:
  /#work (featured work), /#demo (live detector), /#projects (all projects), /#services (freelance services), /#experience, /#contact, /resume/,
  /work/dental-caries-detection/, /work/dm-sales-agent/, /work/shu-intelligent-assistant/. Never invent other paths.
- Politely decline requests unrelated to Wajahat or his work (homework, code generation, opinions on other people).
"""


class State(TypedDict, total=False):
    question: str
    history: list
    route: str
    docs: list
    answer: str
    model: str
    trace: list


def router(state: State) -> State:
    route = "contact" if CONTACT_WORDS.search(state["question"]) else "knowledge"
    return {"route": route, "trace": [f"router → {route}"]}


def contact(state: State) -> State:
    docs = [d for d in index().docs if d["source"] in ("contact", "services")]
    return {"docs": docs, "trace": state["trace"] + ["tool: get_contact_and_services()"]}


def retrieve(state: State) -> State:
    # Include the previous user turn so follow-ups like "what stack did it use?" still retrieve well.
    prev = " ".join(m["content"] for m in state.get("history", [])[-2:] if m["role"] == "user")
    found = index().search(f"{state['question']} {prev}", k=5)
    have = {d["source"] + d["text"][:40] for d in state.get("docs", [])}
    docs = state.get("docs", []) + [d for d in found if d["source"] + d["text"][:40] not in have]
    if not docs:
        docs = [d for d in index().docs if d["source"] == "profile"]
    sources = sorted({d["source"] for d in docs})
    return {"docs": docs, "trace": state["trace"] + [f"retrieve: {len(docs)} chunks from {', '.join(sources[:4])}{'…' if len(sources) > 4 else ''}"]}


def generate(state: State) -> State:
    context = "\n".join(f"[{d['source']}] {d['text']}" for d in state["docs"])
    messages = [{"role": "system", "content": f"{SYSTEM}\nCONTEXT:\n{context}"}]
    messages += [m for m in state.get("history", [])[-6:] if m.get("role") in ("user", "assistant")]
    messages.append({"role": "user", "content": state["question"]})

    client = Groq(api_key=os.environ["GROQ_API_KEY"], timeout=25, max_retries=0)
    last_err = None
    for model in MODELS:
        try:
            r = client.chat.completions.create(model=model, messages=messages, temperature=0.3, max_tokens=500)
            answer = (r.choices[0].message.content or "").strip()
            return {"answer": answer, "model": model, "trace": state["trace"] + [f"generate: {model}"]}
        except (RateLimitError, APIStatusError) as e:  # try the smaller model, then give up
            last_err = e
    raise RuntimeError(f"All models failed: {last_err}")


def build_graph():
    g = StateGraph(State)
    g.add_node("router", router)
    g.add_node("contact", contact)
    g.add_node("retrieve", retrieve)
    g.add_node("generate", generate)
    g.add_edge(START, "router")
    g.add_conditional_edges("router", lambda s: s["route"], {"contact": "contact", "knowledge": "retrieve"})
    g.add_edge("contact", "retrieve")
    g.add_edge("retrieve", "generate")
    g.add_edge("generate", END)
    return g.compile()


agent = build_graph()


def ask(question, history=None):
    out = agent.invoke({"question": question, "history": history or [], "docs": []})
    return {"answer": out["answer"], "trace": out["trace"], "model": out["model"]}
