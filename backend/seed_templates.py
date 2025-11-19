"""
Seed pre-built survey templates to database
Run: python seed_templates.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import os

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/swumkt')

# Pre-built templates
TEMPLATES = [
    {
        "id": "template_market_segmentation_1",
        "name": "Customer Segmentation Survey",
        "description": "Comprehensive survey to segment customers based on demographics, behavior, and preferences",
        "survey_type": "market_segmentation",
        "is_public": True,
        "usage_count": 0,
        "tags": ["segmentation", "demographics", "behavior", "psychographics"],
        "created_by": "system",
        "sections": [
            {
                "id": "sec_demo",
                "title": "Demographics",
                "description": "Basic demographic information",
                "order": 0,
                "questions": [
                    {
                        "id": "q_age",
                        "type": "multiple_choice_single",
                        "text": "What is your age group?",
                        "required": True,
                        "data_type": "ordinal",
                        "options": [
                            {"id": "age_1", "text": "18-24", "value": "1"},
                            {"id": "age_2", "text": "25-34", "value": "2"},
                            {"id": "age_3", "text": "35-44", "value": "3"},
                            {"id": "age_4", "text": "45-54", "value": "4"},
                            {"id": "age_5", "text": "55-64", "value": "5"},
                            {"id": "age_6", "text": "65+", "value": "6"}
                        ],
                        "order": 0
                    },
                    {
                        "id": "q_income",
                        "type": "multiple_choice_single",
                        "text": "What is your annual household income?",
                        "required": True,
                        "data_type": "ordinal",
                        "options": [
                            {"id": "inc_1", "text": "Less than 300,000 THB", "value": "1"},
                            {"id": "inc_2", "text": "300,001-600,000 THB", "value": "2"},
                            {"id": "inc_3", "text": "600,001-1,000,000 THB", "value": "3"},
                            {"id": "inc_4", "text": "1,000,001-2,000,000 THB", "value": "4"},
                            {"id": "inc_5", "text": "More than 2,000,000 THB", "value": "5"}
                        ],
                        "order": 1
                    }
                ]
            },
            {
                "id": "sec_behavior",
                "title": "Purchase Behavior",
                "description": "Understanding your purchase patterns",
                "order": 1,
                "questions": [
                    {
                        "id": "q_frequency",
                        "type": "multiple_choice_single",
                        "text": "How often do you purchase our product/service?",
                        "required": True,
                        "data_type": "ordinal",
                        "options": [
                            {"id": "freq_1", "text": "Daily", "value": "5"},
                            {"id": "freq_2", "text": "Weekly", "value": "4"},
                            {"id": "freq_3", "text": "Monthly", "value": "3"},
                            {"id": "freq_4", "text": "Quarterly", "value": "2"},
                            {"id": "freq_5", "text": "Rarely", "value": "1"}
                        ],
                        "order": 0
                    },
                    {
                        "id": "q_spending",
                        "type": "multiple_choice_single",
                        "text": "How much do you typically spend per purchase?",
                        "required": True,
                        "data_type": "ordinal",
                        "options": [
                            {"id": "spend_1", "text": "Less than 500 THB", "value": "1"},
                            {"id": "spend_2", "text": "500-1,000 THB", "value": "2"},
                            {"id": "spend_3", "text": "1,001-2,500 THB", "value": "3"},
                            {"id": "spend_4", "text": "2,501-5,000 THB", "value": "4"},
                            {"id": "spend_5", "text": "More than 5,000 THB", "value": "5"}
                        ],
                        "order": 1
                    }
                ]
            },
            {
                "id": "sec_psycho",
                "title": "Lifestyle & Preferences",
                "description": "Your lifestyle and values",
                "order": 2,
                "questions": [
                    {
                        "id": "q_lifestyle",
                        "type": "multiple_choice_multiple",
                        "text": "Which lifestyle categories describe you best? (Select all that apply)",
                        "required": True,
                        "data_type": "nominal",
                        "options": [
                            {"id": "life_1", "text": "Health & Fitness Enthusiast", "value": "health"},
                            {"id": "life_2", "text": "Tech-Savvy", "value": "tech"},
                            {"id": "life_3", "text": "Environmentally Conscious", "value": "eco"},
                            {"id": "life_4", "text": "Budget Conscious", "value": "budget"},
                            {"id": "life_5", "text": "Quality Seeker", "value": "quality"},
                            {"id": "life_6", "text": "Convenience Oriented", "value": "convenience"}
                        ],
                        "order": 0
                    }
                ]
            }
        ]
    },
    {
        "id": "template_satisfaction_1",
        "name": "Customer Satisfaction Survey (CSAT + NPS)",
        "description": "Measure customer satisfaction and Net Promoter Score with comprehensive feedback",
        "survey_type": "perception",
        "is_public": True,
        "usage_count": 0,
        "tags": ["satisfaction", "nps", "csat", "feedback"],
        "created_by": "system",
        "sections": [
            {
                "id": "sec_csat",
                "title": "Overall Satisfaction",
                "description": "Rate your overall experience",
                "order": 0,
                "questions": [
                    {
                        "id": "q_overall",
                        "type": "rating_scale",
                        "text": "How satisfied are you with our product/service overall?",
                        "required": True,
                        "data_type": "scale",
                        "options": [
                            {"id": "sat_1", "text": "1 - Very Dissatisfied", "value": "1"},
                            {"id": "sat_2", "text": "2", "value": "2"},
                            {"id": "sat_3", "text": "3", "value": "3"},
                            {"id": "sat_4", "text": "4", "value": "4"},
                            {"id": "sat_5", "text": "5 - Very Satisfied", "value": "5"}
                        ],
                        "order": 0
                    },
                    {
                        "id": "q_nps",
                        "type": "rating_scale",
                        "text": "How likely are you to recommend our product/service to friends or colleagues?",
                        "description": "0 = Not at all likely, 10 = Extremely likely",
                        "required": True,
                        "data_type": "scale",
                        "options": [
                            {"id": "nps_0", "text": "0", "value": "0"},
                            {"id": "nps_1", "text": "1", "value": "1"},
                            {"id": "nps_2", "text": "2", "value": "2"},
                            {"id": "nps_3", "text": "3", "value": "3"},
                            {"id": "nps_4", "text": "4", "value": "4"},
                            {"id": "nps_5", "text": "5", "value": "5"},
                            {"id": "nps_6", "text": "6", "value": "6"},
                            {"id": "nps_7", "text": "7", "value": "7"},
                            {"id": "nps_8", "text": "8", "value": "8"},
                            {"id": "nps_9", "text": "9", "value": "9"},
                            {"id": "nps_10", "text": "10", "value": "10"}
                        ],
                        "order": 1
                    }
                ]
            },
            {
                "id": "sec_attributes",
                "title": "Product/Service Attributes",
                "description": "Rate specific aspects of our offering",
                "order": 1,
                "questions": [
                    {
                        "id": "q_quality",
                        "type": "rating_scale",
                        "text": "How would you rate the quality?",
                        "required": True,
                        "data_type": "scale",
                        "options": [
                            {"id": "q_1", "text": "1 - Poor", "value": "1"},
                            {"id": "q_2", "text": "2", "value": "2"},
                            {"id": "q_3", "text": "3", "value": "3"},
                            {"id": "q_4", "text": "4", "value": "4"},
                            {"id": "q_5", "text": "5 - Excellent", "value": "5"}
                        ],
                        "order": 0
                    },
                    {
                        "id": "q_value",
                        "type": "rating_scale",
                        "text": "How would you rate the value for money?",
                        "required": True,
                        "data_type": "scale",
                        "options": [
                            {"id": "v_1", "text": "1 - Poor", "value": "1"},
                            {"id": "v_2", "text": "2", "value": "2"},
                            {"id": "v_3", "text": "3", "value": "3"},
                            {"id": "v_4", "text": "4", "value": "4"},
                            {"id": "v_5", "text": "5 - Excellent", "value": "5"}
                        ],
                        "order": 1
                    },
                    {
                        "id": "q_service",
                        "type": "rating_scale",
                        "text": "How would you rate our customer service?",
                        "required": True,
                        "data_type": "scale",
                        "options": [
                            {"id": "s_1", "text": "1 - Poor", "value": "1"},
                            {"id": "s_2", "text": "2", "value": "2"},
                            {"id": "s_3", "text": "3", "value": "3"},
                            {"id": "s_4", "text": "4", "value": "4"},
                            {"id": "s_5", "text": "5 - Excellent", "value": "5"}
                        ],
                        "order": 2
                    }
                ]
            },
            {
                "id": "sec_feedback",
                "title": "Open Feedback",
                "description": "Share your thoughts with us",
                "order": 2,
                "questions": [
                    {
                        "id": "q_improve",
                        "type": "open_ended",
                        "text": "What can we do to improve?",
                        "required": False,
                        "data_type": "nominal",
                        "options": [],
                        "order": 0
                    },
                    {
                        "id": "q_like",
                        "type": "open_ended",
                        "text": "What do you like most about our product/service?",
                        "required": False,
                        "data_type": "nominal",
                        "options": [],
                        "order": 1
                    }
                ]
            }
        ]
    },
    {
        "id": "template_brand_perception_1",
        "name": "Brand Perception Survey",
        "description": "Understand how customers perceive your brand attributes and positioning",
        "survey_type": "perception",
        "is_public": True,
        "usage_count": 0,
        "tags": ["brand", "perception", "awareness", "attributes"],
        "created_by": "system",
        "sections": [
            {
                "id": "sec_awareness",
                "title": "Brand Awareness",
                "description": "Testing brand recognition and recall",
                "order": 0,
                "questions": [
                    {
                        "id": "q_unaided",
                        "type": "open_ended",
                        "text": "When you think of [product category], which brands come to mind? (List all that you can think of)",
                        "description": "Unaided awareness test",
                        "required": True,
                        "data_type": "nominal",
                        "options": [],
                        "order": 0
                    },
                    {
                        "id": "q_aided",
                        "type": "multiple_choice_multiple",
                        "text": "Which of the following brands have you heard of? (Select all that apply)",
                        "description": "Aided awareness test",
                        "required": True,
                        "data_type": "nominal",
                        "options": [
                            {"id": "brand_yours", "text": "Your Brand", "value": "yours"},
                            {"id": "brand_comp1", "text": "Competitor 1", "value": "comp1"},
                            {"id": "brand_comp2", "text": "Competitor 2", "value": "comp2"},
                            {"id": "brand_comp3", "text": "Competitor 3", "value": "comp3"},
                            {"id": "brand_comp4", "text": "Competitor 4", "value": "comp4"}
                        ],
                        "order": 1
                    }
                ]
            },
            {
                "id": "sec_attributes",
                "title": "Brand Attributes",
                "description": "How do you perceive our brand?",
                "order": 1,
                "questions": [
                    {
                        "id": "q_attr_quality",
                        "type": "rating_scale",
                        "text": "Our brand represents high quality",
                        "required": True,
                        "data_type": "scale",
                        "options": [
                            {"id": "attr_1", "text": "1 - Strongly Disagree", "value": "1"},
                            {"id": "attr_2", "text": "2", "value": "2"},
                            {"id": "attr_3", "text": "3 - Neutral", "value": "3"},
                            {"id": "attr_4", "text": "4", "value": "4"},
                            {"id": "attr_5", "text": "5 - Strongly Agree", "value": "5"}
                        ],
                        "order": 0
                    },
                    {
                        "id": "q_attr_innovation",
                        "type": "rating_scale",
                        "text": "Our brand is innovative and forward-thinking",
                        "required": True,
                        "data_type": "scale",
                        "options": [
                            {"id": "inn_1", "text": "1 - Strongly Disagree", "value": "1"},
                            {"id": "inn_2", "text": "2", "value": "2"},
                            {"id": "inn_3", "text": "3 - Neutral", "value": "3"},
                            {"id": "inn_4", "text": "4", "value": "4"},
                            {"id": "inn_5", "text": "5 - Strongly Agree", "value": "5"}
                        ],
                        "order": 1
                    },
                    {
                        "id": "q_attr_trust",
                        "type": "rating_scale",
                        "text": "Our brand is trustworthy and reliable",
                        "required": True,
                        "data_type": "scale",
                        "options": [
                            {"id": "trust_1", "text": "1 - Strongly Disagree", "value": "1"},
                            {"id": "trust_2", "text": "2", "value": "2"},
                            {"id": "trust_3", "text": "3 - Neutral", "value": "3"},
                            {"id": "trust_4", "text": "4", "value": "4"},
                            {"id": "trust_5", "text": "5 - Strongly Agree", "value": "5"}
                        ],
                        "order": 2
                    }
                ]
            }
        ]
    }
]

async def seed_templates():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.get_database()
    
    print("Seeding survey templates...")
    
    for template in TEMPLATES:
        template['created_at'] = datetime.now(timezone.utc).isoformat()
        
        # Check if exists
        existing = await db.survey_templates.find_one({"id": template['id']})
        if existing:
            print(f"  Template '{template['name']}' already exists, skipping...")
            continue
        
        await db.survey_templates.insert_one(template)
        print(f"  ✅ Created template: {template['name']}")
    
    print(f"\n✅ Seeding complete! {len(TEMPLATES)} templates ready.")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_templates())
