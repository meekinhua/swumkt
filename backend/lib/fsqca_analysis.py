"""
fsQCA (Fuzzy-Set Qualitative Comparative Analysis) Implementation
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timezone
from itertools import product, combinations


def calibrate_to_fuzzy_set(values: np.ndarray, method: str = 'direct') -> np.ndarray:
    """
    Calibrate raw values to fuzzy-set membership scores [0, 1]
    
    Args:
        values: Array of raw values
        method: 'direct' (percentile-based) or 'logistic'
    
    Returns:
        Fuzzy-set membership scores
    """
    if method == 'direct':
        # Use percentile calibration with three anchors
        # 0.05 (fully out), 0.50 (crossover), 0.95 (fully in)
        p05 = np.percentile(values, 5)
        p50 = np.percentile(values, 50)
        p95 = np.percentile(values, 95)
        
        fuzzy_scores = np.zeros_like(values, dtype=float)
        
        for i, val in enumerate(values):
            if val <= p05:
                fuzzy_scores[i] = 0.0
            elif val >= p95:
                fuzzy_scores[i] = 1.0
            elif val < p50:
                # Linear interpolation between 0 and 0.5
                fuzzy_scores[i] = 0.5 * (val - p05) / (p50 - p05)
            else:
                # Linear interpolation between 0.5 and 1.0
                fuzzy_scores[i] = 0.5 + 0.5 * (val - p50) / (p95 - p50)
        
        # Ensure values are in [0, 1]
        fuzzy_scores = np.clip(fuzzy_scores, 0.0, 1.0)
        
    elif method == 'logistic':
        # Logistic function calibration
        mean = np.mean(values)
        std = np.std(values)
        if std == 0:
            return np.ones_like(values) * 0.5
        
        # S-curve transformation
        z_scores = (values - mean) / std
        fuzzy_scores = 1 / (1 + np.exp(-z_scores))
    
    else:
        # Default: min-max normalization
        min_val, max_val = values.min(), values.max()
        if max_val == min_val:
            return np.ones_like(values) * 0.5
        fuzzy_scores = (values - min_val) / (max_val - min_val)
    
    return fuzzy_scores


def calculate_consistency(subset_membership: np.ndarray, outcome_membership: np.ndarray) -> float:
    """
    Calculate consistency: degree to which cases with condition also have outcome
    
    Consistency = Σ min(Xi, Yi) / Σ Xi
    
    Where:
    - Xi = membership in condition/configuration
    - Yi = membership in outcome
    """
    if subset_membership.sum() == 0:
        return 0.0
    
    numerator = np.minimum(subset_membership, outcome_membership).sum()
    denominator = subset_membership.sum()
    
    consistency = numerator / denominator
    return float(consistency)


def calculate_coverage(subset_membership: np.ndarray, outcome_membership: np.ndarray) -> float:
    """
    Calculate coverage: degree to which condition accounts for outcome
    
    Coverage = Σ min(Xi, Yi) / Σ Yi
    """
    if outcome_membership.sum() == 0:
        return 0.0
    
    numerator = np.minimum(subset_membership, outcome_membership).sum()
    denominator = outcome_membership.sum()
    
    coverage = numerator / denominator
    return float(coverage)


def fuzzy_and(memberships: List[np.ndarray]) -> np.ndarray:
    """Fuzzy AND operation (minimum)"""
    if not memberships:
        return np.array([])
    
    result = memberships[0].copy()
    for membership in memberships[1:]:
        result = np.minimum(result, membership)
    
    return result


def fuzzy_or(memberships: List[np.ndarray]) -> np.ndarray:
    """Fuzzy OR operation (maximum)"""
    if not memberships:
        return np.array([])
    
    result = memberships[0].copy()
    for membership in memberships[1:]:
        result = np.maximum(result, membership)
    
    return result


def fuzzy_not(membership: np.ndarray) -> np.ndarray:
    """Fuzzy NOT operation (complement)"""
    return 1.0 - membership


def create_truth_table(
    conditions: Dict[str, np.ndarray],
    outcome: np.ndarray,
    consistency_threshold: float = 0.75
) -> pd.DataFrame:
    """
    Create truth table for fsQCA analysis
    
    Args:
        conditions: Dictionary of {condition_name: fuzzy_membership_array}
        outcome: Fuzzy membership array for outcome
        consistency_threshold: Minimum consistency for sufficient conditions
    
    Returns:
        DataFrame with truth table
    """
    condition_names = list(conditions.keys())
    n_conditions = len(condition_names)
    
    # Generate all possible configurations (2^n)
    configurations = list(product([0, 1], repeat=n_conditions))
    
    rows = []
    for config in configurations:
        # Calculate membership in this configuration
        config_memberships = []
        config_str = ""
        
        for i, (cond_name, present) in enumerate(zip(condition_names, config)):
            if present:
                config_memberships.append(conditions[cond_name])
                config_str += cond_name
            else:
                config_memberships.append(fuzzy_not(conditions[cond_name]))
                config_str += "~" + cond_name
            
            if i < n_conditions - 1:
                config_str += "*"
        
        # Fuzzy AND of all conditions
        config_membership = fuzzy_and(config_memberships)
        
        # Calculate consistency and coverage
        consistency = calculate_consistency(config_membership, outcome)
        coverage = calculate_coverage(config_membership, outcome)
        
        # Count cases with membership > 0.5
        n_cases = np.sum(config_membership > 0.5)
        
        # Determine if configuration is sufficient
        is_sufficient = consistency >= consistency_threshold and n_cases > 0
        
        rows.append({
            'configuration': config_str,
            'consistency': consistency,
            'coverage': coverage,
            'n_cases': int(n_cases),
            'sufficient': is_sufficient,
            'config_tuple': config
        })
    
    truth_table = pd.DataFrame(rows)
    
    # Sort by consistency (descending)
    truth_table = truth_table.sort_values('consistency', ascending=False)
    
    return truth_table


def find_sufficient_configurations(
    truth_table: pd.DataFrame,
    consistency_threshold: float = 0.75,
    coverage_threshold: float = 0.1,
    condition_names: Dict[str, str] = None
) -> List[Dict]:
    """
    Find configurations that are sufficient for the outcome
    
    Args:
        truth_table: DataFrame with configurations and metrics
        consistency_threshold: Minimum consistency
        coverage_threshold: Minimum coverage
        condition_names: Mapping of condition IDs to readable names
    """
    sufficient = truth_table[
        (truth_table['consistency'] >= consistency_threshold) & 
        (truth_table['coverage'] >= coverage_threshold) &
        (truth_table['n_cases'] > 0)
    ]
    
    results = []
    for _, row in sufficient.iterrows():
        config_str = row['configuration']
        
        # Create readable configuration string
        if condition_names:
            parts = config_str.split('*')
            readable_parts = []
            for part in parts:
                if part.startswith('~'):
                    attr_id = part[1:]
                    attr_name = condition_names.get(attr_id, attr_id)
                    readable_parts.append(f"~{attr_name}")
                else:
                    attr_name = condition_names.get(part, part)
                    readable_parts.append(attr_name)
            readable_config = '*'.join(readable_parts)
        else:
            readable_config = config_str
        
        results.append({
            'configuration': readable_config,
            'raw_configuration': config_str,
            'consistency': float(row['consistency']),
            'coverage': float(row['coverage']),
            'n_cases': int(row['n_cases']),
            'interpretation': interpret_configuration(config_str, condition_names)
        })
    
    return results


def interpret_configuration(config_str: str, condition_names: Dict[str, str] = None) -> str:
    """
    Generate human-readable interpretation of configuration
    
    Args:
        config_str: Boolean expression (e.g., "attr1*~attr2*attr3")
        condition_names: Mapping of condition IDs to readable names
    """
    parts = config_str.split('*')
    
    present = []
    absent = []
    
    for part in parts:
        if part.startswith('~'):
            attr_id = part[1:]
            # Use readable name if available
            attr_name = condition_names.get(attr_id, attr_id) if condition_names else attr_id
            absent.append(attr_name)
        else:
            # Use readable name if available
            attr_name = condition_names.get(part, part) if condition_names else part
            present.append(attr_name)
    
    interpretation = ""
    if present:
        interpretation += f"มี {', '.join(present)}"
    if absent:
        if present:
            interpretation += " และ "
        interpretation += f"ไม่มี {', '.join(absent)}"
    
    return interpretation


def analyze_fsqca_for_conjoint(
    part_worths: Dict[str, Dict],
    attribute_importance: Dict[str, Dict],
    respondent_count: int,
    consistency_threshold: float = 0.75,
    coverage_threshold: float = 0.1
) -> Dict:
    """
    Perform fsQCA analysis on conjoint data
    
    Args:
        part_worths: Conjoint part-worth utilities
        attribute_importance: Attribute importance scores
        respondent_count: Number of respondents
        consistency_threshold: Minimum consistency for sufficiency
        coverage_threshold: Minimum coverage
    
    Returns:
        fsQCA analysis results
    """
    # Prepare conditions (use utility scores as proxies)
    conditions = {}
    condition_names = {}
    
    for attr_id, attr_data in part_worths.items():
        levels = attr_data.get("levels", {})
        attr_name = attr_data.get("name", attr_id)
        
        if len(levels) < 2:
            continue
        
        # Extract utilities
        utilities = []
        for level_data in levels.values():
            if isinstance(level_data, dict) and "utility" in level_data:
                utilities.append(level_data["utility"])
        
        if len(utilities) < 2:
            continue
        
        # Calibrate to fuzzy-set
        utilities_array = np.array(utilities, dtype=float)
        fuzzy_membership = calibrate_to_fuzzy_set(utilities_array, method='direct')
        
        conditions[attr_id] = fuzzy_membership
        condition_names[attr_id] = attr_name
    
    if len(conditions) < 2:
        return {
            'error': 'Insufficient conditions for fsQCA analysis (need at least 2 attributes)',
            'conditions_found': len(conditions)
        }
    
    # Create outcome variable (use maximum utility as "success")
    # Combine all utilities to create outcome measure
    all_utilities = []
    for attr_id, fuzzy_mem in conditions.items():
        all_utilities.extend(fuzzy_mem)
    
    outcome = np.array(all_utilities)
    # Normalize outcome
    if outcome.max() > outcome.min():
        outcome = (outcome - outcome.min()) / (outcome.max() - outcome.min())
    else:
        outcome = np.ones_like(outcome) * 0.5
    
    # Ensure same length
    min_length = min(len(membership) for membership in conditions.values())
    for key in conditions:
        conditions[key] = conditions[key][:min_length]
    outcome = outcome[:min_length]
    
    # Create truth table
    truth_table = create_truth_table(conditions, outcome, consistency_threshold)
    
    # Find sufficient configurations (pass condition names for readable output)
    sufficient_configs = find_sufficient_configurations(
        truth_table, 
        consistency_threshold, 
        coverage_threshold,
        condition_names
    )
    
    # Calculate overall solution consistency and coverage
    if sufficient_configs:
        solution_consistency = np.mean([c['consistency'] for c in sufficient_configs])
        solution_coverage = np.mean([c['coverage'] for c in sufficient_configs])
    else:
        solution_consistency = 0.0
        solution_coverage = 0.0
    
    return {
        'conditions': {
            attr_id: {
                'name': condition_names[attr_id],
                'n_levels': len(part_worths[attr_id].get('levels', {}))
            }
            for attr_id in conditions.keys()
        },
        'sufficient_configurations': sufficient_configs,
        'solution_consistency': float(solution_consistency),
        'solution_coverage': float(solution_coverage),
        'n_configurations': len(sufficient_configs),
        'total_configurations': len(truth_table),
        'respondent_count': respondent_count,
        'thresholds': {
            'consistency': consistency_threshold,
            'coverage': coverage_threshold
        },
        'method': 'Fuzzy-Set Qualitative Comparative Analysis',
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
