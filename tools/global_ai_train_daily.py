import json
import os
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import requests

"""Global AI daily training (TF.js).

Runs in GitHub Actions on a daily schedule.

Pipeline:
1) Fetch recent game logs from Supabase (last 24h)
2) Build a supervised dataset (state -> chosen move)
3) Train a small CNN policy network
4) Export to TF.js format
5) Upload TF.js model files + a latest.json manifest to Supabase Storage
"""


@dataclass
class Env:
    supabase_url: str
    service_role_key: str
    bucket: str
    days_back: int
    max_steps: int
    epochs: int
    batch_size: int


def _require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing required env var: {name}")
    return v


def _supabase_headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
    }


def fetch_game_logs(env: Env) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=env.days_back)
    since_iso = since.isoformat()

    # PostgREST endpoint
    url = env.supabase_url.rstrip("/") + "/rest/v1/game_logs"
    params = {
        "select": "id,created_at,game_id,winner,trajectory,total_moves,duration_seconds",
        "created_at": f"gte.{since_iso}",
        "order": "created_at.desc",
        "limit": "2000",
    }

    r = requests.get(url, headers=_supabase_headers(env.service_role_key), params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        return []
    return data


def build_dataset(game_logs: list[dict[str, Any]], env: Env) -> tuple[np.ndarray, np.ndarray]:
    repo_root = Path(__file__).resolve().parents[1]
    docs_dir = repo_root / "docs"
    sys.path.insert(0, str(docs_dir))

    from model.encoder import encode_state, encode_move  # type: ignore

    x_list: list[np.ndarray] = []
    y_list: list[int] = []

    steps_used = 0
    for log in game_logs:
        traj = log.get("trajectory")
        if not isinstance(traj, list):
            continue

        for step in traj:
            if steps_used >= env.max_steps:
                break
            if not isinstance(step, dict):
                continue

            board = step.get("board_state")
            action = step.get("action")
            if board is None or not isinstance(action, dict):
                continue

            fr = action.get("from")
            to = action.get("to")
            if (
                not isinstance(fr, list)
                or not isinstance(to, list)
                or len(fr) != 2
                or len(to) != 2
            ):
                continue

            try:
                state = encode_state(board)  # (5,10,10)
                idx = encode_move(int(fr[0]), int(fr[1]), int(to[0]), int(to[1]))
            except Exception:
                continue

            if idx < 0 or idx >= 2500:
                continue

            # TF.js model will use channels-last: (10,10,5)
            state_cl = np.transpose(state, (1, 2, 0)).astype(np.float32)
            x_list.append(state_cl)
            y_list.append(int(idx))
            steps_used += 1

        if steps_used >= env.max_steps:
            break

    if not x_list:
        return np.zeros((0, 10, 10, 5), dtype=np.float32), np.zeros((0,), dtype=np.int32)

    x = np.stack(x_list, axis=0)
    y = np.asarray(y_list, dtype=np.int32)
    return x, y


def train_tfjs_policy_model(x: np.ndarray, y: np.ndarray, env: Env):
    import tensorflow as tf

    tf.random.set_seed(123)

    inputs = tf.keras.Input(shape=(10, 10, 5), name="state")
    z = tf.keras.layers.Conv2D(64, 3, padding="same", activation="relu")(inputs)
    z = tf.keras.layers.Conv2D(64, 3, padding="same", activation="relu")(z)
    z = tf.keras.layers.Flatten()(z)
    z = tf.keras.layers.Dense(256, activation="relu")(z)
    policy = tf.keras.layers.Dense(2500, activation="softmax", name="policy")(z)
    model = tf.keras.Model(inputs=inputs, outputs=policy)

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(),
        metrics=["sparse_categorical_accuracy"],
    )

    if len(x) > 0:
        model.fit(
            x,
            y,
            epochs=env.epochs,
            batch_size=env.batch_size,
            shuffle=True,
            verbose=2,
        )

    return model


def export_tfjs(model, out_dir: Path) -> None:
    import tensorflowjs as tfjs

    out_dir.mkdir(parents=True, exist_ok=True)
    tfjs.converters.save_keras_model(model, str(out_dir))


def upload_storage_file(env: Env, local_path: Path, storage_path: str, content_type: str) -> None:
    url = env.supabase_url.rstrip("/") + f"/storage/v1/object/{env.bucket}/{storage_path.lstrip('/')}"
    headers = _supabase_headers(env.service_role_key)
    headers["content-type"] = content_type
    headers["x-upsert"] = "true"
    with local_path.open("rb") as f:
        r = requests.post(url, headers=headers, data=f, timeout=120)
        r.raise_for_status()


def public_object_url(env: Env, storage_path: str) -> str:
    base = env.supabase_url.rstrip("/")
    return f"{base}/storage/v1/object/public/{env.bucket}/{storage_path.lstrip('/')}"


def main() -> int:
    try:
        env = Env(
            supabase_url=_require_env("SUPABASE_URL"),
            service_role_key=_require_env("SUPABASE_SERVICE_ROLE_KEY"),
            bucket=os.getenv("SUPABASE_STORAGE_BUCKET", "models"),
            days_back=int(os.getenv("GLOBAL_AI_DAYS_BACK", "1")),
            max_steps=int(os.getenv("GLOBAL_AI_MAX_STEPS", "20000")),
            epochs=int(os.getenv("GLOBAL_AI_EPOCHS", "1")),
            batch_size=int(os.getenv("GLOBAL_AI_BATCH_SIZE", "256")),
        )
    except Exception as e:
        print(str(e))
        return 2

    print("Fetching game logs...")
    logs = fetch_game_logs(env)
    print(f"Fetched {len(logs)} game logs")

    print("Building dataset...")
    x, y = build_dataset(logs, env)
    print(f"Training steps: {len(x)}")
    if len(x) == 0:
        print(
            "No training data found in the last window; publishing a baseline model so the site can load it."
        )

    print("Training model...")
    model = train_tfjs_policy_model(x, y, env)

    version = datetime.now(timezone.utc).strftime("%Y%m%d")
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp) / "tfjs" / "latest"
        export_tfjs(model, out_dir)

        # Upload TF.js files
        # Expected files include model.json and one or more *.bin
        storage_prefix = "tfjs/latest"
        for p in out_dir.iterdir():
            if p.is_dir():
                continue
            ct = "application/json" if p.suffix == ".json" else "application/octet-stream"
            upload_storage_file(env, p, f"{storage_prefix}/{p.name}", ct)

        model_url = public_object_url(env, f"{storage_prefix}/model.json")
        latest_manifest = {
            "version": version,
            "model_url": model_url,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        manifest_path = Path(tmp) / "latest.json"
        manifest_path.write_text(json.dumps(latest_manifest, indent=2), encoding="utf-8")
        upload_storage_file(env, manifest_path, "tfjs/latest.json", "application/json")

        print("Published TF.js model")
        print(f"Manifest: {public_object_url(env, 'tfjs/latest.json')}")
        print(f"Model:    {model_url}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
