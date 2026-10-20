"""Validated request models for the public API."""

from pydantic import BaseModel, Field, field_validator


class Credentials(BaseModel):
    email: str = Field(
        min_length=5,
        max_length=255,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )
    password: str = Field(min_length=8, max_length=72)


class RegisterRequest(Credentials):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value


def validate_prompt_word_count(value: str) -> str:
    if len(value.split()) > 100:
        raise ValueError("Prompt must be 100 words or fewer")
    return value


class GenerationRequest(BaseModel):
    title: str = Field(default="Untitled", max_length=200)
    prompt: str = Field(min_length=3)
    lyrics: str = Field(default="", max_length=5000)
    genre: str = ""
    mood: str = ""
    language: str = "English"
    instrumental: bool = False
    duration: int = Field(default=60, ge=5)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        return validate_prompt_word_count(value)


class AiRequest(BaseModel):
    prompt: str = Field(min_length=3)
    genre: str = ""
    mood: str = ""
    language: str = "English"

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        return validate_prompt_word_count(value)


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
