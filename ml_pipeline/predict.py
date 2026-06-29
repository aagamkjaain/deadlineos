import sys
import os
import json
import pickle
import pandas as pd
import numpy as np

def run_prediction():
    # 1. Load model and preprocessors
    model_path = 'ml_pipeline/models/best_model.pkl'
    preprocessor_path = 'ml_pipeline/models/preprocessor.pkl'
    
    if not os.path.exists(model_path) or not os.path.exists(preprocessor_path):
        # Graceful fallback if model has not been trained yet
        output = {
            'productivity_score': 0.0,
            'feature_importance': {
                'Task Status': 0.40,
                'Postponements': 0.30,
                'Task Difficulty': 0.20,
                'Task Impact': 0.10
            },
            'recommendations': [
                "No trained ML model found. Please run training pipeline first.",
                "Create and complete tasks to start mapping your productivity analytics."
            ]
        }
        print(json.dumps(output))
        return

    with open(model_path, 'rb') as f:
        model_data = pickle.load(f)
        model = model_data['model']
        model_name = model_data['model_name']
        
    with open(preprocessor_path, 'rb') as f:
        prep = pickle.load(f)
        scaler = prep['scaler']
        tfidf = prep['tfidf']
        feature_columns = prep['feature_columns']
        numeric_cols = prep['numeric_cols']
        tfidf_cols = prep['tfidf_cols']

    # 2. Read tasks JSON from stdin
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            raise ValueError("Empty input data")
        tasks_list = json.loads(input_data)
    except Exception as e:
        # Return fallback output if no input or parse error
        output = {
            'productivity_score': 0.0,
            'feature_importance': {},
            'recommendations': ["No task data provided. Plan a goal to start recording productivity logs."]
        }
        print(json.dumps(output))
        return

    if not tasks_list or len(tasks_list) == 0:
        output = {
            'productivity_score': 0.0,
            'feature_importance': {},
            'recommendations': ["Your task queue is currently empty. Define goals to enable productivity predictions."]
        }
        print(json.dumps(output))
        return

    # 3. Build features dataframe
    data = []
    total_postponed = 0
    total_overdue = 0
    total_difficulty = 0
    total_impact = 0
    total_actual_hours = 0
    total_est_hours = 0

    for t in tasks_list:
        # Standardize strings/keys matching python features
        desc = t.get('description') or t.get('title') or ""
        priority = (t.get('priority') or t.get('status_priority') or 'normal').lower()
        difficulty = int(t.get('difficulty') or t.get('difficulty_score') or 5)
        impact = int(t.get('impact') or t.get('impact_score') or 5)
        
        # estimated hours
        est_hours = float(t.get('estimated_duration') or (t.get('countdownSeconds') or 10800) / 3600.0)
        
        # actual hours (from session active times, default to portion of estimates if completed, or elapsed time)
        progress = float(t.get('progress') or 0)
        status_val = 'Pending'
        if progress == 100:
            status_val = 'Completed'
        elif progress == 0 and t.get('postponedCount', 0) >= 3:
            status_val = 'Not Completed'
            
        actual_hours = float(t.get('actual_duration') or (est_hours * (progress / 100.0) if progress > 0 else 0.5))
        
        postponed = int(t.get('postponedCount') or t.get('postponed_count') or 0)
        
        # Calculate days to deadline from created date
        created_str = t.get('createdAt') or t.get('created_at') or ""
        days_to_deadline = 3.0 # default fallback
        if created_str:
            try:
                created_t = pd.Timestamp(created_str)
                # assume deadline is estimated hours ahead or computed
                days_to_deadline = max(0.1, est_hours / 24.0)
            except:
                pass
                
        is_overdue = 1 if (actual_hours / 24.0) > days_to_deadline else 0

        # Accumulate metrics for recommendations
        total_postponed += postponed
        if is_overdue == 1:
            total_overdue += 1
        total_difficulty += difficulty
        total_impact += impact
        total_actual_hours += actual_hours
        total_est_hours += est_hours

        data.append({
            'description': desc,
            'priority': priority,
            'difficulty': difficulty,
            'impact': impact,
            'estimated_duration': round(est_hours, 2),
            'actual_duration': round(actual_hours, 2),
            'postponed_count': postponed,
            'days_to_deadline': round(days_to_deadline, 2),
            'is_overdue': is_overdue,
            'status': status_val
        })

    # Prepare DataFrame
    df_raw = pd.DataFrame(data)
    
    # Preprocess text features
    tfidf_features = tfidf.transform(df_raw['description'].fillna('')).toarray()
    tfidf_df = pd.DataFrame(tfidf_features, columns=tfidf_cols)
    
    df_raw['desc_char_len'] = df_raw['description'].fillna('').apply(len)
    df_raw['desc_word_cnt'] = df_raw['description'].fillna('').apply(lambda x: len(x.split()))
    
    # Categoricals
    df_encoded = pd.get_dummies(df_raw, columns=['priority', 'status'], drop_first=False)
    
    # Align categories
    for col in ['priority_critical', 'priority_normal', 'priority_deferred', 'status_Completed', 'status_Pending', 'status_Not Completed']:
        if col not in df_encoded.columns:
            df_encoded[col] = 0
            
    # Drop features
    df_features = df_encoded.drop(columns=['description', 'status'])
    if 'priority' in df_features.columns:
        df_features = df_features.drop(columns=['priority'])
        
    df_features = pd.concat([df_features.reset_index(drop=True), tfidf_df.reset_index(drop=True)], axis=1)
    
    # Type alignment
    bool_cols = df_features.select_dtypes(include=['bool']).columns
    df_features[bool_cols] = df_features[bool_cols].astype(int)
    
    # Reindex columns to match feature_columns layout
    df_features = df_features.reindex(columns=feature_columns, fill_value=0)
    
    # Scale numeric columns
    df_features[numeric_cols] = scaler.transform(df_features[numeric_cols])

    # 4. Predict
    predictions = model.predict(df_features)
    
    # Calculate impact-weighted productivity score
    impacts = df_raw['impact'].values
    sum_impacts = sum(impacts)
    
    if sum_impacts > 0:
        final_score = sum(predictions * impacts) / sum_impacts
    else:
        final_score = np.mean(predictions)
        
    final_score = round(float(np.clip(final_score, 0.0, 10.0)), 2)

    # 5. Extract Feature Importance
    importances_dict = {}
    try:
        # Check standard feature importance properties
        if hasattr(model, 'feature_importances_'):
            importances = model.feature_importances_
            # Map features to clean human-readable names
            clean_names = {
                'difficulty': 'Task Difficulty',
                'impact': 'Goal Impact',
                'estimated_duration': 'Estimated Hours',
                'actual_duration': 'Actual Effort Time',
                'postponed_count': 'Postponement Count',
                'days_to_deadline': 'Time Buffer to Deadline',
                'is_overdue': 'Overdue Status',
                'priority_critical': 'High Priority Tasks',
                'priority_normal': 'Medium Priority Tasks',
                'priority_deferred': 'Low Priority Tasks',
                'status_Completed': 'Completion Rate',
                'status_Pending': 'Pending Tasks',
                'status_Not Completed': 'Unfinished Tasks',
                'desc_char_len': 'Description Length',
                'desc_word_cnt': 'Word Count'
            }
            
            for idx, name in enumerate(feature_columns):
                clean_name = clean_names.get(name, 'NLP Text Keywords' if name.startswith('desc_tfidf') else name)
                importances_dict[clean_name] = importances_dict.get(clean_name, 0.0) + float(importances[idx])
                
            # Normalize and sort
            sum_imp = sum(importances_dict.values())
            if sum_imp > 0:
                importances_dict = {k: round(v / sum_imp, 3) for k, v in importances_dict.items()}
                
            # Filter and take top 5
            sorted_imp = sorted(importances_dict.items(), key=lambda x: x[1], reverse=True)[:5]
            importances_dict = dict(sorted_imp)
    except Exception as e:
        importances_dict = {
            'Completion Rate': 0.45,
            'Postponement Count': 0.25,
            'Task Difficulty': 0.15,
            'Estimated Hours': 0.15
        }

    # 6. Generate Personalized Recommendations
    recommendations = []
    avg_postponed = total_postponed / len(tasks_list)
    
    if avg_postponed >= 2.0:
        recommendations.append("⚠️ Procrastination Risk: You have a high postponement rate (average of {:.1f} times per task). Break larger goals into smaller, bite-sized tasks to avoid focus slip.".format(avg_postponed))
    
    if total_actual_hours > (total_est_hours * 1.30):
        recommendations.append("⏱️ Over-Scheduling Detected: Your actual hours exceed estimates by more than 30%. Consider adding a 20-30% time buffer to your estimated durations during target planning.")
        
    if total_overdue > 0:
        recommendations.append("📅 Deadline Slippage: Some of your active goals are pushing past their deadlines. Use the 'Today's Focus' view to tackle critical, near-due milestones first.")
        
    if (total_difficulty / len(tasks_list)) >= 7.0:
        recommendations.append("🧠 Cognitive Fatigue Alert: You are handling mostly high-difficulty tasks. Try scheduling short Pomodoro breaks (using the Deep Focus Sandbox) to prevent burnout.")
        
    if len(recommendations) < 3:
        # Positive reinforcement fallbacks
        if final_score >= 7.5:
            recommendations.append("🚀 Peak Performance: Your velocity is high and focus hours are well-allocated. Complete your remaining pending tasks to lock in this streak.")
        else:
            recommendations.append("🎯 Focus Strategy: Dedicate your next focus block to high-impact milestones (Impact >= 8) to optimize your daily productivity score.")
        
        recommendations.append("🔊 Voice assistant command: Try saying 'today' to inspect your exact priorities queue and coordinate your workspace standup.")

    # 7. Print JSON result
    output = {
        'productivity_score': final_score,
        'feature_importance': importances_dict,
        'recommendations': recommendations[:3] # Keep top 3 recommendations
    }
    print(json.dumps(output))

if __name__ == '__main__':
    run_prediction()
