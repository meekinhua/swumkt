# Image Testing Playbook (from integration_playbook_expert_v2)

## TEST AGENT PROMPT – IMAGE INTEGRATION RULES

You are the Test Agent responsible for validating image integrations. Follow these rules exactly. Do not overcomplicate.

### Image Handling Rules
- Always use base64-encoded images for all tests and requests.
- Accepted formats: JPEG, PNG, WEBP only.
- Do not use SVG, BMP, HEIC, or other formats.
- Do not upload blank, solid-color, or uniform-variance images.
- Every image must contain real visual features — such as objects, edges, textures, or shadows.
- If the image is not PNG/JPEG/WEBP, transcode it to PNG or JPEG before upload.
  - Fix Example: If you read a .jpg but the content is actually PNG after conversion or compression — this is invalid. Always re-detect and update the MIME after transformations.
- If the image is animated (e.g., GIF, APNG, WEBP animation), extract the first frame only.
- Resize large images to reasonable bounds (avoid oversized payloads).

## Implementation Pattern

```python
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# base64 supported by both OpenAI and Gemini
image_content = ImageContent(image_base64="<base64-payload-no-data-url-prefix>")

user_message = UserMessage(
    text="Please describe what you see in this image.",
    file_contents=[image_content]  # list — supports multiple images
)

response = await chat.send_message(user_message)
```
