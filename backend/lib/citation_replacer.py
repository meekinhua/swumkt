"""
Citation Replacer - Replace in-text citations with BibTeX keys

This module detects in-text citations and replaces them with corresponding
BibTeX citation keys for Pandoc processing.

Example:
    Input:  "Previous research (Smith & Jones, 2020) shows..."
    Output: "Previous research [@Smith2020] shows..."
"""

import re
import logging
from typing import List, Dict, Tuple, Optional
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)


class CitationReplacer:
    """Replace in-text citations with BibTeX keys using AI."""
    
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.api_key = api_key
        self.model = model
    
    def extract_citations_from_text(self, text: str) -> List[Tuple[str, int, int]]:
        """
        Extract all citation patterns from text.
        
        Returns:
            List of (citation_text, start_pos, end_pos)
        """
        citations = []
        
        # Pattern 1: Parenthetical (Author, Year) or (Author & Author, Year)
        pattern1 = r'\([A-Z][a-z]+(?:\s+(?:&|and|et al\.)\s+[A-Z][a-z]+)?,?\s+\d{4}[a-z]?\)'
        for match in re.finditer(pattern1, text):
            citations.append((match.group(), match.start(), match.end()))
        
        # Pattern 2: Narrative Author (Year) or Author et al. (Year)
        pattern2 = r'[A-Z][a-z]+(?:\s+et al\.)?\s+\(\d{4}[a-z]?\)'
        for match in re.finditer(pattern2, text):
            citations.append((match.group(), match.start(), match.end()))
        
        # Pattern 3: Numbered [1] or [1,2,3]
        pattern3 = r'\[\d+(?:,\s*\d+)*\]'
        for match in re.finditer(pattern3, text):
            citations.append((match.group(), match.start(), match.end()))
        
        # Pattern 4: Multiple citations (Author1, Year; Author2, Year)
        pattern4 = r'\([A-Z][a-z]+(?:\s+et al\.)?,?\s+\d{4}[a-z]?(?:;\s*[A-Z][a-z]+(?:\s+et al\.)?,?\s+\d{4}[a-z]?)+\)'
        for match in re.finditer(pattern4, text):
            citations.append((match.group(), match.start(), match.end()))
        
        # Remove duplicates and sort by position
        citations = list(set(citations))
        citations.sort(key=lambda x: x[1])
        
        return citations
    
    async def match_citation_to_bibtex(
        self, 
        citation_text: str, 
        bibtex_entries: List[Dict[str, str]]
    ) -> Optional[str]:
        """
        Use AI to match a citation to the most appropriate BibTeX entry.
        
        Args:
            citation_text: The citation text (e.g., "(Smith, 2020)")
            bibtex_entries: List of BibTeX entries with citation_key, author, year
            
        Returns:
            Citation key or None if no match
        """
        if not bibtex_entries:
            return None
        
        # Create a simplified list for AI
        entries_summary = []
        for entry in bibtex_entries:
            entries_summary.append({
                "key": entry.get("citation_key", ""),
                "author": entry.get("author", ""),
                "year": entry.get("year", ""),
                "title": entry.get("title", "")[:60]  # Truncate title
            })
        
        prompt = f"""Task: Match an in-text citation to a BibTeX entry.

Citation: {citation_text}

Available BibTeX entries:
{entries_summary}

Instructions:
1. Find the entry that best matches the citation
2. Match by author name(s) and year
3. Return ONLY the citation key, nothing else
4. If no match found, return "NONE"

Output format: Just the key (e.g., "Smith2020" or "NONE")"""
        
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"citation-match-{id(self)}"
            ).with_model("openai", self.model)
            
            response = await chat.send_message(UserMessage(text=prompt))
            
            if response:
                key = response.strip().strip('"\'')
                if key != "NONE" and key in [e.get("citation_key") for e in bibtex_entries]:
                    return key
            
            return None
            
        except Exception as e:
            logger.error(f"AI matching error: {e}")
            # Fallback to simple matching
            return self._simple_match(citation_text, bibtex_entries)
    
    def _simple_match(
        self, 
        citation_text: str, 
        bibtex_entries: List[Dict[str, str]]
    ) -> Optional[str]:
        """Fallback: Simple pattern matching."""
        # Extract year from citation
        year_match = re.search(r'\d{4}', citation_text)
        if not year_match:
            return None
        
        year = year_match.group()
        
        # Extract author surname
        author_match = re.search(r'([A-Z][a-z]+)', citation_text)
        if not author_match:
            return None
        
        author = author_match.group().lower()
        
        # Find matching entry
        for entry in bibtex_entries:
            entry_year = entry.get("year", "")
            entry_author = entry.get("author", "").lower()
            
            if year in entry_year and author in entry_author:
                return entry.get("citation_key")
        
        return None
    
    async def replace_citations_in_text(
        self, 
        text: str, 
        bibtex_entries: List[Dict[str, str]],
        progress_callback: Optional[callable] = None
    ) -> Tuple[str, int, List[Dict]]:
        """
        Replace all citations in text with BibTeX keys.
        
        Returns:
            (modified_text, replacement_count, replacement_log)
        """
        # Extract citations
        citations = self.extract_citations_from_text(text)
        total_citations = len(citations)
        
        logger.info(f"Found {total_citations} citations to replace")
        
        if progress_callback:
            await progress_callback(0, total_citations, "เริ่มต้นแทนที่ citations...")
        
        # Process from end to start to maintain positions
        citations.reverse()
        
        replacements = []
        replaced_count = 0
        
        for i, (citation_text, start, end) in enumerate(citations):
            if progress_callback:
                await progress_callback(
                    i + 1, 
                    total_citations, 
                    f"กำลังประมวลผล citation {i+1}/{total_citations}..."
                )
            
            # Match to BibTeX entry
            citation_key = await self.match_citation_to_bibtex(
                citation_text, 
                bibtex_entries
            )
            
            if citation_key:
                # Replace with Pandoc citation format [@key]
                replacement = f"[@{citation_key}]"
                text = text[:start] + replacement + text[end:]
                
                replacements.append({
                    "original": citation_text,
                    "replaced_with": replacement,
                    "position": start
                })
                replaced_count += 1
                
                logger.info(f"Replaced '{citation_text}' → '{replacement}'")
            else:
                logger.warning(f"No match found for citation: {citation_text}")
                replacements.append({
                    "original": citation_text,
                    "replaced_with": None,
                    "position": start
                })
        
        if progress_callback:
            await progress_callback(
                total_citations, 
                total_citations, 
                f"เสร็จสิ้น! แทนที่ {replaced_count}/{total_citations} citations"
            )
        
        logger.info(f"Replaced {replaced_count}/{total_citations} citations")
        
        return text, replaced_count, replacements
    
    def parse_bibtex_entries(self, bibtex_content: str) -> List[Dict[str, str]]:
        """Parse BibTeX content into list of entry dictionaries."""
        entries = []
        
        # Split by @
        raw_entries = re.split(r'@\w+\{', bibtex_content)
        
        for raw_entry in raw_entries[1:]:  # Skip first empty split
            entry = {}
            
            # Extract citation key
            key_match = re.match(r'([^,\s]+)', raw_entry)
            if key_match:
                entry["citation_key"] = key_match.group(1)
            
            # Extract fields
            author_match = re.search(r'author\s*=\s*\{([^}]+)\}', raw_entry, re.IGNORECASE)
            if author_match:
                entry["author"] = author_match.group(1)
            
            year_match = re.search(r'year\s*=\s*\{([^}]+)\}', raw_entry, re.IGNORECASE)
            if year_match:
                entry["year"] = year_match.group(1)
            
            title_match = re.search(r'title\s*=\s*\{([^}]+)\}', raw_entry, re.IGNORECASE)
            if title_match:
                entry["title"] = title_match.group(1)
            
            if entry.get("citation_key"):
                entries.append(entry)
        
        return entries
