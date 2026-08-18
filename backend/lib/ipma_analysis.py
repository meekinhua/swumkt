"""
IPMA (Importance-Performance Map Analysis) Implementation
"""
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timezone


def normalize_scores(scores: np.ndarray) -> np.ndarray:
    """Normalize scores to [0, 100] range"""
    if len(scores) == 0:
        return scores
    
    min_val = scores.min()
    max_val = scores.max()
    
    if max_val == min_val:
        return np.ones_like(scores) * 50.0
    
    normalized = ((scores - min_val) / (max_val - min_val)) * 100
    return normalized


def calculate_performance_scores(
    part_worths: Dict[str, Dict],
    use_max: bool = True
) -> Dict[str, float]:
    """
    Calculate performance scores for each attribute
    
    Performance = วัดจากค่า utility ที่ได้จริง
    - ใช้ max utility ของแต่ละ attribute เป็นตัวแทน performance
    - หรือใช้ mean utility
    
    Args:
        part_worths: Conjoint part-worth utilities
        use_max: Use max utility (True) or mean utility (False)
    
    Returns:
        Dictionary of {attribute_id: performance_score}
    """
    performance = {}
    
    for attr_id, attr_data in part_worths.items():
        levels = attr_data.get("levels", {})
        
        if len(levels) == 0:
            continue
        
        # Extract utilities
        utilities = []
        for level_data in levels.values():
            if isinstance(level_data, dict) and "utility" in level_data:
                utilities.append(level_data["utility"])
        
        if len(utilities) == 0:
            continue
        
        utilities_array = np.array(utilities, dtype=float)
        
        # Calculate performance score
        if use_max:
            # Max utility = best possible performance
            perf_score = utilities_array.max()
        else:
            # Mean utility = average performance
            perf_score = utilities_array.mean()
        
        performance[attr_id] = float(perf_score)
    
    return performance


def determine_quadrant(importance: float, performance: float) -> Dict[str, str]:
    """
    Determine which quadrant the attribute falls into
    
    Quadrants (threshold = 50 on the normalised 0-100 scale, NOT the median):
    - Q1 (High Importance, High Performance): "Maintain" - รักษาระดับ
    - Q2 (High Importance, Low Performance): "Improve" - ต้องปรับปรุงด่วน
    - Q3 (Low Importance, Low Performance): "Low Priority" - ไม่เร่งด่วน
    - Q4 (Low Importance, High Performance): "Overkill" - เกินความจำเป็น
    
    Args:
        importance: Importance score (0-100)
        performance: Performance score (0-100)
    
    Returns:
        Quadrant information
    """
    # Fixed midpoint of the normalised scale. The docstring used to say "median",
    # which it never was — and the distinction matters, because
    # `normalize_scores` rescales on the SAMPLE min/max. An attribute is therefore
    # classified relative to the other attributes IN THIS STUDY, not against any
    # absolute standard: rescaling guarantees at least one attribute at 0 and one
    # at 100, so some attribute always lands in "ต้องปรับปรุงด่วน" even when every
    # attribute performs well. Report the quadrant as a within-study comparison,
    # never as an absolute verdict.
    importance_threshold = 50
    performance_threshold = 50
    
    if importance >= importance_threshold and performance >= performance_threshold:
        return {
            "quadrant": "Q1",
            "name": "Maintain",
            "name_th": "รักษาระดับ",
            "description": "คุณลักษณะที่สำคัญและมีประสิทธิภาพสูง ควรรักษาระดับให้คงที่",
            "action": "✅ Keep up the good work!",
            "color": "green",
            "priority": "medium"
        }
    elif importance >= importance_threshold and performance < performance_threshold:
        return {
            "quadrant": "Q2",
            "name": "Improve",
            "name_th": "ต้องปรับปรุง",
            "description": "คุณลักษณะที่สำคัญแต่ประสิทธิภาพต่ำ ต้องปรับปรุงเป็นอันดับแรก",
            "action": "🔴 Focus here! Critical improvements needed",
            "color": "red",
            "priority": "high"
        }
    elif importance < importance_threshold and performance < performance_threshold:
        return {
            "quadrant": "Q3",
            "name": "Low Priority",
            "name_th": "ไม่เร่งด่วน",
            "description": "คุณลักษณะที่ไม่ค่อยสำคัญและประสิทธิภาพต่ำ อันดับความสำคัญต่ำ",
            "action": "⚪ Monitor but not urgent",
            "color": "gray",
            "priority": "low"
        }
    else:  # Low importance, High performance
        return {
            "quadrant": "Q4",
            "name": "Overkill",
            "name_th": "เกินความจำเป็น",
            "description": "คุณลักษณะที่ไม่ค่อยสำคัญแต่ประสิทธิภาพสูง อาจลดทรัพยากรได้",
            "action": "💡 Consider reallocating resources",
            "color": "blue",
            "priority": "low"
        }


def calculate_action_priority(importance: float, performance: float) -> Tuple[float, str]:
    """
    Calculate action priority score
    
    Priority = Importance * (100 - Performance)
    - สูง = สำคัญมากแต่ทำได้ไม่ดี (ต้องแก้ด่วน)
    - ต่ำ = ไม่สำคัญหรือทำได้ดีแล้ว
    
    Returns:
        (priority_score, priority_level)
    """
    # Gap-based priority
    performance_gap = 100 - performance
    priority_score = (importance / 100) * performance_gap
    
    if priority_score >= 40:
        priority_level = "สูงมาก (Critical)"
    elif priority_score >= 25:
        priority_level = "สูง (High)"
    elif priority_score >= 15:
        priority_level = "ปานกลาง (Medium)"
    else:
        priority_level = "ต่ำ (Low)"
    
    return float(priority_score), priority_level


def analyze_ipma_for_conjoint(
    part_worths: Dict[str, Dict],
    attribute_importance: Dict[str, Dict],
    respondent_count: int
) -> Dict:
    """
    Perform IPMA analysis on conjoint data
    
    Args:
        part_worths: Conjoint part-worth utilities
        attribute_importance: Attribute importance scores
        respondent_count: Number of respondents
    
    Returns:
        IPMA analysis results with quadrant classifications
    """
    # Extract importance scores
    importance_raw = {}
    attribute_names = {}
    
    for attr_id, importance_data in attribute_importance.items():
        if isinstance(importance_data, dict):
            importance_raw[attr_id] = importance_data.get("importance", 0)
            attribute_names[attr_id] = importance_data.get("name", attr_id)
        else:
            importance_raw[attr_id] = importance_data
            # Try to get name from part_worths
            if attr_id in part_worths:
                attribute_names[attr_id] = part_worths[attr_id].get("name", attr_id)
            else:
                attribute_names[attr_id] = attr_id
    
    # Calculate performance scores
    performance_raw = calculate_performance_scores(part_worths, use_max=True)
    
    # Normalize both to 0-100 scale
    importance_values = np.array([importance_raw.get(attr_id, 0) for attr_id in importance_raw.keys()])
    performance_values = np.array([performance_raw.get(attr_id, 0) for attr_id in performance_raw.keys()])
    
    importance_normalized = normalize_scores(importance_values)
    performance_normalized = normalize_scores(performance_values)
    
    # Create results for each attribute
    results = {}
    attr_ids = list(importance_raw.keys())
    
    for i, attr_id in enumerate(attr_ids):
        if attr_id not in performance_raw:
            continue
        
        importance_score = float(importance_normalized[i])
        performance_score = float(performance_normalized[i])
        
        # Determine quadrant
        quadrant_info = determine_quadrant(importance_score, performance_score)
        
        # Calculate action priority
        priority_score, priority_level = calculate_action_priority(importance_score, performance_score)
        
        results[attr_id] = {
            "name": attribute_names.get(attr_id, attr_id),
            "importance": importance_score,
            "performance": performance_score,
            "importance_raw": float(importance_raw.get(attr_id, 0)),
            "performance_raw": float(performance_raw.get(attr_id, 0)),
            "quadrant": quadrant_info["quadrant"],
            "quadrant_name": quadrant_info["name"],
            "quadrant_name_th": quadrant_info["name_th"],
            "quadrant_description": quadrant_info["description"],
            "action": quadrant_info["action"],
            "color": quadrant_info["color"],
            "priority": quadrant_info["priority"],
            "action_priority_score": priority_score,
            "action_priority_level": priority_level
        }
    
    # Sort by action priority (descending)
    sorted_results = dict(sorted(
        results.items(), 
        key=lambda x: x[1]['action_priority_score'], 
        reverse=True
    ))
    
    # Calculate summary statistics
    quadrant_counts = {
        "Q1": sum(1 for r in results.values() if r["quadrant"] == "Q1"),
        "Q2": sum(1 for r in results.values() if r["quadrant"] == "Q2"),
        "Q3": sum(1 for r in results.values() if r["quadrant"] == "Q3"),
        "Q4": sum(1 for r in results.values() if r["quadrant"] == "Q4")
    }
    
    return {
        "attributes": sorted_results,
        "quadrant_counts": quadrant_counts,
        "total_attributes": len(results),
        "respondent_count": respondent_count,
        "thresholds": {
            "importance": 50.0,
            "performance": 50.0
        },
        "method": "Importance-Performance Map Analysis (IPMA)",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
