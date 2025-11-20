"""
============================================================================
DocFormatter Library - AI-Powered Document Formatter
============================================================================

A Python library to reformat academic documents (both in-text citations 
and reference lists) according to various citation styles using OpenAI GPT-4.

Supports: APA, IEEE, MLA, Chicago, Vancouver, and custom styles.

Uses emergentintegrations library with Emergent LLM Key.

----------------------------------------------------------------------------
USAGE EXAMPLES
----------------------------------------------------------------------------

# A. Initialize
from lib.doc_formatter import DocFormatter
formatter = DocFormatter(api_key="your-emergent-llm-key")

# B. Reformat Document with Standard Style
formatted_text = await formatter.reformat_document(
    document_text="...",
    format_style="APA",
    bibtex_content="..."
)

# C. Reformat with Custom Style Guide
formatted_text = await formatter.reformat_document(
    document_text="...",
    format_style="Custom",
    custom_style_guide="Use numbered citations [1], [2]...",
    bibtex_content="..."
)

============================================================================
"""

import json
import logging
from typing import Optional, Dict, List, Tuple
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)


class DocFormatter:
    """AI-powered document formatter using OpenAI GPT-4."""
    
    # Citation style descriptions for LLM
    STYLE_GUIDES = {
        "APA": """APA 7th Edition Style:
- In-text citations: (Author, Year) or Author (Year)
- Multiple authors: (Smith & Jones, 2020) or (Smith et al., 2020) for 3+ authors
- Reference list: Alphabetical by author surname
- Format: Author, A. A. (Year). Title of work. Publisher.
- Journal: Author, A. A. (Year). Title of article. Journal Name, Volume(Issue), pages. DOI""",
        
        "IEEE": """IEEE Style:
- In-text citations: Numbered in brackets [1], [2], [3]
- Order: By order of appearance in text
- Multiple: [1], [2] or [1]-[3]
- Reference list: Numbered list in order of appearance
- Format: [1] A. Author, "Title," Journal, vol. X, no. Y, pp. Z-ZZ, Month Year.""",
        
        "MLA": """MLA 9th Edition Style:
- In-text citations: (Author Page) or (Author)
- No year in text citation
- Reference list: Called "Works Cited", alphabetical
- Format: Author Last, First. "Title of Article." Journal Name, vol. X, no. Y, Year, pp. Z-ZZ.""",
        
        "Chicago": """Chicago Style (Author-Date):
- In-text citations: (Author Year) or (Author Year, Page)
- Multiple authors: (Smith and Jones 2020)
- Reference list: Alphabetical bibliography
- Format: Author Last, First. Year. "Title." Journal Name Volume (Issue): Pages.""",
        
        "Vancouver": """Vancouver Style:
- In-text citations: Superscript numbers¹ ² ³ or (1) (2) (3)
- Order: By order of appearance
- Reference list: Numbered list
- Format: 1. Author AA, Author BB. Title. Journal. Year;Volume:Pages."""
    }
    
    SYSTEM_PROMPT = """You are an expert academic editor specializing in citation formatting and bibliography management.

Your task is to reformat academic documents according to specific citation styles.

Key responsibilities:
1. Reformat in-text citations to match the target style
2. Generate properly formatted reference list/bibliography
3. Maintain document structure (headings, paragraphs, tables)
4. Ensure consistency throughout the document
5. Follow the exact rules of the specified citation style

You will be given:
- Original document text (may contain BibTeX keys like [@Smith2020])
- Target citation style (APA, IEEE, MLA, etc.)
- BibTeX entries with full reference information

Output Format:
Return a JSON object with:
{
  "formatted_text": "Full document with formatted citations",
  "formatted_references": "Formatted reference list section",
  "changes_summary": "Brief description of changes made"
}"""
    
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        """
        Initialize the Document Formatter.
        
        Args:
            api_key: Emergent LLM Key
            model: OpenAI model to use (default: gpt-4o)
        """
        if not api_key:
            logger.warning("DocFormatter: API Key was not provided. API calls will fail.")
        
        self.api_key = api_key
        self.model = model
    
    async def reformat_document(
        self,
        document_text: str,
        format_style: str,
        bibtex_content: str = "",
        custom_style_guide: str = "",
        progress_callback: Optional[callable] = None
    ) -> Dict[str, str]:
        """
        Reformat academic document according to citation style.
        
        Args:
            document_text: Full document text (with BibTeX keys or raw citations)
            format_style: Target style (APA, IEEE, MLA, Chicago, Vancouver, Custom)
            bibtex_content: BibTeX entries with reference information
            custom_style_guide: Custom formatting rules (used if format_style="Custom")
            progress_callback: Optional callback for progress updates
        
        Returns:
            Dictionary with:
            - formatted_text: Complete formatted document
            - formatted_references: Formatted reference list
            - changes_summary: Summary of changes
        """
        if not document_text.strip():
            raise ValueError("Document text is empty")
        
        if progress_callback:
            await progress_callback(0, 4, "เริ่มต้นการ format document...")
        
        # Get style guide
        style_guide = self._get_style_guide(format_style, custom_style_guide)
        
        if progress_callback:
            await progress_callback(1, 4, "วิเคราะห์รูปแบบ citation style...")
        
        # Split document into manageable chunks if too large
        chunks = self._split_document_for_processing(document_text)
        
        if len(chunks) > 1:
            logger.info(f"Document split into {len(chunks)} chunks for processing")
            return await self._reformat_large_document(
                chunks, 
                style_guide, 
                bibtex_content, 
                progress_callback
            )
        
        # Single chunk processing
        if progress_callback:
            await progress_callback(2, 4, "AI กำลัง reformat document...")
        
        result = await self._reformat_chunk(
            document_text,
            style_guide,
            bibtex_content
        )
        
        if progress_callback:
            await progress_callback(4, 4, "เสร็จสมบูรณ์!")
        
        return result
    
    def _get_style_guide(self, format_style: str, custom_guide: str) -> str:
        """Get style guide text for LLM."""
        if format_style == "Custom" and custom_guide:
            return f"Custom Citation Style:\n{custom_guide}"
        
        return self.STYLE_GUIDES.get(
            format_style,
            self.STYLE_GUIDES["APA"]  # Default to APA
        )
    
    def _split_document_for_processing(self, text: str, max_chars: int = 8000) -> List[str]:
        """
        Split document into chunks for processing.
        Tries to split at section boundaries.
        """
        if len(text) <= max_chars:
            return [text]
        
        # Try to split at major headings
        import re
        
        # Look for heading patterns
        heading_pattern = r'\n(?=[A-Z][A-Z\s]+\n|(?:\d+\.?\s+)?[A-Z][a-zA-Z\s]+\n)'
        
        parts = re.split(heading_pattern, text)
        
        # Combine parts into chunks
        chunks = []
        current_chunk = ""
        
        for part in parts:
            if len(current_chunk) + len(part) > max_chars and current_chunk:
                chunks.append(current_chunk)
                current_chunk = part
            else:
                current_chunk += part
        
        if current_chunk:
            chunks.append(current_chunk)
        
        return chunks if chunks else [text]
    
    async def _reformat_large_document(
        self,
        chunks: List[str],
        style_guide: str,
        bibtex_content: str,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, str]:
        """Process document in chunks and combine results."""
        formatted_chunks = []
        total_chunks = len(chunks)
        
        for i, chunk in enumerate(chunks):
            if progress_callback:
                await progress_callback(
                    i + 2,
                    total_chunks + 3,
                    f"กำลัง format ส่วนที่ {i+1}/{total_chunks}..."
                )
            
            result = await self._reformat_chunk(chunk, style_guide, bibtex_content)
            formatted_chunks.append(result["formatted_text"])
        
        # Combine chunks
        combined_text = "\n\n".join(formatted_chunks)
        
        # Extract references from last chunk (usually contains references)
        last_result = await self._reformat_chunk(chunks[-1], style_guide, bibtex_content)
        
        if progress_callback:
            await progress_callback(total_chunks + 3, total_chunks + 3, "เสร็จสมบูรณ์!")
        
        return {
            "formatted_text": combined_text,
            "formatted_references": last_result.get("formatted_references", ""),
            "changes_summary": f"Formatted {total_chunks} sections of the document"
        }
    
    async def _reformat_chunk(
        self,
        text: str,
        style_guide: str,
        bibtex_content: str
    ) -> Dict[str, str]:
        """
        Reformat a single chunk of text.
        
        Returns:
            Dict with formatted_text, formatted_references, changes_summary
        """
        prompt = self._build_formatting_prompt(text, style_guide, bibtex_content)
        
        try:
            # Create chat instance
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"doc-format-{id(self)}",
                system_message=self.SYSTEM_PROMPT
            ).with_model("openai", self.model)
            
            # Send message
            response = await chat.send_message(UserMessage(text=prompt))
            
            if not response:
                logger.warning("Empty response from LLM")
                return {
                    "formatted_text": text,
                    "formatted_references": "",
                    "changes_summary": "No changes made (empty response)"
                }
            
            # Parse JSON response
            try:
                result = self._parse_formatting_response(response)
                return result
            except Exception as e:
                logger.error(f"Failed to parse formatting response: {e}")
                # Return original text if parsing fails
                return {
                    "formatted_text": text,
                    "formatted_references": "",
                    "changes_summary": f"Formatting failed: {str(e)}"
                }
        
        except Exception as e:
            logger.error(f"DocFormatter Error: {e}")
            raise Exception(f"Failed to reformat document: {str(e)}")
    
    def _build_formatting_prompt(
        self,
        text: str,
        style_guide: str,
        bibtex_content: str
    ) -> str:
        """Build the formatting prompt for LLM."""
        
        # Count citations in text
        import re
        citation_count = len(re.findall(r'\[@\w+\]|\([A-Z][a-z]+.*?\d{4}\)|\[\d+\]', text))
        
        prompt = f"""Task: Reformat this academic document according to the specified citation style.

CITATION STYLE TO USE:
{style_guide}

BIBTEX REFERENCES:
{bibtex_content if bibtex_content else "No BibTeX data provided. Use references as they appear in text."}

DOCUMENT TO FORMAT:
{text}

INSTRUCTIONS:
1. Identify all in-text citations (may be in format [@CitationKey], (Author, Year), [1], etc.)
2. Reformat ALL in-text citations according to the target style
3. Locate or create a "References" or "Bibliography" section
4. Reformat ALL reference entries according to the target style
5. Maintain document structure (headings, paragraphs, spacing)
6. Ensure citation numbers/keys match between text and reference list
7. Alphabetize or number references according to style requirements

IMPORTANT:
- Do NOT change the content or meaning of the text
- ONLY change citation formatting and reference list formatting
- Preserve all headings, tables, and document structure
- Be consistent throughout the document

DETECTED CITATIONS IN TEXT: Approximately {citation_count} citations found

OUTPUT FORMAT:
Return a valid JSON object:
{{
  "formatted_text": "Complete document with all citations and content",
  "formatted_references": "Just the formatted reference list section",
  "changes_summary": "Brief summary of formatting changes made"
}}"""
        
        return prompt
    
    def _parse_formatting_response(self, response: str) -> Dict[str, str]:
        """Parse LLM response into structured format."""
        response_text = response.strip()
        
        # Handle markdown code blocks
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1]) if len(lines) > 2 else response_text
            response_text = response_text.replace("```json", "").replace("```", "").strip()
        
        # Parse JSON
        try:
            data = json.loads(response_text)
            
            return {
                "formatted_text": data.get("formatted_text", ""),
                "formatted_references": data.get("formatted_references", ""),
                "changes_summary": data.get("changes_summary", "Document formatted successfully")
            }
        except json.JSONDecodeError:
            # If not valid JSON, try to extract text
            logger.warning("Response is not valid JSON, attempting to extract content")
            
            # Simple fallback: assume response is the formatted text
            return {
                "formatted_text": response_text,
                "formatted_references": "",
                "changes_summary": "Formatted (raw text response)"
            }
    
    async def generate_formatted_reference_list(
        self,
        bibtex_content: str,
        format_style: str,
        custom_style_guide: str = ""
    ) -> str:
        """
        Generate a formatted reference list from BibTeX content.
        
        Args:
            bibtex_content: BibTeX entries
            format_style: Target style
            custom_style_guide: Custom rules
        
        Returns:
            Formatted reference list as string
        """
        if not bibtex_content.strip():
            return ""
        
        style_guide = self._get_style_guide(format_style, custom_style_guide)
        
        prompt = f"""Task: Generate a formatted reference list from BibTeX entries.

CITATION STYLE:
{style_guide}

BIBTEX ENTRIES:
{bibtex_content}

INSTRUCTIONS:
1. Parse all BibTeX entries
2. Format each entry according to the citation style
3. Order them according to style requirements (alphabetical or by number)
4. Return ONLY the formatted reference list

OUTPUT: Plain text reference list, one entry per line or properly formatted."""
        
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"ref-list-{id(self)}"
            ).with_model("openai", self.model)
            
            response = await chat.send_message(UserMessage(text=prompt))
            return response.strip() if response else ""
        
        except Exception as e:
            logger.error(f"Error generating reference list: {e}")
            return f"Error: {str(e)}"
