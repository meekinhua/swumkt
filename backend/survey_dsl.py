"""
Survey Definition Language (SDL) - YAML-based DSL for Survey Creation
Supports:
- Template variables: {brand_name}, {product_name}, etc.
- Validation rules
- Multiple question types
- Flexible schema for future extensions
"""

import yaml
import re
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
import uuid


class SurveyDSLParser:
    """Parser for Survey Definition Language (SDL)"""
    
    QUESTION_TYPES = [
        'multiple_choice_single',
        'multiple_choice_multiple', 
        'rating_scale',
        'likert_scale',
        'open_ended',
        'ranking',
        'matrix',
        'slider'
    ]
    
    DATA_TYPES = ['nominal', 'ordinal', 'scale', 'ratio']
    
    SURVEY_TYPES = [
        'market_segmentation',
        'perception',
        'competitor',
        'behavior',
        'conjoint',
        'custom'
    ]
    
    def __init__(self):
        self.variables = {}
    
    def parse(self, sdl_text: str, variables: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Parse SDL text into survey object
        
        Args:
            sdl_text: YAML-formatted SDL text
            variables: Optional dict of template variables to replace
            
        Returns:
            Survey object ready for database insertion
        """
        # Store variables for replacement
        self.variables = variables or {}
        
        # Replace template variables
        processed_text = self._replace_variables(sdl_text)
        
        # Parse YAML
        try:
            sdl_data = yaml.safe_load(processed_text)
        except yaml.YAMLError as e:
            raise ValueError(f"Invalid SDL YAML syntax: {e}")
        
        # Validate and transform to survey object
        survey = self._transform_to_survey(sdl_data)
        
        return survey
    
    def _replace_variables(self, text: str) -> str:
        """Replace template variables like {brand_name} with actual values"""
        def replacer(match):
            var_name = match.group(1)
            return self.variables.get(var_name, match.group(0))
        
        return re.sub(r'\{(\w+)\}', replacer, text)
    
    def _transform_to_survey(self, sdl_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform SDL data to survey object"""
        
        # Validate required fields
        if 'survey' not in sdl_data:
            raise ValueError("Missing required field: 'survey' (survey title)")
        
        # Build survey object
        survey = {
            'id': f"survey_{uuid.uuid4().hex[:12]}",
            'title': sdl_data['survey'],
            'description': sdl_data.get('description', ''),
            'survey_type': self._validate_survey_type(sdl_data.get('type', 'custom')),
            'status': 'draft',
            'respondent_auth_mode': sdl_data.get('auth_mode', 'anonymous'),
            'demographics_config': self._parse_demographics(sdl_data.get('demographics', {})),
            'sections': self._parse_sections(sdl_data.get('sections', [])),
            'settings': self._parse_settings(sdl_data.get('settings', {})),
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        
        return survey
    
    def _validate_survey_type(self, survey_type: str) -> str:
        """Validate survey type"""
        # Clean enum prefix if present (e.g., "SurveyType.PERCEPTION" -> "perception")
        if '.' in survey_type:
            survey_type = survey_type.split('.')[-1].lower()
        
        if survey_type not in self.SURVEY_TYPES:
            raise ValueError(f"Invalid survey type: {survey_type}. Must be one of {self.SURVEY_TYPES}")
        return survey_type
    
    def _parse_demographics(self, demo_config: Dict[str, Any]) -> Dict[str, Any]:
        """Parse demographics configuration"""
        return {
            'collect': demo_config.get('collect', False),
            'auto_fill': demo_config.get('auto_fill', False),
            'fields': demo_config.get('fields', [])
        }
    
    def _parse_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Parse survey settings"""
        return {
            'allow_multiple_submissions': settings.get('allow_multiple_submissions', False),
            'show_progress_bar': settings.get('show_progress_bar', True),
            'randomize_questions': settings.get('randomize_questions', False),
            'randomize_options': settings.get('randomize_options', False),
            'allow_anonymous': settings.get('allow_anonymous', True)
        }
    
    def _parse_sections(self, sections_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Parse survey sections"""
        sections = []
        
        for idx, section_data in enumerate(sections_data):
            section = {
                'id': f"section_{uuid.uuid4().hex[:8]}",
                'title': section_data.get('name', f'Section {idx + 1}'),
                'description': section_data.get('description', ''),
                'order': idx,
                'questions': self._parse_questions(section_data.get('questions', []))
            }
            sections.append(section)
        
        return sections
    
    def _parse_questions(self, questions_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Parse questions"""
        questions = []
        
        for idx, q_data in enumerate(questions_data):
            question = {
                'id': f"q_{uuid.uuid4().hex[:8]}",
                'type': self._validate_question_type(q_data.get('type', 'multiple_choice_single')),
                'text': q_data['text'],
                'description': q_data.get('description', ''),
                'required': q_data.get('required', True),
                'data_type': self._validate_data_type(q_data.get('data_type', 'nominal')),
                'order': idx,
                'options': self._parse_options(q_data)
            }
            
            # Add validation rules if specified
            if 'validation' in q_data:
                question['validation'] = q_data['validation']
            
            questions.append(question)
        
        return questions
    
    def _validate_question_type(self, q_type: str) -> str:
        """Validate question type"""
        if q_type not in self.QUESTION_TYPES:
            raise ValueError(f"Invalid question type: {q_type}. Must be one of {self.QUESTION_TYPES}")
        return q_type
    
    def _validate_data_type(self, data_type: str) -> str:
        """Validate data type"""
        if data_type not in self.DATA_TYPES:
            raise ValueError(f"Invalid data type: {data_type}. Must be one of {self.DATA_TYPES}")
        return data_type
    
    def _parse_options(self, q_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse question options based on question type"""
        q_type = q_data.get('type', 'multiple_choice_single')
        
        # Open-ended questions have no options
        if q_type == 'open_ended':
            return []
        
        options = []
        
        # Handle different option formats
        if 'options' in q_data:
            # Explicit options list
            for opt in q_data['options']:
                if isinstance(opt, str):
                    # Simple string option
                    option = {
                        'id': f"opt_{uuid.uuid4().hex[:8]}",
                        'text': opt,
                        'value': opt
                    }
                elif isinstance(opt, dict):
                    # Detailed option object
                    option = {
                        'id': f"opt_{uuid.uuid4().hex[:8]}",
                        'text': opt.get('text', opt.get('label', '')),
                        'value': str(opt.get('value', opt.get('text', '')))
                    }
                else:
                    continue
                options.append(option)
        
        elif 'scale' in q_data:
            # Rating scale (e.g., "1-5" or "1-10")
            scale_str = q_data['scale']
            if isinstance(scale_str, str) and '-' in scale_str:
                start, end = map(int, scale_str.split('-'))
                labels = q_data.get('labels', {})
                
                for i in range(start, end + 1):
                    label = labels.get(str(i), str(i))
                    option = {
                        'id': f"opt_{uuid.uuid4().hex[:8]}",
                        'text': label,
                        'value': str(i)
                    }
                    options.append(option)
        
        elif 'likert' in q_data:
            # Likert scale
            likert_type = q_data['likert']
            if likert_type == 'agreement-5':
                likert_options = [
                    'Strongly Disagree',
                    'Disagree', 
                    'Neutral',
                    'Agree',
                    'Strongly Agree'
                ]
            elif likert_type == 'satisfaction-5':
                likert_options = [
                    'Very Dissatisfied',
                    'Dissatisfied',
                    'Neutral', 
                    'Satisfied',
                    'Very Satisfied'
                ]
            else:
                likert_options = []
            
            for idx, text in enumerate(likert_options, 1):
                option = {
                    'id': f"opt_{uuid.uuid4().hex[:8]}",
                    'text': text,
                    'value': str(idx)
                }
                options.append(option)
        
        return options


class SurveyDSLValidator:
    """Validator for SDL with validation rules"""
    
    @staticmethod
    def validate_survey(survey: Dict[str, Any]) -> tuple[bool, List[str]]:
        """
        Validate survey object
        
        Returns:
            (is_valid, list_of_errors)
        """
        errors = []
        
        # Required fields
        if not survey.get('title'):
            errors.append("Survey title is required")
        
        if not survey.get('sections') or len(survey['sections']) == 0:
            errors.append("Survey must have at least one section")
        
        # Validate sections
        for idx, section in enumerate(survey.get('sections', [])):
            if not section.get('questions') or len(section['questions']) == 0:
                errors.append(f"Section {idx + 1} must have at least one question")
            
            # Validate questions
            for q_idx, question in enumerate(section.get('questions', [])):
                if not question.get('text'):
                    errors.append(f"Question {q_idx + 1} in section {idx + 1} must have text")
                
                # Questions requiring options
                if question.get('type') not in ['open_ended'] and not question.get('options'):
                    errors.append(f"Question '{question.get('text', 'unnamed')}' requires options")
        
        return len(errors) == 0, errors


# Example SDL Templates for different survey types
SDL_TEMPLATES = {
    'customer_satisfaction': '''
survey: "{survey_title}"
type: perception
description: Measure customer satisfaction and feedback

demographics:
  collect: true
  auto_fill: true
  fields:
    - birth_sex
    - age_group
    - education

sections:
  - name: Overall Satisfaction
    description: Rate your overall experience
    questions:
      - text: "How satisfied are you with {product_name}?"
        type: rating_scale
        scale: "1-5"
        labels:
          "1": "Very Dissatisfied"
          "5": "Very Satisfied"
        required: yes
        data_type: scale
      
      - text: "How likely are you to recommend {product_name} to others?"
        type: rating_scale
        scale: "0-10"
        labels:
          "0": "Not at all likely"
          "10": "Extremely likely"
        required: yes
        data_type: scale
        
  - name: Detailed Feedback
    questions:
      - text: "What do you like most about {product_name}?"
        type: open_ended
        required: no
        data_type: nominal
      
      - text: "What can we improve?"
        type: open_ended
        required: no
        data_type: nominal
''',

    'brand_perception': '''
survey: "{survey_title}"
type: perception
description: Understand brand perception and awareness

sections:
  - name: Brand Awareness
    questions:
      - text: "When you think of {category}, which brands come to mind?"
        type: open_ended
        required: yes
        data_type: nominal
        description: "List all brands you can think of"
      
      - text: "Which of these brands have you heard of?"
        type: multiple_choice_multiple
        required: yes
        data_type: nominal
        options:
          - "{brand_name}"
          - "Competitor A"
          - "Competitor B"
          - "Competitor C"
  
  - name: Brand Attributes
    questions:
      - text: "{brand_name} represents high quality"
        type: likert_scale
        likert: agreement-5
        required: yes
        data_type: scale
      
      - text: "{brand_name} is innovative"
        type: likert_scale
        likert: agreement-5
        required: yes
        data_type: scale
''',

    'market_segmentation': '''
survey: "{survey_title}"
type: market_segmentation
description: Segment customers by demographics, behavior, and preferences

demographics:
  collect: true
  auto_fill: true
  fields:
    - birth_sex
    - date_of_birth
    - education
    - occupation
    - income

sections:
  - name: Purchase Behavior
    questions:
      - text: "How often do you purchase {category}?"
        type: multiple_choice_single
        required: yes
        data_type: ordinal
        options:
          - text: "Daily"
            value: "5"
          - text: "Weekly"
            value: "4"
          - text: "Monthly"
            value: "3"
          - text: "Quarterly"
            value: "2"
          - text: "Rarely"
            value: "1"
      
      - text: "How much do you typically spend per purchase?"
        type: multiple_choice_single
        required: yes
        data_type: ordinal
        options:
          - text: "Less than 500 THB"
            value: "1"
          - text: "500-1,000 THB"
            value: "2"
          - text: "1,001-2,500 THB"
            value: "3"
          - text: "2,501-5,000 THB"
            value: "4"
          - text: "More than 5,000 THB"
            value: "5"
  
  - name: Lifestyle & Values
    questions:
      - text: "Which lifestyle categories describe you? (Select all that apply)"
        type: multiple_choice_multiple
        required: yes
        data_type: nominal
        options:
          - "Health & Fitness Enthusiast"
          - "Tech-Savvy"
          - "Environmentally Conscious"
          - "Budget Conscious"
          - "Quality Seeker"
          - "Convenience Oriented"
'''
}
