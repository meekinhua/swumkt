# Survey Definition Language (SDL) Documentation

## Overview

**Survey Definition Language (SDL)** เป็น Domain-Specific Language (DSL) ที่ออกแบบมาสำหรับสร้างและอธิบายแบบสอบถามในรูปแบบ YAML ที่อ่านง่าย เขียนง่าย และสามารถให้ AI สร้างได้อย่างมีประสิทธิภาพ

## Features

✅ **Human-Readable**: ใช้ YAML format ที่อ่านง่าย เข้าใจง่าย  
✅ **AI-Friendly**: LLM สามารถสร้าง SDL ได้ง่ายและถูกต้อง  
✅ **Template Variables**: รองรับ variables เช่น `{brand_name}`, `{product_name}`  
✅ **Validation**: มี built-in validator ตรวจสอบความถูกต้อง  
✅ **Extensible**: เพิ่มประเภทคำถามใหม่ได้ง่ายในอนาคต  
✅ **Type-Safe**: รองรับ data types หลากหลาย (nominal, ordinal, scale, ratio)

---

## Basic SDL Structure

```yaml
survey: "Survey Title"
type: perception  # survey type
description: "Survey description"

demographics:
  collect: true
  auto_fill: true
  fields:
    - birth_sex
    - age_group
    - education

settings:
  allow_multiple_submissions: false
  show_progress_bar: true
  randomize_questions: false
  allow_anonymous: true

sections:
  - name: "Section Name"
    description: "Section description"
    questions:
      - text: "Question text?"
        type: multiple_choice_single
        required: yes
        data_type: nominal
        options:
          - "Option 1"
          - "Option 2"
```

---

## Survey Types

SDL รองรับประเภทแบบสอบถามดังนี้:

- **`market_segmentation`**: การแบ่งส่วนตลาด
- **`perception`**: การรับรู้และทัศนคติ (Brand perception, CSAT, NPS)
- **`competitor`**: การวิเคราะห์คู่แข่ง
- **`behavior`**: พฤติกรรมผู้บริโภค
- **`conjoint`**: Conjoint analysis
- **`custom`**: แบบสอบถามทั่วไป

---

## Question Types

### 1. Multiple Choice (Single Selection)

```yaml
- text: "What is your preferred coffee type?"
  type: multiple_choice_single
  required: yes
  data_type: nominal
  options:
    - "Espresso"
    - "Latte"
    - "Cappuccino"
    - "Americano"
```

### 2. Multiple Choice (Multiple Selections)

```yaml
- text: "Which features do you use? (Select all that apply)"
  type: multiple_choice_multiple
  required: yes
  data_type: nominal
  options:
    - "Mobile App"
    - "Website"
    - "Customer Support"
    - "Loyalty Program"
```

### 3. Rating Scale

```yaml
- text: "How satisfied are you?"
  type: rating_scale
  scale: "1-5"
  labels:
    "1": "Very Dissatisfied"
    "3": "Neutral"
    "5": "Very Satisfied"
  required: yes
  data_type: scale
```

**Scale formats supported:**
- `"1-5"` (5-point scale)
- `"1-10"` (10-point scale)
- `"0-10"` (11-point scale, for NPS)

### 4. Likert Scale

```yaml
- text: "This brand is trustworthy"
  type: likert_scale
  likert: agreement-5
  required: yes
  data_type: scale
```

**Likert types:**
- `agreement-5`: Strongly Disagree → Strongly Agree
- `satisfaction-5`: Very Dissatisfied → Very Satisfied

### 5. Open-Ended

```yaml
- text: "What can we improve?"
  type: open_ended
  required: no
  data_type: nominal
```

---

## Data Types

SDL รองรับ 4 ประเภทข้อมูล:

1. **`nominal`**: ข้อมูลที่ไม่มีลำดับ (เช่น สี, ประเภท)
2. **`ordinal`**: ข้อมูลที่มีลำดับแต่ไม่มีระยะห่างเท่ากัน (เช่น ระดับความพึงพอใจ)
3. **`scale`**: ข้อมูลที่มีลำดับและระยะห่างเท่ากัน (เช่น rating 1-5)
4. **`ratio`**: ข้อมูลที่มี zero point ที่แท้จริง (เช่น อายุ, รายได้)

---

## Template Variables

SDL รองรับการใช้ variables เพื่อทำให้ template ยืดหยุ่นมากขึ้น:

```yaml
survey: "{brand_name} Customer Satisfaction Survey"
description: "Survey for {product_name} users"

sections:
  - name: "Experience"
    questions:
      - text: "How satisfied are you with {product_name}?"
        type: rating_scale
        scale: "1-5"
        required: yes
        data_type: scale
```

**การใช้งาน:**
```python
from survey_dsl import SurveyDSLParser

variables = {
    'brand_name': 'Acme Corp',
    'product_name': 'Super Widget'
}

parser = SurveyDSLParser()
survey = parser.parse(sdl_text, variables=variables)
```

---

## Demographics Configuration

```yaml
demographics:
  collect: true          # เก็บข้อมูลประชากรหรือไม่
  auto_fill: true        # auto-fill จาก user profile หรือไม่
  fields:                # fields ที่ต้องการเก็บ
    - birth_sex
    - gender_identity
    - date_of_birth
    - education
    - occupation
    - marital_status
    - income
```

---

## Settings

```yaml
settings:
  allow_multiple_submissions: false   # อนุญาตตอบหลายครั้งหรือไม่
  show_progress_bar: true            # แสดง progress bar
  randomize_questions: false         # สุ่มลำดับคำถาม
  randomize_options: false           # สุ่มลำดับตัวเลือก
  allow_anonymous: true              # อนุญาตตอบแบบไม่เปิดเผยตัวตน
```

---

## Pre-built Templates

SDL มาพร้อม pre-built templates สำหรับแบบสอบถามทั่วไป:

### 1. Customer Satisfaction

```python
from survey_dsl import SDL_TEMPLATES, SurveyDSLParser

variables = {
    'survey_title': 'Product Satisfaction Survey',
    'product_name': 'Our Product'
}

parser = SurveyDSLParser()
survey = parser.parse(
    SDL_TEMPLATES['customer_satisfaction'], 
    variables=variables
)
```

### 2. Brand Perception

```python
variables = {
    'survey_title': 'Brand Perception Study',
    'brand_name': 'Our Brand',
    'category': 'Coffee Shops'
}

survey = parser.parse(
    SDL_TEMPLATES['brand_perception'],
    variables=variables
)
```

### 3. Market Segmentation

```python
variables = {
    'survey_title': 'Customer Segmentation',
    'category': 'coffee products'
}

survey = parser.parse(
    SDL_TEMPLATES['market_segmentation'],
    variables=variables
)
```

---

## Validation

SDL มี built-in validator ตรวจสอบความถูกต้อง:

```python
from survey_dsl import SurveyDSLValidator

validator = SurveyDSLValidator()
is_valid, errors = validator.validate_survey(survey_data)

if not is_valid:
    for error in errors:
        print(f"Error: {error}")
```

**Validation Rules:**
- Survey ต้องมี title
- ต้องมีอย่างน้อย 1 section
- แต่ละ section ต้องมีอย่างน้อย 1 question
- คำถามต้องมี text
- คำถามที่ไม่ใช่ open-ended ต้องมี options

---

## API Integration

### Endpoint: `/api/surveys/ai-generate`

AI generation endpoint ใช้ SDL เป็น intermediate format:

**Request:**
```json
{
  "description": "Customer satisfaction survey for a coffee shop",
  "survey_type": "perception",
  "num_questions": 8,
  "target_language": "en"
}
```

**Process:**
1. LLM สร้าง SDL (YAML)
2. SDL Parser แปลง YAML → Survey Object
3. Validator ตรวจสอบความถูกต้อง
4. บันทึกลง database

---

## Advanced Options

### Custom Validation Rules

```yaml
- text: "What is your age?"
  type: open_ended
  required: yes
  data_type: ratio
  validation:
    min: 18
    max: 100
    type: integer
```

### Option Values for Data Analysis

```yaml
- text: "How often do you visit?"
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
    - text: "Rarely"
      value: "1"
```

---

## Best Practices

### 1. เลือก Question Type ให้เหมาะสม

- ใช้ `rating_scale` สำหรับคำถามที่ต้องการ numeric feedback
- ใช้ `likert_scale` สำหรับคำถามเกี่ยวกับ agreement หรือ satisfaction
- ใช้ `open_ended` สำหรับคำถามที่ต้องการคำตอบแบบ qualitative

### 2. เลือก Data Type ให้ถูกต้อง

- `nominal`: ไม่มีลำดับ (เช่น สี, ประเภท)
- `ordinal`: มีลำดับ (เช่น ความพึงพอใจ)
- `scale`: มีระยะห่างเท่ากัน (เช่น rating)

### 3. ใช้ Template Variables

ทำให้ template สามารถนำไปใช้ซ้ำได้ในหลายกรณี

### 4. Organize Sections

แบ่ง survey เป็น sections ที่ชัดเจน ทำให้ผู้ตอบเข้าใจง่ายขึ้น

---

## Future Extensions

SDL ถูกออกแบบให้สามารถขยายได้:

### เพิ่ม Question Type ใหม่

```python
class SurveyDSLParser:
    QUESTION_TYPES = [
        'multiple_choice_single',
        'multiple_choice_multiple',
        'rating_scale',
        'likert_scale',
        'open_ended',
        'ranking',        # New: Ranking questions
        'matrix',         # New: Matrix/Grid questions
        'slider'          # New: Slider questions
    ]
```

### เพิ่ม Survey Type ใหม่

```python
SURVEY_TYPES = [
    'market_segmentation',
    'perception',
    'competitor',
    'behavior',
    'conjoint',
    'custom',
    'usability_testing'  # New type
]
```

---

## Examples

### Complete Example: Coffee Shop Survey

```yaml
survey: "Coffee Shop Customer Satisfaction Survey"
type: perception
description: "Help us improve your coffee experience"

demographics:
  collect: true
  auto_fill: true
  fields:
    - birth_sex
    - age_group

sections:
  - name: "Visit Frequency"
    description: "Tell us about your visits"
    questions:
      - text: "How often do you visit our coffee shop?"
        type: multiple_choice_single
        required: yes
        data_type: ordinal
        options:
          - text: "Daily"
            value: "5"
          - text: "2-3 times per week"
            value: "4"
          - text: "Once a week"
            value: "3"
          - text: "Once a month"
            value: "2"
          - text: "Rarely"
            value: "1"
  
  - name: "Satisfaction"
    questions:
      - text: "How satisfied are you with our coffee quality?"
        type: rating_scale
        scale: "1-5"
        labels:
          "1": "Very Poor"
          "5": "Excellent"
        required: yes
        data_type: scale
      
      - text: "How satisfied are you with our service?"
        type: rating_scale
        scale: "1-5"
        labels:
          "1": "Very Poor"
          "5": "Excellent"
        required: yes
        data_type: scale
      
      - text: "Would you recommend us to friends?"
        type: rating_scale
        scale: "0-10"
        labels:
          "0": "Not at all likely"
          "10": "Extremely likely"
        required: yes
        data_type: scale
  
  - name: "Feedback"
    questions:
      - text: "What do you like most about our coffee shop?"
        type: open_ended
        required: no
        data_type: nominal
      
      - text: "What can we improve?"
        type: open_ended
        required: no
        data_type: nominal
```

---

## Conclusion

Survey Definition Language (SDL) ทำให้การสร้างแบบสอบถามเป็นเรื่องง่าย ยืดหยุ่น และมีประสิทธิภาพ ทั้งสำหรับ human developers และ AI systems ครับ!
