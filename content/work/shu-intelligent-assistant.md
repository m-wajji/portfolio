## TL;DR
My final year project: a **bilingual (Urdu / English) agentic assistant** for Salim Habib University that people can talk to by **voice or text**. Specialised agents answer university questions and retrieve answers from documents through a **multimodal RAG** pipeline. The whole system is **containerised and deployed with infrastructure as code**.

## Problem
Students and visitors ask the same questions again and again — admissions, fees, programmes, rules — and the answers are scattered across web pages and PDFs. Many people are more comfortable asking in Urdu, and some prefer speaking to typing.

## Architecture

<div class="diagram" data-diagram="shu"></div>

- **Frontend:** a responsive Next.js chat interface with text and voice input.
- **Voice:** speech is transcribed (Whisper / Google STT) and answers can be spoken back (Google TTS), in Urdu or English.
- **Agents (LangGraph):** a router sends each question to the right specialist:
  - a **QA agent** for general university queries;
  - a **PDF agent** that retrieves answers from university documents.
- **Retrieval:** a multimodal RAG pipeline over **ChromaDB**. University web pages were crawled with **Crawl4AI**, and **YOLOv11** helps extract visual content such as tables and figures from documents.
- **Backend:** FastAPI, with the OpenAI API as the language model.

## Deployment
Most student projects stop at `localhost`. This one is deployed like production software:
- **Terraform** provisions the cloud infrastructure.
- **Ansible** configures the servers.
- **Docker Compose** for local development and **Docker Swarm** for deployment.
- **GitHub Actions** builds and deploys on every push, over SSH with a deploy key.

## Stack
LangGraph · LangChain · ChromaDB · YOLOv11 · OpenAI API · Whisper · Google TTS / STT · FastAPI · Next.js · Terraform · Ansible · Docker Swarm · GitHub Actions

## What I learned
- Routing to small, focused agents beats one agent that does everything.
- Retrieval quality depends on document parsing more than on the model.
- Shipping with CI/CD from the start made every later change cheap.
