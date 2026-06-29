import pandas as pd
import numpy as np
import os
import json
import pickle

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

# Try to import catboost gracefully
has_catboost = False
try:
    from catboost import CatBoostRegressor
    has_catboost = True
except ImportError:
    print("Warning: CatBoost is not installed. Skipping CatBoost training.")

def train_and_select_best_model():
    dataset_path = 'ml_pipeline/task_history.csv'
    
    # 1. Check if dataset exists, if not generate it
    if not os.path.exists(dataset_path):
        print(f"Dataset {dataset_path} not found. Generating a new synthetic dataset...")
        from data_generator import generate_dataset
        generate_dataset(filepath=dataset_path)
        
    df = pd.read_csv(dataset_path)
    
    # 2. Feature Engineering
    # A. Text features from description
    tfidf = TfidfVectorizer(max_features=10, stop_words='english')
    tfidf_features = tfidf.fit_transform(df['description'].fillna('')).toarray()
    tfidf_cols = [f'desc_tfidf_{i}' for i in range(tfidf_features.shape[1])]
    tfidf_df = pd.DataFrame(tfidf_features, columns=tfidf_cols)
    
    df['desc_char_len'] = df['description'].fillna('').apply(len)
    df['desc_word_cnt'] = df['description'].fillna('').apply(lambda x: len(x.split()))
    
    # B. One-hot encoding for categoricals
    df_encoded = pd.get_dummies(df, columns=['priority', 'status'], drop_first=False)
    
    # Fill in any missing category columns to guarantee standard schemas
    for col in ['priority_critical', 'priority_normal', 'priority_deferred', 'status_Completed', 'status_Pending', 'status_Not Completed']:
        if col not in df_encoded.columns:
            df_encoded[col] = 0
            
    # C. Drop raw identifiers and original texts
    features_to_drop = [
        'description', 
        'start_timestamp', 
        'completion_timestamp', 
        'deadline_timestamp', 
        'productivity_score'
    ]
    
    X = df_encoded.drop(columns=features_to_drop)
    y = df_encoded['productivity_score']
    
    # Merge TF-IDF features
    X = pd.concat([X.reset_index(drop=True), tfidf_df.reset_index(drop=True)], axis=1)
    
    # Align boolean types to int
    bool_cols = X.select_dtypes(include=['bool']).columns
    X[bool_cols] = X[bool_cols].astype(int)
    
    # Save the feature columns listing so predictor can align columns exactly
    feature_columns = list(X.columns)
    
    # 3. Train-Test Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Scale numeric features
    scaler = StandardScaler()
    numeric_cols = ['difficulty', 'impact', 'estimated_duration', 'actual_duration', 'postponed_count', 'days_to_deadline', 'desc_char_len', 'desc_word_cnt']
    X_train[numeric_cols] = scaler.fit_transform(X_train[numeric_cols])
    X_test[numeric_cols] = scaler.transform(X_test[numeric_cols])
    
    # Save preprocessors
    os.makedirs('ml_pipeline/models', exist_ok=True)
    with open('ml_pipeline/models/preprocessor.pkl', 'wb') as f:
        pickle.dump({
            'scaler': scaler,
            'tfidf': tfidf,
            'feature_columns': feature_columns,
            'numeric_cols': numeric_cols,
            'tfidf_cols': tfidf_cols
        }, f)
        
    # 4. Train Models
    models = {
        'Random Forest': RandomForestRegressor(n_estimators=100, random_state=42),
        'XGBoost': XGBRegressor(n_estimators=100, learning_rate=0.08, max_depth=4, random_state=42),
        'LightGBM': LGBMRegressor(n_estimators=100, learning_rate=0.08, max_depth=4, random_state=42, verbose=-1)
    }
    
    if has_catboost:
        models['CatBoost'] = CatBoostRegressor(iterations=100, learning_rate=0.08, depth=4, verbose=0, random_state=42)
        
    metrics = {}
    best_model_name = None
    best_mae = float('inf')
    best_model_object = None
    
    print("\n--- Training Regression Models ---")
    for name, model in models.items():
        # Fit model
        model.fit(X_train, y_train)
        
        # Predict & Evaluate
        y_pred = model.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)
        
        metrics[name] = {
            'MAE': round(float(mae), 4),
            'RMSE': round(float(rmse), 4),
            'R2': round(float(r2), 4)
        }
        
        print(f"{name} -> MAE: {mae:.4f} | RMSE: {rmse:.4f} | R2: {r2:.4f}")
        
        # Select best model based on MAE
        if mae < best_mae:
            best_mae = mae
            best_model_name = name
            best_model_object = model
            
    print(f"\nWinner: {best_model_name} with MAE: {best_mae:.4f}")
    
    # Serialize the winner model
    with open('ml_pipeline/models/best_model.pkl', 'wb') as f:
        pickle.dump({
            'model_name': best_model_name,
            'model': best_model_object
        }, f)
        
    # Save metrics JSON documentation
    with open('ml_pipeline/metrics.json', 'w') as f:
        json.dump(metrics, f, indent=2)
        
    print("Preprocessors, Winner Model, and Evaluation metrics saved successfully.")

if __name__ == '__main__':
    train_and_select_best_model()
