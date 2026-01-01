# AI System Quick Reference Card

## 🚀 Quick Start

```bash
cd docs
python -m learning.worker
```

## 📊 Check Training Status

```python
from learning.worker import A2CLearner

learner = A2CLearner(
    use_advanced_network=True,
    use_curriculum=True,
    use_priority_replay=True
)

# Get curriculum info
stage_info = learner.curriculum.get_stage_info()
print(f"Stage: {stage_info['stage']} ({stage_info['progress_pct']:.1f}%)")

# Get metrics
summary = learner.evaluator.get_summary()
print(f"Win rate: {summary['win_rate']:.1%}")
print(f"Multi-captures: {summary['multi_captures']}")
```

## 🎯 Curriculum Stages

| Stage | Games | Focus | Reward Multiplier |
|-------|-------|-------|-------------------|
| basic_captures | 0-100 | Single captures | 2.0x captures |
| multi_capture_chains | 100-300 | Capture sequences | 2.5x multi-captures |
| defensive_positioning | 300-600 | Formation strength | 2.0x cohesion/support |
| king_endgames | 600-1000 | King tactics | 2.0x king activity |
| mastery | 1000+ | Balanced play | No multipliers |

## 💡 Reward Structure Summary

### Tier 1: Material & Captures
- Multi-capture: `0.2×n + 0.05×(n-1)²` (quadratic)
- Single capture: `+0.08`

### Tier 2: Positional
- Gap closure: `+0.03` per gap filled
- Cohesion: `+0.04` per improvement
- Support: `+0.02` per supported piece

### Tier 3: King Rewards
- Promotion: `+0.12 × (1 + 1/pieces)`
- King threat: `-0.15` per threat
- King loss: `-0.25` per loss

### Tier 4: Defense
- Isolation: `-0.05` per isolated piece
- Back rank violation: `-0.20`

### Tier 5: Tempo
- Mobility reduction: `+0.01` per move restricted

### Tier 6: Phase-Aware
- Opening: `+0.02` per back rank piece
- Endgame: `+0.03` per active king

## 🔧 Configuration Options

```python
learner = A2CLearner(
    # Network
    use_advanced_network=True,    # 5 ResBlocks + Attention
    
    # Learning strategy
    use_curriculum=True,           # Progressive stages
    use_priority_replay=True,      # Important moves first
    
    # Hyperparameters
    learning_rate=1e-4,            # Adam learning rate
    gamma=0.99,                    # Discount factor
    batch_size=64,                 # Training batch size
    
    # Stability
    max_loss_threshold=10.0,       # Auto-pause if exceeded
    max_grad_norm=0.5              # Gradient clipping
)
```

## 📈 Self-Play Generation

```python
from learning.selfplay import SelfPlayGenerator

generator = SelfPlayGenerator(learner.replay_buffer)
games = generator.generate_games(
    num_games=100,
    max_moves=200,
    exploration_epsilon=0.3
)
```

## 🎲 Adaptive Exploration

Automatic adjustment based on:
- **Time decay:** `0.995^steps`
- **Performance:** 1.5x if struggling, 0.7x if dominating
- **Curriculum:** 1.5x early stages, 0.6x at mastery

Current epsilon range: **0.01 to 0.30**

## 🏆 Expected Performance

| Games | Win Rate | Behavior |
|-------|----------|----------|
| 0-100 | 30% | Learning basics |
| 100-300 | 40-50% | Multi-captures |
| 300-600 | 50-60% | Solid defense |
| 600-1000 | 60-70% | King tactics |
| 1000+ | 70-85% | Strategic mastery |

## 🔍 Monitoring Console Output

```
Training iteration 42:
  Total loss: 0.4521             # Combined loss
  Policy loss: 0.2134            # Action selection
  Value loss: 0.1987             # Position evaluation
  Entropy: 1.2345                # Exploration level
  Material loss: 0.0234          # Auxiliary: material prediction
  Threat loss: 0.0166            # Auxiliary: threat detection
  Curriculum stage: defensive_positioning
  Stage progress: 64.2%
  Avg recent loss: 0.4523
```

## ⚡ Priority Values

Use when recording trajectories:

```python
replay_buffer.add_trajectory(
    ...,
    priority=2.0  # Multi-capture
)
```

| Move Type | Priority |
|-----------|----------|
| Normal move | 1.0 |
| Single capture | 1.5 |
| Multi-capture (2+) | 2.0-5.0 |
| Game-winning move | 3.0 |
| Critical defense | 2.0 |

## 🛠️ Troubleshooting

### Database Schema Error
```bash
rm data/replay_buffer.db
# Restart worker - DB recreated with new schema
```

### Model Architecture Mismatch
```bash
rm checkpoints/model.pth
# Fresh start with advanced network
```

### Import Errors
Check files exist:
- `docs/learning/curriculum.py`
- `docs/learning/evaluator.py`
- `docs/learning/selfplay.py`

## 📦 New Files Added

```
docs/
├── learning/
│   ├── curriculum.py       # Curriculum + exploration
│   ├── evaluator.py        # Performance metrics
│   └── selfplay.py         # Self-play generation
├── AI_UPGRADE_SUMMARY.md   # Full documentation
└── (updated files)
    ├── api/ai.py           # Enhanced rewards
    ├── model/network.py    # Advanced architecture
    ├── model/replay_buffer.py  # Priority replay
    └── learning/worker.py  # Enhanced A2C
```

## 🎯 Key Metrics to Track

1. **Win rate trend** (improving/stable/declining)
2. **Multi-capture rate** (should increase over time)
3. **Avg cohesion** (0.0-1.0, higher = better formation)
4. **Curriculum stage** (progressing through stages)
5. **Policy entropy** (decreases as AI becomes more confident)

## 💾 Export Metrics

```python
learner.evaluator.export_metrics("training_metrics.json")
```

Contains:
- Complete training history
- Performance snapshots
- Tactical statistics
- Strategic metrics
- Learning progress

---

**Version:** 2.0  
**Last Updated:** 2025-12-31  
**Status:** All features implemented ✅
