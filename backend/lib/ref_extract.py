"""
============================================================================
RefExtract Library - AI-Powered Reference Extractor & BibTeX Generator
============================================================================

A Python library to extract academic references from unstructured text 
or images and convert them into BibTeX format using OpenAI GPT-4.

Uses emergentintegrations library with Emergent LLM Key.

----------------------------------------------------------------------------
USAGE EXAMPLES
----------------------------------------------------------------------------

# A. Initialize
from lib.ref_extract import RefExtract
extractor = RefExtract(api_key="your-emergent-llm-key")

# B. Extract from Raw Text
text = '''
  1. Vaswani, A., et al. (2017). Attention is all you need. NeurIPS.
  2. LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature.
'''
refs = await extractor.extract_from_text(text)

# C. Extract from Image (base64 string)
refs_from_img = await extractor.extract_from_image(base64_data)

# D. Convert to BibTeX String
bibtex = RefExtract.to_bibtex_file(refs)
print(bibtex)

============================================================================
"""

import json
import logging
from typing import List, Dict, Optional, Any
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

logger = logging.getLogger(__name__)


class ReferenceData:
    """Represents a structured academic reference."""
    
    def __init__(
        self,
        citation_key: str,
        entry_type: str,
        title: Optional[str] = None,
        author: Optional[str] = None,
        year: Optional[str] = None,
        journal: Optional[str] = None,
        booktitle: Optional[str] = None,
        volume: Optional[str] = None,
        number: Optional[str] = None,
        pages: Optional[str] = None,
        publisher: Optional[str] = None,
        doi: Optional[str] = None,
        url: Optional[str] = None,
        **kwargs
    ):
        self.citation_key = citation_key
        self.entry_type = entry_type
        self.title = title
        self.author = author
        self.year = year
        self.journal = journal
        self.booktitle = booktitle
        self.volume = volume
        self.number = number
        self.pages = pages
        self.publisher = publisher
        self.doi = doi
        self.url = url
        # Store any additional fields
        self.extra_fields = kwargs
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        data = {
            "citation_key": self.citation_key,
            "entry_type": self.entry_type,
        }
        
        # Add optional fields
        for field in ["title", "author", "year", "journal", "booktitle", 
                      "volume", "number", "pages", "publisher", "doi", "url"]:
            value = getattr(self, field)
            if value:
                data[field] = value
        
        # Add extra fields
        data.update(self.extra_fields)
        
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ReferenceData':
        """Create from dictionary."""
        citation_key = data.get("citation_key") or data.get("citationKey", "")
        entry_type = data.get("entry_type") or data.get("entryType", "misc")
        
        # Extract known fields
        known_fields = {
            "title": data.get("title"),
            "author": data.get("author"),
            "year": data.get("year"),
            "journal": data.get("journal"),
            "booktitle": data.get("booktitle"),
            "volume": data.get("volume"),
            "number": data.get("number"),
            "pages": data.get("pages"),
            "publisher": data.get("publisher"),
            "doi": data.get("doi"),
            "url": data.get("url"),
        }
        
        # Get extra fields
        extra = {k: v for k, v in data.items() 
                 if k not in known_fields and k not in ["citation_key", "citationKey", "entry_type", "entryType"]}
        
        return cls(
            citation_key=citation_key,
            entry_type=entry_type,
            **{k: v for k, v in known_fields.items() if v},
            **extra
        )


class RefExtract:
    """AI-powered reference extractor using OpenAI GPT-4."""
    
    SYSTEM_PROMPT = """You are an expert academic librarian and data parser. 
Your task is to extract academic references from text or images and format them as valid JSON.

Output Format:
- Return a JSON array of reference objects
- Each reference must have: citationKey, entryType, title, author, year
- Generate unique citation keys (e.g., "Vaswani2017", "LeCun2015")
- Identify correct BibTeX entry types: article, book, inproceedings, phdthesis, etc.
- Extract all available fields: journal, volume, pages, doi, url, etc.

Rules:
- Ignore headers, page numbers, and non-reference text
- Use standard BibTeX field names
- Author names should be separated by " and "
- Return empty array [] if no references found"""
    
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        """
        Initialize the Reference Extractor.
        
        Args:
            api_key: Emergent LLM Key
            model: OpenAI model to use (default: gpt-4o)
        """
        if not api_key:
            logger.warning("RefExtract: API Key was not provided. API calls will fail.")
        
        self.api_key = api_key
        self.model = model
    
    async def extract_from_text(
        self, 
        text: str,
        progress_callback: Optional[callable] = None
    ) -> List[ReferenceData]:
        """
        Extract references from plain text.
        Splits text into smaller chunks for better LLM performance.
        
        Args:
            text: Raw text containing references
            progress_callback: Optional callback function to report progress
                               Called with (current_chunk, total_chunks, extracted_count)
            
        Returns:
            List of ReferenceData objects
        """
        if not text.strip():
            return []
        
        # Split text into reference chunks
        chunks = self._split_into_reference_chunks(text)
        total_chunks = len(chunks)
        
        logger.info(f"Split text into {total_chunks} chunks for processing")
        
        if progress_callback:
            await progress_callback(0, total_chunks, 0, "เริ่มต้นวิเคราะห์...")
        
        # Process each chunk
        all_refs = []
        for i, chunk in enumerate(chunks):
            logger.info(f"Processing chunk {i+1}/{total_chunks} ({len(chunk)} chars)")
            
            if progress_callback:
                await progress_callback(i, total_chunks, len(all_refs), f"กำลังวิเคราะห์ส่วนที่ {i+1}/{total_chunks}...")
            
            prompt = f"""Task: Extract all academic references from the text below.

Requirements:
1. Ignore non-reference text (headers, page numbers, etc.)
2. Generate unique BibTeX citation keys (e.g., AuthorYear)
3. Identify correct BibTeX entry type (article, book, inproceedings, etc.)
4. Extract all available fields

Text to process:
{chunk}

Output valid JSON array of reference objects."""
            
            try:
                refs = await self._process(prompt)
                all_refs.extend(refs)
                logger.info(f"Extracted {len(refs)} references from chunk {i+1}")
                
                if progress_callback:
                    await progress_callback(
                        i+1, 
                        total_chunks, 
                        len(all_refs), 
                        f"เสร็จสิ้นส่วนที่ {i+1}/{total_chunks} (พบ {len(refs)} รายการ)"
                    )
            except Exception as e:
                logger.error(f"Error processing chunk {i+1}: {e}")
                if progress_callback:
                    await progress_callback(
                        i+1, 
                        total_chunks, 
                        len(all_refs), 
                        f"ข้ามส่วนที่ {i+1} (มีข้อผิดพลาด)"
                    )
                continue
        
        logger.info(f"Total extracted: {len(all_refs)} references")
        
        if progress_callback:
            await progress_callback(total_chunks, total_chunks, len(all_refs), "เสร็จสมบูรณ์!")
        
        return all_refs
    
    def _split_into_reference_chunks(self, text: str, max_refs_per_chunk: int = 8) -> List[str]:
        """
        Split reference text into smaller chunks.
        Each reference is typically 1-3 lines.
        
        Args:
            text: Full reference text
            max_refs_per_chunk: Maximum references per chunk
            
        Returns:
            List of text chunks
        """
        # Split by double newlines or numbered patterns
        import re
        
        # Try to split by common patterns:
        # 1. Numbered references (1., [1], 1), etc.)
        # 2. Author-year patterns at line start
        # 3. Double newlines
        
        # First, normalize line endings
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        
        # Split by patterns that indicate start of new reference
        # Pattern 1: Lines starting with numbers (1., [1], 1))
        pattern1 = r'\n(?=\d+[\.\)\]]?\s+[A-Z])'
        
        # Pattern 2: Lines starting with Author name (Uppercase letter at start of line)
        pattern2 = r'\n(?=[A-Z][a-z]+,\s+[A-Z]\.?)'
        
        # Try pattern 1 first
        parts = re.split(pattern1, text)
        
        # If didn't split well, try pattern 2
        if len(parts) < 2:
            parts = re.split(pattern2, text)
        
        # If still didn't split, split by double newlines
        if len(parts) < 2:
            parts = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        # If still single part, split by single newlines as last resort
        if len(parts) == 1 and len(text) > 1000:
            parts = [p.strip() for p in text.split('\n') if p.strip() and len(p.strip()) > 50]
        
        # Clean up parts
        parts = [p.strip() for p in parts if p.strip()]
        
        # Group into chunks
        chunks = []
        current_chunk = []
        
        for part in parts:
            current_chunk.append(part)
            
            if len(current_chunk) >= max_refs_per_chunk:
                chunks.append('\n\n'.join(current_chunk))
                current_chunk = []
        
        # Add remaining
        if current_chunk:
            chunks.append('\n\n'.join(current_chunk))
        
        # If no chunks created (text is small), return as single chunk
        if not chunks:
            chunks = [text]
        
        return chunks
    
    async def extract_from_image(self, base64_image: str) -> List[ReferenceData]:
        """
        Extract references from an image.
        
        Args:
            base64_image: Base64 encoded image (without data URI prefix)
            
        Returns:
            List of ReferenceData objects
        """
        if not base64_image:
            return []
        
        prompt = """Task: Extract all academic references visible in this image.

Requirements:
1. OCR the text accurately
2. Generate unique citation keys for each reference
3. Infer the entry type (article, book, etc.)
4. Extract as many fields as possible (author, title, year, journal, doi, etc.)

Output valid JSON array of reference objects."""
        
        return await self._process(prompt, image_base64=base64_image)
    
    async def _process(
        self, 
        prompt: str, 
        image_base64: Optional[str] = None
    ) -> List[ReferenceData]:
        """
        Internal method to handle LLM interaction.
        
        Args:
            prompt: The extraction prompt
            image_base64: Optional base64 encoded image
            
        Returns:
            List of ReferenceData objects
        """
        try:
            # Create chat instance for this request
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"ref-extract-{id(self)}",
                system_message=self.SYSTEM_PROMPT
            ).with_model("openai", self.model)
            
            # Create user message
            if image_base64:
                # With image
                image_content = ImageContent(image_base64=image_base64)
                user_message = UserMessage(
                    text=prompt,
                    file_contents=[image_content]
                )
            else:
                # Text only
                user_message = UserMessage(text=prompt)
            
            # Send message and get response
            response = await chat.send_message(user_message)
            
            if not response:
                logger.warning("Empty response from LLM")
                return []
            
            # Parse JSON response
            try:
                # Try to extract JSON from response
                response_text = response.strip()
                
                # Handle markdown code blocks
                if response_text.startswith("```"):
                    # Extract content between code blocks
                    lines = response_text.split("\n")
                    response_text = "\n".join(lines[1:-1]) if len(lines) > 2 else response_text
                    response_text = response_text.replace("```json", "").replace("```", "").strip()
                
                data = json.loads(response_text)
                
                # Convert to ReferenceData objects
                if isinstance(data, list):
                    return [ReferenceData.from_dict(ref) for ref in data]
                else:
                    logger.warning(f"Expected list, got {type(data)}")
                    return []
                    
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {e}")
                logger.error(f"Response: {response[:500]}")
                return []
                
        except Exception as e:
            logger.error(f"RefExtract Error: {e}")
            raise Exception(f"Failed to extract references: {str(e)}")
    
    @staticmethod
    def to_bibtex_entry(ref: ReferenceData) -> str:
        """
        Convert a ReferenceData object to BibTeX string.
        
        Args:
            ref: Reference data object
            
        Returns:
            BibTeX entry string
        """
        entry_type = ref.entry_type.lower() if ref.entry_type else "misc"
        citation_key = ref.citation_key or "unknown"
        
        lines = [f"@{entry_type}{{{citation_key},"]
        
        # Add fields
        field_map = {
            "title": ref.title,
            "author": ref.author,
            "year": ref.year,
            "journal": ref.journal,
            "booktitle": ref.booktitle,
            "volume": ref.volume,
            "number": ref.number,
            "pages": ref.pages,
            "publisher": ref.publisher,
            "doi": ref.doi,
            "url": ref.url,
        }
        
        # Add defined fields
        for field_name, field_value in field_map.items():
            if field_value:
                lines.append(f"  {field_name} = {{{field_value}}},")
        
        # Add extra fields
        for field_name, field_value in ref.extra_fields.items():
            if field_value:
                lines.append(f"  {field_name} = {{{field_value}}},")
        
        # Remove trailing comma from last field
        if len(lines) > 1:
            lines[-1] = lines[-1].rstrip(",")
        
        lines.append("}")
        
        return "\n".join(lines)
    
    @staticmethod
    def to_bibtex_file(refs: List[ReferenceData]) -> str:
        """
        Convert list of references to BibTeX file content.
        
        Args:
            refs: List of ReferenceData objects
            
        Returns:
            Complete BibTeX file as string
        """
        return "\n\n".join(RefExtract.to_bibtex_entry(ref) for ref in refs)
