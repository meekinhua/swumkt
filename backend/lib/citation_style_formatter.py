"""
Citation Style Formatter - LLM-based citation reformatting

Replace Pandoc with LLM to reformat citations and references according to
academic style standards (APA, IEEE, MLA, Chicago, etc.)
"""

import logging
from typing import List, Dict, Tuple, Optional
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)


class CitationStyleFormatter:
    """Reformat citations and references using LLM."""
    
    # Style-specific formatting rules
    STYLE_RULES = {
        "APA": """
APA 7th Edition Style Rules:
- In-text: (Author, Year) or Author (Year)
- Multiple authors: (Smith & Jones, 2020) or (Smith et al., 2020) for 3+
- Multiple citations: (Smith, 2020; Jones, 2021)
- References: Author, A. A., & Author, B. B. (Year). Title. Journal, volume(issue), pages. DOI

Example References:
Smith, J., & Jones, M. (2020). Digital marketing strategies. Journal of Marketing, 45(2), 123-145. https://doi.org/10.1234/jm.2020.123
Brown, A., Wilson, K., & Davis, L. (2019). Consumer behavior analysis. Marketing Science, 38(4), 567-589.
""",
        "IEEE": """
IEEE Citation Style Rules:
- In-text: [1] or [1]-[3] or [1, 5, 7]
- Numbers in order of first appearance
- References: [1] A. Author and B. Author, "Title," Journal, vol. X, no. Y, pp. Z-ZZ, Month Year. DOI

Example References:
[1] J. Smith and M. Jones, "Digital marketing strategies," Journal of Marketing, vol. 45, no. 2, pp. 123-145, Apr. 2020.
[2] A. Brown, K. Wilson, and L. Davis, "Consumer behavior analysis," Marketing Science, vol. 38, no. 4, pp. 567-589, Aug. 2019.
""",
        "MLA": """
MLA 9th Edition Style Rules:
- In-text: (Author page) or (Author)
- References: Author, First. "Title." Journal, vol. X, no. Y, Year, pp. Z-ZZ.

Example References:
Smith, John, and Mary Jones. "Digital Marketing Strategies." Journal of Marketing, vol. 45, no. 2, 2020, pp. 123-145.
Brown, Alice, et al. "Consumer Behavior Analysis." Marketing Science, vol. 38, no. 4, 2019, pp. 567-589.
""",
        "Chicago": """
Chicago Style (Author-Date) Rules:
- In-text: (Author Year) or (Author Year, page)
- References: Author, First. Year. "Title." Journal volume (issue): pages.

Example References:
Smith, John, and Mary Jones. 2020. "Digital Marketing Strategies." Journal of Marketing 45 (2): 123-145.
Brown, Alice, Karen Wilson, and Linda Davis. 2019. "Consumer Behavior Analysis." Marketing Science 38 (4): 567-589.
"""
    }
    
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.api_key = api_key
        self.model = model
    
    async def reformat_document(
        self,
        document_text: str,
        bibtex_content: str,
        target_style: str = "APA",
        progress_callback: Optional[callable] = None
    ) -> Tuple[str, Dict]:
        """
        Reformat entire document to match citation style.
        
        Args:
            document_text: Full document text
            bibtex_content: BibTeX entries
            target_style: Target citation style (APA, IEEE, MLA, Chicago)
            progress_callback: Optional progress updates
            
        Returns:
            (reformatted_text, formatting_summary)
        """
        if progress_callback:
            await progress_callback(10, f"เริ่มต้น reformat เป็น {target_style} style...")
        
        # Get style rules
        style_rules = self.STYLE_RULES.get(target_style, self.STYLE_RULES["APA"])
        
        # Split document into body and references
        body_text, references_text = self._split_body_and_references(document_text)
        
        logger.info(f"Split document: body={len(body_text)} chars, refs={len(references_text)} chars")
        
        if progress_callback:
            await progress_callback(30, "กำลัง reformat in-text citations...")
        
        # Step 1: Reformat in-text citations
        reformatted_body = await self._reformat_intext_citations(
            body_text,
            bibtex_content,
            target_style,
            style_rules
        )
        
        if progress_callback:
            await progress_callback(60, "กำลัง reformat References section...")
        
        # Step 2: Reformat references list
        reformatted_references = await self._reformat_references_list(
            bibtex_content,
            target_style,
            style_rules
        )
        
        if progress_callback:
            await progress_callback(90, "กำลังรวมเอกสาร...")
        
        # Combine back
        final_text = reformatted_body + "\n\nReferences\n\n" + reformatted_references
        
        # Summary
        summary = {
            "style": target_style,
            "body_length": len(reformatted_body),
            "references_count": reformatted_references.count('\n') + 1,
            "changes_made": [
                f"Reformatted in-text citations to {target_style} style",
                f"Reformatted References section to {target_style} style"
            ]
        }
        
        if progress_callback:
            await progress_callback(100, "เสร็จสมบูรณ์!")
        
        return final_text, summary
    
    def _split_body_and_references(self, text: str) -> Tuple[str, str]:
        """Split document into body and references section."""
        import re
        
        # Find References heading
        patterns = [
            r'\n\s*References\s*\n',
            r'\n\s*REFERENCES\s*\n',
            r'\n\s*Bibliography\s*\n',
            r'\n\s*บรรณานุกรม\s*\n'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                body = text[:match.start()]
                references = text[match.end():]
                return body.strip(), references.strip()
        
        # If no references section found, assume last 30% is references
        split_point = int(len(text) * 0.7)
        return text[:split_point].strip(), text[split_point:].strip()
    
    async def _reformat_intext_citations(
        self,
        body_text: str,
        bibtex_content: str,
        target_style: str,
        style_rules: str
    ) -> str:
        """Reformat in-text citations using LLM."""
        
        # If text is too long, process in chunks
        max_chunk_size = 3000  # chars
        
        if len(body_text) > max_chunk_size:
            return await self._reformat_intext_citations_chunked(
                body_text, bibtex_content, target_style, style_rules
            )
        
        prompt = f"""Task: Reformat ALL in-text citations in the text below to match {target_style} style.

{style_rules}

BibTeX Entries Available:
{bibtex_content[:2000]}

Text to Reformat:
{body_text}

Instructions:
1. Find ALL in-text citations in the text
2. Reformat each citation according to {target_style} style rules above
3. Maintain the exact same text content, only change citation format
4. Preserve paragraph structure and line breaks
5. Return the COMPLETE reformatted text

Output: The complete text with reformatted citations."""
        
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"format-intext-{id(self)}"
            ).with_model("openai", self.model)
            
            response = await chat.send_message(UserMessage(text=prompt))
            
            if response:
                return response.strip()
            else:
                logger.warning("Empty response from LLM for in-text formatting")
                return body_text
                
        except Exception as e:
            logger.error(f"In-text citation formatting error: {e}")
            return body_text
    
    async def _reformat_intext_citations_chunked(
        self,
        body_text: str,
        bibtex_content: str,
        target_style: str,
        style_rules: str
    ) -> str:
        """Reformat in-text citations in chunks for large documents."""
        
        # Split into paragraphs
        paragraphs = body_text.split('\n\n')
        
        # Group into chunks
        chunks = []
        current_chunk = []
        current_size = 0
        
        for para in paragraphs:
            if current_size + len(para) > 3000 and current_chunk:
                chunks.append('\n\n'.join(current_chunk))
                current_chunk = []
                current_size = 0
            
            current_chunk.append(para)
            current_size += len(para)
        
        if current_chunk:
            chunks.append('\n\n'.join(current_chunk))
        
        logger.info(f"Processing in-text citations in {len(chunks)} chunks")
        
        # Process each chunk
        reformatted_chunks = []
        
        for i, chunk in enumerate(chunks):
            logger.info(f"Formatting chunk {i+1}/{len(chunks)}")
            
            prompt = f"""Task: Reformat ALL in-text citations to {target_style} style.

{style_rules}

BibTeX Entries (reference):
{bibtex_content[:1500]}

Text chunk to reformat:
{chunk}

Return the reformatted text with proper {target_style} in-text citations."""
            
            try:
                chat = LlmChat(
                    api_key=self.api_key,
                    session_id=f"format-chunk-{i}"
                ).with_model("openai", self.model)
                
                response = await chat.send_message(UserMessage(text=prompt))
                reformatted_chunks.append(response.strip() if response else chunk)
                
            except Exception as e:
                logger.error(f"Error formatting chunk {i+1}: {e}")
                reformatted_chunks.append(chunk)
        
        return '\n\n'.join(reformatted_chunks)
    
    async def _reformat_references_list(
        self,
        bibtex_content: str,
        target_style: str,
        style_rules: str
    ) -> str:
        """Reformat references list using LLM."""
        
        prompt = f"""Task: Convert BibTeX entries to formatted {target_style} reference list.

{style_rules}

BibTeX Entries:
{bibtex_content}

Instructions:
1. Convert each BibTeX entry to proper {target_style} format
2. List entries in alphabetical order by author (or numerical for IEEE)
3. Format according to {target_style} rules shown above
4. Include all available information (authors, year, title, journal, volume, pages, DOI)
5. Return ONLY the formatted reference list, one per line

Output: Formatted reference list in {target_style} style."""
        
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"format-refs-{id(self)}"
            ).with_model("openai", self.model)
            
            response = await chat.send_message(UserMessage(text=prompt))
            
            if response:
                return response.strip()
            else:
                logger.warning("Empty response from LLM for references formatting")
                return bibtex_content
                
        except Exception as e:
            logger.error(f"References formatting error: {e}")
            return bibtex_content
