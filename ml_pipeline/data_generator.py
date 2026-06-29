import pandas as pd
import numpy as np
import os

def generate_dataset(num_records=500, filepath='task_history.csv'):
    np.random.seed(42)
    
    # Task descriptions choices
    descriptions = [
        "Setup DB schema and migrations",
        "Implement OAuth authentication flow",
        "Deploy to AWS EC2 production instance",
        "Write unit tests for checkout backend",
        "Optimize SQL queries on core tables",
        "Build dashboard landing screen",
        "Fix memory leak on web sockets",
        "Configure Docker containers and compose",
        "Integrate Stripe payments API",
        "Refactor legacy state management",
        "Audit cloud security logs",
        "Design wireframes for user profile view",
        "Seed PostgreSQL databases",
        "Setup CI/CD pipeline with GitHub Actions",
        "Implement voice-to-text transcription",
        "Calibrate LLM parameter temperature",
        "Write documentation for API endpoints",
        "Create custom report exporter",
        "Debug CSS layout alignment bugs",
        "Build real-time notification alerts"
    ]
    
    data = []
    
    for i in range(num_records):
        desc = np.random.choice(descriptions)
        priority = np.random.choice(['critical', 'normal', 'deferred'], p=[0.25, 0.55, 0.20])
        difficulty = np.random.randint(1, 11) # 1 to 10
        impact = np.random.randint(1, 11) # 1 to 10
        
        # Duration estimates in hours (1h to 40h)
        est_hours = np.random.exponential(scale=6.0)
        est_hours = np.clip(est_hours, 1.0, 40.0)
        
        # Postponed count (0 to 5)
        postponed = np.random.choice([0, 1, 2, 3, 4, 5], p=[0.5, 0.25, 0.12, 0.08, 0.03, 0.02])
        
        # Days to deadline (0 to 14)
        days_to_deadline = np.random.exponential(scale=4.0)
        days_to_deadline = np.clip(days_to_deadline, 0.1, 14.0)
        
        # Status
        status = np.random.choice(['Completed', 'Pending', 'Not Completed'], p=[0.70, 0.20, 0.10])
        
        # Actual duration (for pending/not completed, actual_duration might be less than estimated so far)
        if status == 'Completed':
            # completed tasks might have taken more or less time
            efficiency = np.random.normal(loc=1.0, scale=0.25)
            actual_hours = est_hours * efficiency
            is_overdue = 1 if (actual_hours / 24.0) > days_to_deadline else 0
        elif status == 'Pending':
            # still in progress, spent some time
            actual_hours = est_hours * np.random.uniform(0.1, 0.8)
            is_overdue = 1 if (actual_hours / 24.0) > days_to_deadline else 0
        else:
            # not completed, elapsed some time but abandoned or paused
            actual_hours = est_hours * np.random.uniform(0.5, 1.5)
            is_overdue = 1 if (actual_hours / 24.0) > days_to_deadline else 0
            
        actual_hours = np.clip(actual_hours, 0.5, 80.0)
        
        # Calculations for productivity score
        # Baseline score starts at 6.0
        score = 6.0
        
        # Impact of completion status
        if status == 'Completed':
            score += 2.0
            if actual_hours <= est_hours:
                score += 1.0 # bonus for finishing ahead of schedule
            else:
                score -= (actual_hours - est_hours) * 0.15 # penalty for delay
        elif status == 'Not Completed':
            score -= 2.5
        else:
            score -= 0.5
            
        # Overdue penalty
        if is_overdue == 1:
            score -= 1.5
            
        # Procrastination penalties
        score -= postponed * 0.4
        
        # High impact bonus
        score += (impact / 10.0) * 1.2
        
        # Complexity interactions
        if status == 'Completed':
            score += (difficulty / 10.0) * 0.8 # completing hard tasks shows high capability
        else:
            score -= (difficulty / 10.0) * 1.0 # failing or dragging complex tasks shows low progress
            
        # Add random noise
        score += np.random.normal(loc=0.0, scale=0.4)
        
        # Clamp productivity score between 0.0 and 10.0
        score = np.clip(score, 0.0, 10.0)
        score = round(score, 2)
        
        # Timestamps representation
        now = pd.Timestamp.now() - pd.Timedelta(days=np.random.randint(1, 60))
        start_ts = now.isoformat()
        end_ts = (now + pd.Timedelta(hours=actual_hours)).isoformat() if status == 'Completed' else ""
        deadline_ts = (now + pd.Timedelta(days=days_to_deadline)).isoformat()
        
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
            'status': status,
            'start_timestamp': start_ts,
            'completion_timestamp': end_ts,
            'deadline_timestamp': deadline_ts,
            'productivity_score': score
        })
        
    df = pd.DataFrame(data)
    
    # Save file
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    df.to_csv(filepath, index=False)
    print(f"Dataset generated successfully at {filepath}. Shape: {df.shape}")

if __name__ == '__main__':
    generate_dataset(filepath='ml_pipeline/task_history.csv')
