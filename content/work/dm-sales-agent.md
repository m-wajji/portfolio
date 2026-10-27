## TL;DR
At Codet AI I build a **LangGraph conversational agent that sells inside social media DMs**. It handles the whole customer lifecycle, from the first message to checkout, as part of the company's go-to-market platform.

> Company work. The code and numbers are private, so this page describes the problem and the architecture only.

## Problem
Brands get a large share of their buying intent in Instagram and other DMs. Replies are slow, inconsistent and stop outside working hours, and every unanswered "price?" is a lost sale. A FAQ bot isn't enough: the conversation has to move from interest to an actual order.

## My role
AI Product Engineer: I design and build the agent, from conversation flow to the tools it calls, and I build other agents for the same platform.

## Architecture
The conversation is modelled as a **LangGraph state graph**. Each stage of the customer lifecycle is a node, and the graph decides where the conversation goes next:

<div class="diagram" data-diagram="dm-agent"></div>

- **DM entry:** the first message arrives and conversation state is loaded.
- **Intent:** what does the customer want — to browse, ask a question, or buy?
- **Product discovery:** find and recommend products using tools over the store's catalogue.
- **Cart:** build and confirm the order.
- **Checkout:** hand the customer a way to pay.
- **Follow-up:** keep the conversation going after the sale.

## Why a graph, not one big prompt
- **Control:** each stage has a narrow job and its own instructions, so behaviour is predictable.
- **Tools at the right time:** catalogue, cart and checkout tools are only available where they make sense.
- **Debuggable:** when a conversation goes wrong, you can see which node made the decision.

## Stack
LangGraph · LangChain · LLMs · Python · TypeScript · FastAPI

## What's next
A public re-creation of this agent running on a fake store, so anyone can try it.
