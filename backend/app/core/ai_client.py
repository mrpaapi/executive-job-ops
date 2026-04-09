from openai import AsyncOpenAI
from app.core.config import settings

def get_ai_client() -> AsyncOpenAI:
    if settings.use_local_llm:
        return AsyncOpenAI(
            base_url=settings.local_llm_url,
            api_key="local",
        )
    return AsyncOpenAI(api_key=settings.openai_api_key)

async def chat(messages: list[dict], json_mode: bool = False) -> str:
    client = get_ai_client()
    model = settings.local_llm_model if settings.use_local_llm else settings.openai_model

    kwargs = dict(model=model, messages=messages, temperature=0.3)
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    resp = await client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content
