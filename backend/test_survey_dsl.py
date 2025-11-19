"""
Test script for Survey DSL Parser
"""

from survey_dsl import SurveyDSLParser, SurveyDSLValidator, SDL_TEMPLATES
import json


def test_basic_sdl():
    """Test basic SDL parsing"""
    print("=" * 60)
    print("TEST 1: Basic SDL Parsing")
    print("=" * 60)
    
    sdl_text = '''
survey: "Customer Feedback Survey"
type: custom
description: Quick customer feedback survey

sections:
  - name: Satisfaction
    questions:
      - text: "How satisfied are you with our service?"
        type: rating_scale
        scale: "1-5"
        required: yes
        data_type: scale
      
      - text: "Would you recommend us to others?"
        type: multiple_choice_single
        required: yes
        data_type: nominal
        options:
          - "Definitely yes"
          - "Probably yes"
          - "Not sure"
          - "Probably no"
          - "Definitely no"
'''
    
    parser = SurveyDSLParser()
    survey = parser.parse(sdl_text)
    
    print(f"✅ Survey Title: {survey['title']}")
    print(f"✅ Survey Type: {survey['survey_type']}")
    print(f"✅ Number of Sections: {len(survey['sections'])}")
    print(f"✅ Number of Questions: {sum(len(s['questions']) for s in survey['sections'])}")
    
    # Validate
    validator = SurveyDSLValidator()
    is_valid, errors = validator.validate_survey(survey)
    
    if is_valid:
        print("✅ Validation: PASSED")
    else:
        print("❌ Validation: FAILED")
        for error in errors:
            print(f"   - {error}")
    
    print("\n")
    return survey


def test_template_variables():
    """Test template variable replacement"""
    print("=" * 60)
    print("TEST 2: Template Variables")
    print("=" * 60)
    
    sdl_text = '''
survey: "{brand_name} Customer Survey"
type: perception
description: Survey for {product_name} users

sections:
  - name: Experience
    questions:
      - text: "How would you rate {product_name}?"
        type: rating_scale
        scale: "1-5"
        required: yes
        data_type: scale
      
      - text: "What do you like about {product_name}?"
        type: open_ended
        required: no
        data_type: nominal
'''
    
    variables = {
        'brand_name': 'Acme Corp',
        'product_name': 'Super Widget Pro'
    }
    
    parser = SurveyDSLParser()
    survey = parser.parse(sdl_text, variables=variables)
    
    print(f"✅ Survey Title: {survey['title']}")
    print(f"✅ Description: {survey['description']}")
    print(f"✅ First Question: {survey['sections'][0]['questions'][0]['text']}")
    print(f"✅ Second Question: {survey['sections'][0]['questions'][1]['text']}")
    print("\n")
    return survey


def test_likert_scale():
    """Test Likert scale parsing"""
    print("=" * 60)
    print("TEST 3: Likert Scale")
    print("=" * 60)
    
    sdl_text = '''
survey: "Brand Perception Survey"
type: perception

sections:
  - name: Brand Attributes
    questions:
      - text: "This brand is trustworthy"
        type: likert_scale
        likert: agreement-5
        required: yes
        data_type: scale
      
      - text: "I am satisfied with this brand"
        type: likert_scale
        likert: satisfaction-5
        required: yes
        data_type: scale
'''
    
    parser = SurveyDSLParser()
    survey = parser.parse(sdl_text)
    
    q1 = survey['sections'][0]['questions'][0]
    q2 = survey['sections'][0]['questions'][1]
    
    print(f"✅ Q1: {q1['text']}")
    print(f"   Options: {[opt['text'] for opt in q1['options']]}")
    
    print(f"✅ Q2: {q2['text']}")
    print(f"   Options: {[opt['text'] for opt in q2['options']]}")
    print("\n")
    return survey


def test_template_customer_satisfaction():
    """Test pre-built customer satisfaction template"""
    print("=" * 60)
    print("TEST 4: Customer Satisfaction Template")
    print("=" * 60)
    
    variables = {
        'survey_title': 'Acme Product Satisfaction Survey',
        'product_name': 'Acme Widget'
    }
    
    parser = SurveyDSLParser()
    survey = parser.parse(SDL_TEMPLATES['customer_satisfaction'], variables=variables)
    
    print(f"✅ Survey Title: {survey['title']}")
    print(f"✅ Survey Type: {survey['survey_type']}")
    print(f"✅ Demographics Collect: {survey['demographics_config']['collect']}")
    print(f"✅ Number of Sections: {len(survey['sections'])}")
    
    for idx, section in enumerate(survey['sections'], 1):
        print(f"\n   Section {idx}: {section['title']}")
        for q_idx, question in enumerate(section['questions'], 1):
            print(f"      Q{q_idx}: {question['text']}")
            print(f"           Type: {question['type']}, Options: {len(question['options'])}")
    
    print("\n")
    return survey


def test_validation_errors():
    """Test validation with errors"""
    print("=" * 60)
    print("TEST 5: Validation Errors")
    print("=" * 60)
    
    # Survey with missing required fields
    invalid_survey = {
        'title': '',  # Empty title
        'sections': [
            {
                'title': 'Section 1',
                'questions': []  # No questions
            }
        ]
    }
    
    validator = SurveyDSLValidator()
    is_valid, errors = validator.validate_survey(invalid_survey)
    
    print(f"✅ Is Valid: {is_valid}")
    print(f"✅ Errors Found: {len(errors)}")
    for error in errors:
        print(f"   - {error}")
    print("\n")


def test_all_question_types():
    """Test all supported question types"""
    print("=" * 60)
    print("TEST 6: All Question Types")
    print("=" * 60)
    
    sdl_text = '''
survey: "All Question Types Demo"
type: custom

sections:
  - name: Various Question Types
    questions:
      - text: "Single choice question"
        type: multiple_choice_single
        required: yes
        data_type: nominal
        options:
          - "Option A"
          - "Option B"
          - "Option C"
      
      - text: "Multiple choice question"
        type: multiple_choice_multiple
        required: yes
        data_type: nominal
        options:
          - "Choice 1"
          - "Choice 2"
          - "Choice 3"
      
      - text: "Rating scale question"
        type: rating_scale
        scale: "1-10"
        required: yes
        data_type: scale
      
      - text: "Likert scale question"
        type: likert_scale
        likert: agreement-5
        required: yes
        data_type: scale
      
      - text: "Open-ended question"
        type: open_ended
        required: no
        data_type: nominal
'''
    
    parser = SurveyDSLParser()
    survey = parser.parse(sdl_text)
    
    for idx, question in enumerate(survey['sections'][0]['questions'], 1):
        print(f"✅ Q{idx}: {question['type']}")
        print(f"   Text: {question['text']}")
        print(f"   Options count: {len(question['options'])}")
    
    print("\n")
    return survey


if __name__ == "__main__":
    print("\n🚀 Testing Survey DSL Parser\n")
    
    try:
        # Run all tests
        test_basic_sdl()
        test_template_variables()
        test_likert_scale()
        test_template_customer_satisfaction()
        test_validation_errors()
        test_all_question_types()
        
        print("=" * 60)
        print("✅ ALL TESTS COMPLETED SUCCESSFULLY")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
