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
import asyncio
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
        Reformat academic document according to citation style with consistency.
        
        TWO-PASS APPROACH for large documents:
        - Pass 1: Extract all references and create master reference list
        - Pass 2: Convert each chunk using master reference list for consistency
        
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
            return await self._reformat_large_document_consistent(
                document_text,
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
            bibtex_content,
            master_references=None,
            chunk_info=None
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
    
    def _split_document_for_processing(self, text: str, max_chars: int = 4000) -> List[str]:
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
    
    async def _reformat_large_document_consistent(
        self,
        full_document: str,
        chunks: List[str],
        style_guide: str,
        bibtex_content: str,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, str]:
        """
        INCREMENTAL PROCESSING for consistent citation formatting.
        
        Instead of 2-pass (slow), we build master references incrementally:
        - Process chunks sequentially
        - Track all citations seen so far
        - Ensure consistency as we go
        - Much faster & lower token usage
        """
        total_chunks = len(chunks)
        total_steps = total_chunks + 3
        
        if progress_callback:
            await progress_callback(2, total_steps, "🚀 เริ่มแปลงแบบ incremental...")
        
        logger.info(f"INCREMENTAL: Processing {total_chunks} chunks with consistency tracking")
        
        # Track citations incrementally
        seen_citations = {}  # {citation_text: citation_number}
        next_citation_number = 1
        formatted_chunks = []
        all_references = []
        
        for i, chunk in enumerate(chunks):
            if progress_callback:
                await progress_callback(
                    3 + i,
                    total_steps,
                    f"📝 chunk {i+1}/{total_chunks} (citations: {len(seen_citations)})..."
                )
            
            chunk_info = {
                "chunk_number": i + 1,
                "total_chunks": total_chunks,
                "is_first": i == 0,
                "is_last": i == len(chunks) - 1,
                "seen_citations": dict(list(seen_citations.items())[:20])  # Pass recent citations
            }
            
            # Process chunk
            result = await self._reformat_chunk_incremental(
                chunk,
                style_guide,
                bibtex_content,
                seen_citations=seen_citations,
                next_citation_number=next_citation_number,
                chunk_info=chunk_info
            )
            
            formatted_chunks.append(result["formatted_text"])
            
            # Update tracking from result
            if "new_citations" in result and result["new_citations"]:
                for citation in result["new_citations"]:
                    # Handle both string and dict citations
                    if isinstance(citation, dict):
                        citation_key = citation.get("text", str(citation))
                    else:
                        citation_key = str(citation)
                    
                    if citation_key not in seen_citations:
                        seen_citations[citation_key] = next_citation_number
                        next_citation_number += 1
            
            # Collect references
            if result.get("references"):
                all_references.extend(result["references"])
            
            # Small delay
            if i < len(chunks) - 1:
                await asyncio.sleep(0.3)
            
            logger.info(f"Chunk {i+1} complete. Total citations tracked: {len(seen_citations)}")
        
        # Combine chunks
        combined_text = "\n\n".join(formatted_chunks)
        
        # Build final reference list
        formatted_references = self._build_final_references(
            all_references,
            style_guide
        )
        
        if progress_callback:
            await progress_callback(total_steps, total_steps, "✅ เสร็จสมบูรณ์!")
        
        return {
            "formatted_text": combined_text,
            "formatted_references": formatted_references,
            "changes_summary": f"Formatted {total_chunks} chunks with {len(seen_citations)} unique citations"
        }
    
    async def _reformat_chunk_incremental(
        self,
        text: str,
        style_guide: str,
        bibtex_content: str,
        seen_citations: Dict[str, int],
        next_citation_number: int,
        chunk_info: Dict
    ) -> Dict[str, any]:
        """
        Reformat chunk with incremental citation tracking.
        ULTRA-SIMPLIFIED for speed.
        
        Returns:
            Dict with formatted_text, new_citations, references
        """
        # Ultra-simple prompt
        style_name = style_guide.split(':')[0].strip()
        
        # Show only last 10 citations (not 15)
        cite_sample = ""
        if seen_citations and len(seen_citations) > 0:
            recent = list(seen_citations.items())[-10:]
            cite_sample = ", ".join([f"{txt}=[{num}]" for txt, num in recent[:5]])
            cite_sample = f"Known: {cite_sample}... (total {len(seen_citations)})"
        
        prompt = f"""Convert citations to {style_name} format.

Chunk {chunk_info['chunk_number']}/{chunk_info['total_chunks']}:
{text[:3000]}...

{cite_sample}
New citations start at [{next_citation_number}]

Return JSON:
{{"formatted_text": "...", "new_citations": [...]}}"""

        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"c{chunk_info['chunk_number']}",
                system_message=f"Convert citations to {style_name}. Return JSON only."
            ).with_model("openai", self.model)
            
            # Add timeout
            import asyncio
            response = await asyncio.wait_for(
                chat.send_message(UserMessage(text=prompt)),
                timeout=45.0  # 45 second timeout per chunk
            )
            
            # Parse response
            response_text = response.strip()
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1]).replace("```json", "").replace("```", "").strip()
            
            import json
            result = json.loads(response_text)
            
            logger.info(f"Chunk {chunk_info['chunk_number']} processed successfully")
            return result
            
        except asyncio.TimeoutError:
            logger.warning(f"Chunk {chunk_info['chunk_number']} TIMEOUT - using original text")
            return {
                "formatted_text": text,
                "new_citations": [],
                "changes_summary": "Timeout - skipped"
            }
        except Exception as e:
            logger.error(f"Chunk {chunk_info['chunk_number']} ERROR: {e}")
            # Fallback: return original
            return {
                "formatted_text": text,
                "new_citations": [],
                "changes_summary": "Error: skipped"
            }
    
    def _build_final_references(self, all_references: List, style_guide: str) -> str:
        """Build final reference list from collected references."""
        if not all_references:
            return ""
        
        # Deduplicate and sort
        unique_refs = []
        seen = set()
        
        for ref in all_references:
            ref_text = ref.get("text", "")
            if ref_text and ref_text not in seen:
                unique_refs.append(ref)
                seen.add(ref_text)
        
        # Format based on style
        if "IEEE" in style_guide or "numbered" in style_guide.lower():
            # Numbered list
            formatted = "\n".join([f"[{i+1}] {ref.get('text', '')}" for i, ref in enumerate(unique_refs)])
        else:
            # Alphabetical (APA, MLA, etc.)
            sorted_refs = sorted(unique_refs, key=lambda x: x.get('text', ''))
            formatted = "\n".join([ref.get('text', '') for ref in sorted_refs])
        
        return formatted
    
    async def _extract_master_references(
        self,
        full_text: str,
        style_guide: str,
        bibtex_content: str
    ) -> Dict[str, any]:
        """
        PASS 1: Extract all unique references from entire document.
        Creates a master reference list with consistent numbering/ordering.
        
        Returns:
            Dict with:
            - references: List of all unique references
            - formatted_references: Formatted reference list string
            - citation_map: Mapping from citation text to reference number
        """
        prompt = f"""Task: Extract ALL unique references from this academic document.

CITATION STYLE:
{style_guide}

FULL DOCUMENT TEXT:
{full_text[:15000]}...  (showing first part for reference extraction)

BIBTEX DATA (if available):
{bibtex_content[:5000] if bibtex_content else "None"}

INSTRUCTIONS:
1. Find ALL unique references/citations mentioned in the document
2. Create a master reference list according to the target citation style
3. Assign consistent numbers/keys to each reference
4. For numbered styles (IEEE): number by order of first appearance
5. For author-year styles (APA): alphabetize by author surname

OUTPUT: Return a JSON object with:
{{
  "references": [
    {{"id": "1", "text": "Author et al., 'Title,' Journal, 2020"}},
    {{"id": "2", "text": "Another Author, 'Title 2,' Conference, 2021"}}
  ],
  "formatted_references": "Full formatted reference list as string",
  "total_references": 10
}}"""

        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"master-refs-{id(self)}",
                system_message="You are an expert at extracting and organizing academic references."
            ).with_model("openai", self.model)
            
            response = await chat.send_message(UserMessage(text=prompt))
            
            # Parse response
            response_text = response.strip()
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1]).replace("```json", "").replace("```", "").strip()
            
            import json
            data = json.loads(response_text)
            
            logger.info(f"Extracted {data.get('total_references', 0)} master references")
            return data
            
        except Exception as e:
            logger.error(f"Error extracting master references: {e}")
            # Return empty master list if extraction fails
            return {
                "references": [],
                "formatted_references": "",
                "total_references": 0
            }
    
    async def _reformat_chunk(
        self,
        text: str,
        style_guide: str,
        bibtex_content: str,
        master_references: Optional[Dict] = None,
        chunk_info: Optional[Dict] = None
    ) -> Dict[str, str]:
        """
        Reformat a single chunk of text.
        
        Args:
            text: Chunk text to format
            style_guide: Citation style rules
            bibtex_content: BibTeX data
            master_references: Master reference list for consistency (Pass 2)
            chunk_info: Info about chunk position (chunk_number, total_chunks, etc.)
        
        Returns:
            Dict with formatted_text, formatted_references, changes_summary
        """
        prompt = self._build_formatting_prompt(
            text, 
            style_guide, 
            bibtex_content,
            master_references=master_references,
            chunk_info=chunk_info
        )
        
        try:
            # Create chat instance
            session_suffix = f"-chunk{chunk_info['chunk_number']}" if chunk_info else ""
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"doc-format-{id(self)}{session_suffix}",
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
        bibtex_content: str,
        master_references: Optional[Dict] = None,
        chunk_info: Optional[Dict] = None
    ) -> str:
        """Build the formatting prompt for LLM with consistency support."""
        
        # Count citations in text
        import re
        citation_count = len(re.findall(r'\[@\w+\]|\([A-Z][a-z]+.*?\d{4}\)|\[\d+\]', text))
        
        # Build master references section if provided (Pass 2)
        master_ref_section = ""
        if master_references and master_references.get("references"):
            ref_list = master_references["references"][:20]  # Show first 20 for context
            master_ref_section = f"""
MASTER REFERENCE LIST (USE THIS FOR CONSISTENCY):
You MUST use these exact references and their assigned numbers/keys:
{chr(10).join([f"{r['id']}. {r['text']}" for r in ref_list])}
... (Total: {master_references.get('total_references', 0)} references)

CRITICAL: When you see a citation in the text, map it to the corresponding number/key from this master list.
Do NOT create new reference numbers. Use ONLY the numbers from the master list above.
"""
        
        # Build chunk context if provided
        chunk_context = ""
        if chunk_info:
            chunk_context = f"""
CHUNK INFORMATION:
This is chunk {chunk_info['chunk_number']} of {chunk_info['total_chunks']}.
{"This is the FIRST chunk - it may contain the introduction." if chunk_info['is_first'] else ""}
{"This is the LAST chunk - it may contain the reference list." if chunk_info['is_last'] else ""}

IMPORTANT: Maintain citation number consistency with the master reference list.
"""
        
        prompt = f"""Task: Reformat this academic document chunk according to the specified citation style.

CITATION STYLE TO USE:
{style_guide}
{master_ref_section}
{chunk_context}

BIBTEX REFERENCES (for context):
{bibtex_content[:2000] if bibtex_content else "No BibTeX data provided."}

DOCUMENT CHUNK TO FORMAT:
{text}

INSTRUCTIONS:
1. Identify all in-text citations (may be in format [@CitationKey], (Author, Year), [1], etc.)
2. Map each citation to the MASTER REFERENCE LIST number/key
3. Reformat ALL in-text citations according to the target style using master list numbers
4. Maintain document structure (headings, paragraphs, spacing)
5. Do NOT create new reference numbers - use ONLY numbers from master list
6. Do NOT include the reference list in the output (unless this is the last chunk)

IMPORTANT:
- Do NOT change the content or meaning of the text
- ONLY change citation formatting
- Preserve all headings, tables, and document structure
- Be CONSISTENT with master reference numbering

DETECTED CITATIONS: Approximately {citation_count} citations found

OUTPUT FORMAT:
Return a valid JSON object:
{{
  "formatted_text": "Complete chunk with formatted citations (NO reference list unless last chunk)",
  "formatted_references": "",
  "changes_summary": "Brief summary of changes"
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
